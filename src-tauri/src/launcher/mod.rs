pub(crate) mod process;

use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use chrono::Utc;
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};

use crate::db::{self, LaunchProfile};
use crate::magpie;
use crate::preferences::{self, WrapperConfig};
use crate::tracking::{self, LaunchWatch, WatchOutcome};
use process::ProcessJob;

struct ActiveLaunch {
    work_id: i64,
    title: String,
    target_exe: String,
    working_dir: String,
    pid: u32,
    game_pid: Arc<Mutex<Option<u32>>>,
    started_at: String,
    job: Option<Arc<ProcessJob>>,
    manual_stop: Arc<AtomicBool>,
    external_pid: Arc<Mutex<Option<u32>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchSnapshot {
    pub launch_id: String,
    pub work_id: i64,
    pub pid: u32,
    pub state: String,
    pub started_at: String,
    pub job_tracked: bool,
    pub exit_code: Option<i32>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchEvent {
    pub launch_id: String,
    pub work_id: i64,
    pub pid: u32,
    pub state: String,
    pub started_at: String,
    pub job_tracked: bool,
    pub exit_code: Option<i32>,
    pub message: Option<String>,
}

#[derive(Default)]
pub struct LaunchManager {
    active: Mutex<HashMap<String, ActiveLaunch>>,
}

impl LaunchManager {
    pub fn snapshot(&self, work_id: i64) -> Option<LaunchSnapshot> {
        let active = self.active.lock().ok()?;
        active
            .iter()
            .filter(|(_, launch)| launch.work_id == work_id)
            .max_by(|left, right| left.1.started_at.cmp(&right.1.started_at))
            .map(|(launch_id, launch)| LaunchSnapshot {
                launch_id: launch_id.clone(),
                work_id: launch.work_id,
                pid: launch.pid,
                state: "running".to_string(),
                started_at: launch.started_at.clone(),
                job_tracked: launch.job.is_some(),
                exit_code: None,
                message: None,
            })
    }

    pub fn stop(&self, work_id: i64) -> Result<bool> {
        let active = self
            .active
            .lock()
            .map_err(|_| anyhow::anyhow!("启动状态锁已损坏"))?;
        for launch in active.values().filter(|launch| launch.work_id == work_id) {
            let mut stopped = false;
            if let Some(job) = &launch.job {
                launch.manual_stop.store(true, Ordering::SeqCst);
                if job
                    .active_process_ids()
                    .map(|pids| !pids.is_empty())
                    .unwrap_or(true)
                {
                    job.terminate()?;
                    stopped = true;
                }
            }
            if let Ok(external_pid) = launch.external_pid.lock()
                && let Some(pid) = *external_pid
            {
                launch.manual_stop.store(true, Ordering::SeqCst);
                process::terminate_process(pid)?;
                stopped = true;
            }
            if stopped {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub fn has_active(&self) -> bool {
        self.active
            .lock()
            .map(|active| !active.is_empty())
            .unwrap_or(false)
    }

    pub fn capture_target(&self, foreground: Option<u32>) -> Option<(i64, String, Option<u32>)> {
        let active = self.active.lock().ok()?;
        let foreground_path = foreground
            .and_then(process::process_image_path)
            .map(|path| normalized_capture_path(&path));
        for launch in active.values() {
            let game_pid = launch.game_pid.lock().ok().and_then(|value| *value);
            let external_pid = launch.external_pid.lock().ok().and_then(|value| *value);
            let matches_foreground = foreground.is_some_and(|foreground| {
                Some(foreground) == game_pid
                    || Some(foreground) == external_pid
                    || foreground == launch.pid
                    || launch
                        .job
                        .as_ref()
                        .and_then(|job| job.active_process_ids().ok())
                        .is_some_and(|pids| pids.contains(&foreground))
                    || foreground_path.as_deref().is_some_and(|path| {
                        let directory = capture_directory_prefix(&launch.working_dir);
                        path == normalized_capture_path(&launch.target_exe)
                            || (!directory.is_empty() && path.starts_with(&directory))
                    })
            });
            if matches_foreground {
                return Some((launch.work_id, launch.title.clone(), game_pid));
            }
        }
        None
    }

    fn finish(&self, launch_id: &str) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(launch_id);
        }
    }
}

struct LaunchPlan {
    command: Command,
    uses_command_wrapper: bool,
    magpie: Option<WrapperConfig>,
}

fn wrapper_config<'a>(wrappers: &'a [WrapperConfig], id: &str) -> Result<&'a WrapperConfig> {
    wrappers
        .iter()
        .find(|wrapper| wrapper.id == id && !wrapper.path.trim().is_empty())
        .with_context(|| format!("尚未配置 {} 程序路径", preferences::wrapper_label(id)))
}

fn validate_enabled_wrappers(profile: &LaunchProfile, wrappers: &[WrapperConfig]) -> Result<()> {
    for id in &profile.wrapper_ids {
        let wrapper = wrapper_config(wrappers, id)?;
        if !std::path::Path::new(wrapper.path.trim()).is_file() {
            bail!(
                "{} 程序不存在：{}",
                preferences::wrapper_label(id),
                wrapper.path
            );
        }
    }
    Ok(())
}

fn build_command(
    target: &db::LaunchTarget,
    profile: &LaunchProfile,
    wrappers: &[WrapperConfig],
) -> Result<LaunchPlan> {
    let locale_emulator = profile
        .wrapper_ids
        .iter()
        .any(|id| id == preferences::WRAPPER_LOCALE_EMULATOR);
    let mut uses_command_wrapper = false;
    let mut command = if locale_emulator {
        let wrapper = wrapper_config(wrappers, preferences::WRAPPER_LOCALE_EMULATOR)?;
        let mut command = Command::new(wrapper.path.trim());
        command.args(&wrapper.args);
        command.arg(&target.exe_path);
        uses_command_wrapper = true;
        command
    } else {
        Command::new(&target.exe_path)
    };
    command
        .args(&profile.args)
        .current_dir(&target.working_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    for variable in &profile.env {
        command.env(&variable.key, &variable.value);
    }
    let magpie = if profile
        .wrapper_ids
        .iter()
        .any(|id| id == preferences::WRAPPER_MAGPIE)
    {
        Some(wrapper_config(wrappers, preferences::WRAPPER_MAGPIE)?.clone())
    } else {
        None
    };
    Ok(LaunchPlan {
        command,
        uses_command_wrapper,
        magpie,
    })
}

fn validation_message(report: &db::ValidationReport) -> String {
    let mut parts = Vec::new();
    if !report.exe.ok {
        parts.push(report.exe.message.clone());
    }
    if !report.working_dir.ok {
        parts.push(report.working_dir.message.clone());
    }
    if parts.is_empty() {
        "启动路径无效".to_string()
    } else {
        parts.join("；")
    }
}

fn normalized_capture_path(path: &str) -> String {
    dunce::canonicalize(std::path::Path::new(path))
        .unwrap_or_else(|_| std::path::PathBuf::from(path))
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase()
}

fn capture_directory_prefix(path: &str) -> String {
    let normalized = normalized_capture_path(path);
    let trimmed = normalized.trim_end_matches('\\');
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}\\")
    }
}

