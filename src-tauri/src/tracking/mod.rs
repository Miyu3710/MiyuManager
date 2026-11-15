mod engine;
mod store;
mod types;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};

use crate::launcher::process::{
    ProcessJob, foreground_process_id, process_ids_with_name, process_image_path,
};
pub use store::{
    close_open_sessions, create_manual_session, delete_session, finish_session, heartbeat_session,
    list_work_sessions, recover_open_sessions, start_session, stats_overview,
    update_manual_session,
};
pub use types::{
    PlaySessionEvent, PlaySessionWithWork, SessionCreateInput, SessionUpdateInput, StatsOverview,
    StatsPeriod,
};

use engine::{ActivityAccumulator, ActivityState};

const POLL_INTERVAL: Duration = Duration::from_secs(2);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const TARGET_START_TIMEOUT: Duration = Duration::from_secs(60);
const PROCESS_MISSING_GRACE: Duration = Duration::from_secs(4);
const FOREGROUND_GRACE: Duration = Duration::from_secs(90);
const MAX_TICK: Duration = Duration::from_secs(5);

pub struct LaunchWatch {
    pub app: AppHandle,
    pub pool: SqlitePool,
    pub launch_id: String,
    pub local_copy_id: i64,
    pub root_pid: u32,
    pub target_exe: String,
    pub job: Option<Arc<ProcessJob>>,
    pub uses_wrapper: bool,
    pub steam_mode: bool,
    pub manual_stop: Arc<AtomicBool>,
    pub external_pid: Arc<Mutex<Option<u32>>>,
    pub root_exit_code: Arc<Mutex<Option<i32>>>,
}

#[derive(Debug)]
pub enum WatchOutcome {
    Exited {
        exit_code: Option<i32>,
        message: Option<String>,
    },
    ManualStop,
    LaunchFailed(String),
}

