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
    ProcessJob, foreground_process_id, process_ids, process_ids_with_name, process_image_path,
    visible_window_area,
};
pub use store::{
    close_open_sessions, create_manual_session, delete_session, finish_session, heartbeat_session,
    list_work_sessions, recover_open_sessions, retarget_session, start_session, stats_overview,
    update_manual_session,
};
pub use types::{
    PlaySessionEvent, PlaySessionWithWork, SessionCreateInput, SessionUpdateInput, StatsOverview,
    StatsPeriod,
};

use engine::{ActivityAccumulator, ActivityState};

const POLL_INTERVAL: Duration = Duration::from_secs(2);
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const TARGET_FALLBACK_AFTER: Duration = Duration::from_secs(8);
const PROCESS_MISSING_GRACE: Duration = Duration::from_secs(4);
const FOREGROUND_GRACE: Duration = Duration::from_secs(90);
const MAX_TICK: Duration = Duration::from_secs(5);
const SHORT_SESSION_WALL_FLOOR: Duration = Duration::from_secs(15);

pub struct LaunchWatch {
    pub app: AppHandle,
    pub pool: SqlitePool,
    pub launch_id: String,
    pub local_copy_id: i64,
    pub root_pid: u32,
    pub target_exe: String,
    pub working_dir: String,
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
    if let Some(job) = job
        && let Ok(pids) = job.active_process_ids()
    {
        return pids;
    }
    if process_image_path(root_pid).is_some() {
        vec![root_pid]
    } else {
        Vec::new()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProcessCandidate {
    pid: u32,
    exe_path: String,
    window_area: u64,
}

fn process_candidates(pids: &[u32]) -> Vec<ProcessCandidate> {
    pids.iter()
        .filter_map(|pid| {
            process_image_path(*pid).map(|exe_path| ProcessCandidate {
                pid: *pid,
                exe_path,
                window_area: 0,
            })
        })
        .collect()
}

fn exact_target_pid(candidates: &[ProcessCandidate], target_exe: &str) -> Option<u32> {
    let target = normalized_exe(target_exe);
    let matches = candidates
        .iter()
        .filter(|candidate| normalized_exe(&candidate.exe_path) == target)
        .map(|candidate| candidate.pid)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => None,
        [only] => Some(*only),
        _ => matches
            .into_iter()
            .max_by_key(|pid| (visible_window_area(*pid), *pid)),
    }
}

fn fallback_target_pid(
    candidates: &[ProcessCandidate],
    root_pid: u32,
    uses_wrapper: bool,
) -> Option<u32> {
    let mut eligible = candidates
        .iter()
        .filter(|candidate| !uses_wrapper || candidate.pid != root_pid)
        .collect::<Vec<_>>();
    eligible.sort_by_key(|candidate| (candidate.window_area, candidate.pid));
    eligible.last().map(|candidate| candidate.pid)
}

fn normalized_directory(path: &str) -> String {
    let normalized = dunce::canonicalize(Path::new(path))
        .unwrap_or_else(|_| Path::new(path).to_path_buf())
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();
    let trimmed = normalized.trim_end_matches('\\');
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}\\")
    }
}

fn find_process_in_directory(working_dir: &str) -> Option<(u32, u64)> {
    let prefix = normalized_directory(working_dir);
    if prefix.len() <= 3 {
        return None;
    }
    let current = std::process::id();
    process_ids()
        .into_iter()
        .filter(|pid| *pid != current)
        .filter_map(|pid| process_image_path(pid).map(|path| (pid, path)))
        .filter(|(_, path)| normalized_exe(path).starts_with(&prefix))
        .map(|(pid, _)| (pid, visible_window_area(pid)))
        .filter(|(_, area)| *area > 0)
        .max_by_key(|(pid, area)| (*area, *pid))
}