pub async fn start(
    app: AppHandle,
    pool: SqlitePool,
    manager: Arc<LaunchManager>,
    work_id: i64,
) -> Result<LaunchSnapshot> {
    if manager.snapshot(work_id).is_some() {
        bail!("这部作品已经有一个正在运行的游戏进程");
    }
    let target = db::get_launch_target(&pool, work_id).await?;
    let profile = target.profile.clone();
    let settings = preferences::load(&pool).await?;
    db::validate_profile(&profile)?;
    validate_enabled_wrappers(&profile, &settings.wrappers)?;
    let report = db::validate_launch(&pool, work_id, Some(profile.clone())).await?;
    if !report.valid {
        bail!("{}", validation_message(&report));
    }

    let LaunchPlan {
        mut command,
        uses_command_wrapper,
        magpie: magpie_wrapper,
    } = build_command(&target, &profile, &settings.wrappers)?;
    let launch_id = uuid::Uuid::new_v4().to_string();
    let started_at = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let child = command
        .spawn()
        .with_context(|| format!("无法启动 {}", target.title))?;
    let pid = child.id();
    let mut job = ProcessJob::create().ok();
    if let Some(candidate) = &job
        && candidate.assign(&child).is_err()
    {
        job = None;
    }
    let job = job.map(Arc::new);
    let job_tracked = job.is_some();

    if let Some(wrapper) = magpie_wrapper {
        let magpie_exe = std::path::PathBuf::from(wrapper.path.trim());
        let magpie_args = wrapper.args;
        let exe_path = target.exe_path.clone();
        let title = target.title.clone();
        let warning_app = app.clone();
        std::thread::spawn(move || {
            let Some(window) =
                process::wait_for_window_by_executable(&exe_path, Duration::from_secs(45))
            else {
                let message = "没有找到游戏窗口，Magpie 仅进入托盘模式".to_string();
                eprintln!("Magpie: {message}");
                let _ = warning_app.emit(
                    "launch-warning",
                    serde_json::json!({ "workId": work_id, "message": message }),
                );
                let _ = magpie::launch_tray(&magpie_exe, &magpie_args);
                return;
            };
            let profile_title = if window.title.trim().is_empty() {
                title.clone()
            } else {
                window.title.clone()
            };
            if let Err(error) = magpie::sync_auto_scale(
                &magpie_exe,
                &magpie_args,
                std::path::Path::new(&window.exe_path),
                &window.class_name,
                &profile_title,
            ) {
                eprintln!("Magpie auto-scale setup failed: {error:#}");
                let _ = warning_app.emit(
                    "launch-warning",
                    serde_json::json!({
                        "workId": work_id,
                        "message": format!("Magpie 自动缩放未启用：{error}")
                    }),
                );
                let _ = magpie::launch_tray(&magpie_exe, &magpie_args);
            }
        });
    }
    let snapshot = LaunchSnapshot {
        launch_id: launch_id.clone(),
        work_id,
        pid,
        state: "running".to_string(),
        started_at: started_at.clone(),
        job_tracked,
        exit_code: None,
        message: None,
    };
    let manual_stop = Arc::new(AtomicBool::new(false));
    let external_pid = Arc::new(Mutex::new(job.is_none().then_some(pid)));
    let game_pid = Arc::new(Mutex::new(Some(pid)));
    if let Ok(mut active) = manager.active.lock() {
        active.insert(
            launch_id.clone(),
            ActiveLaunch {
                work_id,
                title: target.title.clone(),
                target_exe: target.exe_path.clone(),
                working_dir: target.working_dir.clone(),
                pid,
                game_pid: game_pid.clone(),
                started_at: started_at.clone(),
                job: job.clone(),
                manual_stop: manual_stop.clone(),
                external_pid: external_pid.clone(),
            },
        );
    } else {
        bail!("启动状态锁已损坏");
    }
    match crate::screenshots::register_for_game(&app, &settings.screenshot_hotkey) {
        Ok(()) => crate::diagnostics::event(
            "info",
            "screenshot_shortcut_registered",
            "已为运行中的游戏注册截图快捷键",
            serde_json::json!({"workId": work_id, "hotkey": settings.screenshot_hotkey}),
        ),
        Err(error) => {
            crate::diagnostics::event(
                "warn",
                "screenshot_shortcut_failed",
                "截图快捷键注册失败",
                serde_json::json!({"workId": work_id, "hotkey": settings.screenshot_hotkey, "error": format!("{error:#}")}),
            );
            let _ = app.emit(
                "launch-warning",
                serde_json::json!({
                    "workId": work_id,
                    "message": format!("截图快捷键不可用：{error}")
                }),
            );
        }
    }
    let _ = app.emit("launch-state", &snapshot);

    let root_exit_code = Arc::new(Mutex::new(None));
    let wait_exit_code = root_exit_code.clone();
    std::thread::spawn(move || {
        let mut child = child;
        if let Ok(status) = child.wait()
            && let Ok(mut stored) = wait_exit_code.lock()
        {
            *stored = status.code();
        }
    });

    let event_app = app.clone();
    let event_manager = manager.clone();
    let event_launch_id = launch_id.clone();
    let event_started_at = started_at.clone();
    let watch_pool = pool.clone();
    let watch_launch_id = launch_id.clone();
    let watch_target_exe = target.exe_path.clone();
    let watch_working_dir = target.working_dir.clone();
    let watch_local_copy_id = target.local_copy_id;
    let uses_wrapper = uses_command_wrapper;
    let steam_mode = target.steam_app_id.is_some();
    tauri::async_runtime::spawn(async move {
        let outcome = tracking::watch_launch(LaunchWatch {
            app: event_app.clone(),
            pool: watch_pool,
            launch_id: watch_launch_id,
            local_copy_id: watch_local_copy_id,
            root_pid: pid,
            target_exe: watch_target_exe,
            working_dir: watch_working_dir,
            job: job.clone(),
            uses_wrapper,
            steam_mode,
            manual_stop,
            external_pid,
            root_exit_code,
            game_pid,
        })
        .await;
        let (exit_code, message) = match outcome {
            WatchOutcome::Exited { exit_code, message } => (exit_code, message),
            WatchOutcome::ManualStop => (None, Some("已从 MiyuManager 停止游戏".to_string())),
            WatchOutcome::LaunchFailed(message) => (None, Some(message)),
        };
        let _ = event_app.emit(
            "launch-state",
            LaunchEvent {
                launch_id: event_launch_id.clone(),
                work_id,
                pid,
                state: "exited".to_string(),
                started_at: event_started_at,
                job_tracked,
                exit_code,
                message,
            },
        );
        event_manager.finish(&event_launch_id);
        if !event_manager.has_active() {
            crate::screenshots::unregister(&event_app);
        }
    });

    Ok(snapshot)
}