fn normalized_exe(path: &str) -> String {
    dunce::canonicalize(Path::new(path))
        .unwrap_or_else(|_| Path::new(path).to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase()
}

fn active_process_ids(job: Option<&Arc<ProcessJob>>, root_pid: u32) -> Vec<u32> {
    job.and_then(|job| job.active_process_ids().ok())
        .unwrap_or_else(|| vec![root_pid])
}

fn find_target_pid(
    pids: &[u32],
    target_exe: &str,
    root_pid: u32,
    uses_wrapper: bool,
) -> Option<u32> {
    if !uses_wrapper {
        let target = normalized_exe(target_exe);
        return (pids.contains(&root_pid)
            && process_image_path(root_pid)
                .map(|path| normalized_exe(&path) == target)
                .unwrap_or(false))
        .then_some(root_pid);
    }
    let target = normalized_exe(target_exe);
    pids.iter().copied().find(|pid| {
        process_image_path(*pid)
            .map(|path| normalized_exe(&path) == target)
            .unwrap_or(false)
    })
}

fn find_external_target_pid(target_exe: &str) -> Option<u32> {
    let target = normalized_exe(target_exe);
    let name = std::path::Path::new(target_exe)
        .file_name()?
        .to_string_lossy();
    process_ids_with_name(&name).into_iter().find(|pid| {
        process_image_path(*pid)
            .map(|path| normalized_exe(&path) == target)
            .unwrap_or(false)
    })
}

fn emit_session(app: &AppHandle, action: &str, payload: &PlaySessionWithWork) {
    let _ = app.emit(
        "play-session",
        PlaySessionEvent {
            action: action.to_string(),
            payload: payload.clone(),
        },
    );
}

pub async fn watch_launch(config: LaunchWatch) -> WatchOutcome {
    let LaunchWatch {
        app,
        pool,
        launch_id,
        local_copy_id,
        root_pid,
        target_exe,
        job,
        uses_wrapper,
        steam_mode,
        manual_stop,
        external_pid,
        root_exit_code,
    } = config;

    let started_waiting = Instant::now();
    let mut game_pid = None;
    let mut session: Option<PlaySessionWithWork> = None;
    let mut timing = ActivityAccumulator::new(FOREGROUND_GRACE);
    let mut last_tick = Instant::now();
    let mut last_heartbeat = Instant::now();
    let mut missing_since: Option<Instant> = None;
    let mut last_activity = None;

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        if manual_stop.load(Ordering::SeqCst) {
            if let Some(current) = session.as_ref() {
                let payload = finish_session(
                    &pool,
                    current.session.id,
                    timing.credited_seconds(),
                    "manual_stop",
                )
                .await
                .ok()
                .flatten();
                if let Some(payload) = payload {
                    emit_session(&app, "ended", &payload);
                }
            }
            return WatchOutcome::ManualStop;
        }

        let now = Instant::now();
        let delta = now.saturating_duration_since(last_tick).min(MAX_TICK);
        last_tick = now;
        let pids = active_process_ids(job.as_ref(), root_pid);
        let external_target = if steam_mode {
            find_external_target_pid(&target_exe)
        } else {
            None
        };

        if session.is_none() {
            game_pid =
                find_target_pid(&pids, &target_exe, root_pid, uses_wrapper).or(external_target);
            let Some(pid) = game_pid else {
                if started_waiting.elapsed() >= TARGET_START_TIMEOUT {
                    return WatchOutcome::LaunchFailed(
                        "启动超时：没有在游戏进程树中找到已登记的主程序".to_string(),
                    );
                }
                continue;
            };
            let exe_path = process_image_path(pid).unwrap_or_else(|| target_exe.clone());
            if steam_mode && let Ok(mut stored) = external_pid.lock() {
                *stored = Some(pid);
            }
            match start_session(&pool, local_copy_id, &launch_id, pid, &exe_path).await {
                Ok(created) => {
                    emit_session(&app, "started", &created);
                    session = Some(created);
                    last_heartbeat = now;
                    timing = ActivityAccumulator::new(FOREGROUND_GRACE);
                }
                Err(error) => {
                    if let Some(job) = &job {
                        let _ = job.terminate();
                    }
                    return WatchOutcome::LaunchFailed(format!("无法记录游玩会话：{error}"));
                }
            }
        }

        let Some(mut pid) = game_pid else {
            continue;
        };
        if steam_mode
            && let Some(external) = external_target
            && external != pid
        {
            pid = external;
            game_pid = Some(external);
            if let Ok(mut stored) = external_pid.lock() {
                *stored = Some(external);
            }
        }
        let present = if steam_mode {
            external_target.is_some()
                || process_image_path(pid)
                    .map(|path| normalized_exe(&path) == normalized_exe(&target_exe))
                    .unwrap_or(false)
        } else {
            pids.contains(&pid)
                || process_image_path(pid)
                    .map(|path| normalized_exe(&path) == normalized_exe(&target_exe))
                    .unwrap_or(false)
        };
        if !present {
            if missing_since.is_none() {
                missing_since = Some(now);
            }
            if missing_since.is_some_and(|since| now.duration_since(since) >= PROCESS_MISSING_GRACE)
            {
                if let Some(current) = session.as_ref() {
                    let payload = finish_session(
                        &pool,
                        current.session.id,
                        timing.credited_seconds(),
                        "exited",
                    )
                    .await
                    .ok()
                    .flatten();
                    if let Some(payload) = payload {
                        emit_session(&app, "ended", &payload);
                    }
                }
                let exit_code = if uses_wrapper {
                    None
                } else {
                    root_exit_code.lock().ok().and_then(|value| *value)
                };
                return WatchOutcome::Exited {
                    exit_code,
                    message: None,
                };
            }
            continue;
        }
        missing_since = None;

        if let Some(current) = session.as_ref() {
            let foreground = foreground_process_id();
            let focused = foreground
                .is_some_and(|foreground| foreground == pid || pids.contains(&foreground));
            let activity = timing.add(delta, focused);
            let status = if activity == ActivityState::Paused {
                "paused"
            } else {
                "running"
            };
            let status_changed = last_activity != Some(activity);
            if status_changed || last_heartbeat.elapsed() >= HEARTBEAT_INTERVAL {
                if let Err(error) =
                    heartbeat_session(&pool, current.session.id, status, timing.credited_seconds())
                        .await
                {
                    eprintln!("play session heartbeat failed: {error}");
                } else {
                    last_heartbeat = now;
                    if status_changed
                        && let Ok(Some(updated)) =
                            store::get_session_payload(&pool, current.session.id).await
                    {
                        emit_session(&app, "updated", &updated);
                    }
                }
                last_activity = Some(activity);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_windows_paths_case_insensitively() {
        assert_eq!(normalized_exe("C:/Games/Game.exe"), "c:\\games\\game.exe");
    }

    #[cfg(windows)]
    #[test]
    fn finds_a_steam_handoff_process_outside_the_original_job() {
        use std::fs;
        use std::process::{Command, Stdio};

        let temp = tempfile::TempDir::new().expect("temp");
        let probe = temp.path().join("miyu_steam_handoff_probe.exe");
        fs::copy("C:\\Windows\\System32\\PING.EXE", &probe).expect("copy ping");
        let mut child = Command::new(&probe)
            .args(["127.0.0.1", "-n", "2"])
            .stdout(Stdio::null())
            .spawn()
            .expect("spawn ping");
        let path = process_image_path(child.id()).expect("ping path");
        assert_eq!(find_external_target_pid(&path), Some(child.id()));
        let _ = child.kill();
        let _ = child.wait();
    }
}