fn process_matches_target_or_directory(pid: u32, target_exe: &str, working_dir: &str) -> bool {
    let Some(path) = process_image_path(pid) else {
        return false;
    };
    let path = normalized_exe(&path);
    path == normalized_exe(target_exe)
        || (!working_dir.trim().is_empty() && path.starts_with(&normalized_directory(working_dir)))
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

fn settled_seconds(timing: &ActivityAccumulator, elapsed: Duration, allow_wall_floor: bool) -> i64 {
    let credited = timing.credited_seconds();
    if credited > 0 {
        return credited;
    }
    if allow_wall_floor && elapsed <= SHORT_SESSION_WALL_FLOOR {
        elapsed.as_secs().max(1).min(i64::MAX as u64) as i64
    } else {
        0
    }
}

async fn finalize_session(
    app: &AppHandle,
    pool: &SqlitePool,
    session_id: i64,
    duration_sec: i64,
    end_reason: &str,
) -> Option<PlaySessionWithWork> {
    let payload = finish_session(pool, session_id, duration_sec, end_reason)
        .await
        .ok()
        .flatten();
    if let Some(payload) = payload.as_ref() {
        emit_session(app, "ended", payload);
    }
    payload
}

pub async fn watch_launch(config: LaunchWatch) -> WatchOutcome {
    let LaunchWatch {
        app,
        pool,
        launch_id,
        local_copy_id,
        root_pid,
        target_exe,
        working_dir,
        job,
        uses_wrapper,
        steam_mode,
        manual_stop,
        external_pid,
        root_exit_code,
    } = config;

    let started_waiting = Instant::now();
    let session = match start_session(&pool, local_copy_id, &launch_id, root_pid, &target_exe).await
    {
        Ok(session) => session,
        Err(error) => {
            return WatchOutcome::LaunchFailed(format!("无法记录游玩会话：{error}"));
        }
    };
    let session_id = session.session.id;
    emit_session(&app, "started", &session);

    let mut game_pid = Some(root_pid);
    let mut timing = ActivityAccumulator::new(FOREGROUND_GRACE);
    let mut timing_started = !uses_wrapper;
    let mut game_seen = false;
    let mut last_tick = Instant::now();
    let mut last_heartbeat = last_tick;
    let mut missing_since: Option<Instant> = None;
    let mut last_activity = None;
    let mut directory_scan_done = false;
    let mut outside_target: Option<u32> = None;

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        if manual_stop.load(Ordering::SeqCst) {
            let elapsed = started_waiting.elapsed();
            finalize_session(
                &app,
                &pool,
                session_id,
                settled_seconds(&timing, elapsed, !uses_wrapper),
                "manual_stop",
            )
            .await;
            return WatchOutcome::ManualStop;
        }

        let now = Instant::now();
        let delta = now.saturating_duration_since(last_tick).min(MAX_TICK);
        last_tick = now;
        let pids = active_process_ids(job.as_ref(), root_pid);
        let mut candidates = process_candidates(&pids);
        let exact_pid = exact_target_pid(&candidates, &target_exe);
        let allow_fallback = started_waiting.elapsed() >= TARGET_FALLBACK_AFTER;
        if outside_target
            .is_some_and(|pid| !process_matches_target_or_directory(pid, &target_exe, &working_dir))
        {
            outside_target = None;
        }
        if outside_target.is_none() && (steam_mode || exact_pid.is_none()) {
            outside_target = find_external_target_pid(&target_exe);
        }
        let mut selected = outside_target.or(exact_pid);

        if allow_fallback && selected.is_none() && !candidates.is_empty() {
            for candidate in &mut candidates {
                candidate.window_area = visible_window_area(candidate.pid);
            }
            selected = fallback_target_pid(&candidates, root_pid, uses_wrapper);
        }

        if allow_fallback
            && !directory_scan_done
            && (selected.is_none() || selected == Some(root_pid))
        {
            if let Some((pid, area)) = find_process_in_directory(&working_dir) {
                let selected_area = selected
                    .and_then(|pid| candidates.iter().find(|candidate| candidate.pid == pid))
                    .map(|candidate| candidate.window_area)
                    .unwrap_or(0);
                if pid != root_pid && area > selected_area {
                    selected = Some(pid);
                    outside_target = Some(pid);
                }
            }
            directory_scan_done = !pids.is_empty();
        }

        let identified =
            selected.is_some() && (exact_pid == selected || outside_target == selected);
        if identified {
            game_seen = true;
            timing_started = true;
        }
        if let Some(pid) = selected {
            if game_pid != Some(pid) {
                let exe_path = process_image_path(pid).unwrap_or_else(|| target_exe.clone());
                if let Err(error) = retarget_session(&pool, session_id, pid, &exe_path).await {
                    eprintln!("play session retarget failed: {error}");
                }
                game_pid = Some(pid);
            }
            if let Ok(mut stored) = external_pid.lock() {
                *stored = (!pids.contains(&pid)).then_some(pid);
            }
        }

        let target_alive =
            selected.is_some_and(|pid| pids.contains(&pid) || process_image_path(pid).is_some());
        let present = !pids.is_empty() || target_alive || outside_target.is_some();
        if !present {
            let wall_end = *missing_since.get_or_insert(now);
            let missing_grace = if identified {
                PROCESS_MISSING_GRACE
            } else {
                TARGET_FALLBACK_AFTER + PROCESS_MISSING_GRACE
            };
            if now.duration_since(wall_end) >= missing_grace {
                let elapsed = wall_end.duration_since(started_waiting);
                finalize_session(
                    &app,
                    &pool,
                    session_id,
                    settled_seconds(&timing, elapsed, !uses_wrapper),
                    "exited",
                )
                .await;
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

        let foreground = foreground_process_id();
        let focused = foreground.is_some_and(|foreground| {
            if uses_wrapper {
                game_seen && (game_pid == Some(foreground) || outside_target == Some(foreground))
            } else {
                game_pid == Some(foreground)
                    || pids.contains(&foreground)
                    || outside_target == Some(foreground)
            }
        });
        let activity = if timing_started {
            timing.add(delta, focused)
        } else {
            ActivityState::BackgroundGrace
        };
        let status = if activity == ActivityState::Paused {
            "paused"
        } else {
            "running"
        };
        let status_changed = last_activity != Some(activity);
        if status_changed || last_heartbeat.elapsed() >= HEARTBEAT_INTERVAL {
            if let Err(error) =
                heartbeat_session(&pool, session_id, status, timing.credited_seconds()).await
            {
                eprintln!("play session heartbeat failed: {error}");
            } else {
                last_heartbeat = now;
                if status_changed
                    && let Ok(Some(updated)) = store::get_session_payload(&pool, session_id).await
                {
                    emit_session(&app, "updated", &updated);
                }
            }
            last_activity = Some(activity);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(pid: u32, exe_path: &str, window_area: u64) -> ProcessCandidate {
        ProcessCandidate {
            pid,
            exe_path: exe_path.to_string(),
            window_area,
        }
    }

    #[test]
    fn normalizes_windows_paths_case_insensitively() {
        assert_eq!(normalized_exe("C:/Games/Game.exe"), "c:\\games\\game.exe");
    }

    #[test]
    fn recognizes_the_game_spawned_by_a_launcher() {
        let candidates = vec![
            candidate(100, "C:\\Games\\launcher.exe", 0),
            candidate(200, "C:\\Games\\game.exe", 0),
        ];
        assert_eq!(
            exact_target_pid(&candidates, "C:\\Games\\game.exe"),
            Some(200)
        );
    }

    #[test]
    fn fallback_prefers_the_visible_game_window() {
        let candidates = vec![
            candidate(100, "C:\\Games\\launcher.exe", 12_000),
            candidate(200, "C:\\Games\\renamed-game.exe", 1_200_000),
        ];
        assert_eq!(fallback_target_pid(&candidates, 100, false), Some(200));
    }

    #[test]
    fn wrapper_root_is_not_treated_as_the_game() {
        let candidates = vec![candidate(100, "C:\\Tools\\LEProc.exe", 200_000)];
        assert_eq!(fallback_target_pid(&candidates, 100, true), None);
    }

    #[test]
    fn short_uncredited_sessions_get_a_wall_clock_floor() {
        let timing = ActivityAccumulator::new(FOREGROUND_GRACE);
        assert_eq!(settled_seconds(&timing, Duration::from_secs(5), true), 5);
        assert_eq!(settled_seconds(&timing, Duration::from_secs(30), true), 0);
        assert_eq!(settled_seconds(&timing, Duration::from_secs(5), false), 0);
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

    #[cfg(windows)]
    #[test]
    fn finds_the_registered_game_inside_a_launcher_job_tree() {
        use std::fs;
        use std::process::{Command, Stdio};
        use std::thread;

        let temp = tempfile::TempDir::new().expect("temp");
        let game = temp.path().join("game.exe");
        fs::copy("C:\\Windows\\System32\\PING.EXE", &game).expect("copy game");
        let mut child = Command::new("cmd.exe")
            .args(["/C", &format!("{} 127.0.0.1 -n 10", game.display())])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn launcher");
        let job = ProcessJob::create().expect("job");
        job.assign(&child).expect("assign");
        thread::sleep(Duration::from_millis(900));

        let pids = job.active_process_ids().expect("pids");
        let candidates = process_candidates(&pids);
        let found = exact_target_pid(&candidates, &game.to_string_lossy());
        assert!(found.is_some(), "game process should be in the job tree");
        assert_ne!(found, Some(child.id()));

        let _ = job.terminate();
        let _ = child.wait();
    }
}