pub fn state(manager: &LaunchManager, work_id: i64) -> Option<LaunchSnapshot> {
    manager.snapshot(work_id)
}

pub fn stop(manager: &LaunchManager, work_id: i64) -> Result<bool> {
    manager.stop(work_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{EnvVar, LaunchProfile};

    #[test]
    fn wrapper_command_receives_game_path_and_arguments() {
        let target = db::LaunchTarget {
            local_copy_id: 1,
            title: "月影工房".to_string(),
            exe_path: "C:\\Games\\月影工房\\game.exe".to_string(),
            working_dir: "C:\\Games\\月影工房".to_string(),
            steam_app_id: None,
            profile: LaunchProfile::default(),
        };
        let profile = LaunchProfile {
            args: vec!["--window".to_string()],
            env: vec![EnvVar {
                key: "MIYU_TEST".to_string(),
                value: "1".to_string(),
            }],
            wrapper_ids: vec![preferences::WRAPPER_LOCALE_EMULATOR.to_string()],
            monitor: None,
            fullscreen: false,
        };
        let wrappers = vec![WrapperConfig {
            id: preferences::WRAPPER_LOCALE_EMULATOR.to_string(),
            path: "C:\\Tools\\LEProc.exe".to_string(),
            args: vec!["-runas".to_string(), "profile".to_string()],
        }];
        let plan = build_command(&target, &profile, &wrappers).expect("command");
        let program = plan.command.get_program().to_string_lossy().to_string();
        assert!(program.ends_with("LEProc.exe"));
        let args = plan
            .command
            .get_args()
            .map(|value| value.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert_eq!(args[0], "-runas");
        assert_eq!(args[1], "profile");
        assert_eq!(args[2], target.exe_path);
        assert_eq!(args[3], "--window");
        assert!(plan.uses_command_wrapper);
        assert!(plan.magpie.is_none());
    }

    #[test]
    fn magpie_is_scheduled_for_auto_scale() {
        let target = db::LaunchTarget {
            local_copy_id: 1,
            title: "月影工房".to_string(),
            exe_path: "C:\\Games\\月影工房\\game.exe".to_string(),
            working_dir: "C:\\Games\\月影工房".to_string(),
            steam_app_id: None,
            profile: LaunchProfile::default(),
        };
        let profile = LaunchProfile {
            wrapper_ids: vec![preferences::WRAPPER_MAGPIE.to_string()],
            ..LaunchProfile::default()
        };
        let wrappers = vec![WrapperConfig {
            id: preferences::WRAPPER_MAGPIE.to_string(),
            path: "C:\\Tools\\Magpie\\Magpie.exe".to_string(),
            args: vec!["-t".to_string()],
        }];
        let plan = build_command(&target, &profile, &wrappers).expect("command");
        assert_eq!(
            plan.command.get_program().to_string_lossy().to_string(),
            target.exe_path
        );
        assert!(!plan.uses_command_wrapper);
        let magpie = plan.magpie.expect("magpie wrapper");
        assert!(magpie.path.ends_with("Magpie.exe"));
        assert_eq!(magpie.args, vec!["-t"]);
    }

    #[cfg(windows)]
    #[test]
    fn creates_windows_job_object() {
        assert!(process::ProcessJob::create().is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn job_object_reports_process_tree_and_executable_path() {
        let mut child = Command::new("cmd.exe")
            .args(["/C", "ping 127.0.0.1 -n 2 > nul"])
            .spawn()
            .expect("spawn cmd");
        let job = process::ProcessJob::create().expect("job");
        job.assign(&child).expect("assign");
        let pids = job.active_process_ids().expect("active pids");
        assert!(pids.contains(&child.id()));
        let path = process::process_image_path(child.id()).expect("image path");
        assert!(path.to_lowercase().ends_with("cmd.exe"));
        let _ = job.terminate();
        let _ = child.wait();
    }

    #[cfg(windows)]
    #[test]
    fn toolhelp_can_find_processes_by_executable_name() {
        let mut child = Command::new("ping.exe")
            .args(["127.0.0.1", "-n", "2"])
            .stdout(Stdio::null())
            .spawn()
            .expect("spawn ping");
        let ids = process::process_ids_with_name("PING.EXE");
        assert!(ids.contains(&child.id()));
        let _ = child.kill();
        let _ = child.wait();
    }

    #[cfg(windows)]
    #[test]
    fn terminates_a_process_outside_the_job_object() {
        let temp = tempfile::TempDir::new().expect("temp");
        let probe = temp.path().join("miyu_terminate_probe.exe");
        std::fs::copy("C:\\Windows\\System32\\PING.EXE", &probe).expect("copy ping");
        let mut child = Command::new(&probe)
            .args(["127.0.0.1", "-n", "30"])
            .stdout(Stdio::null())
            .spawn()
            .expect("spawn ping");
        process::terminate_process(child.id()).expect("terminate");
        let status = child.wait().expect("wait");
        assert!(!status.success());
    }
}
