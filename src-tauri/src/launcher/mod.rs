pub(crate) mod process;

use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result, bail};
use chrono::Utc;
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};

use crate::db::{self, LaunchProfile};
use crate::tracking::{self, LaunchWatch, WatchOutcome};
use process::ProcessJob;

struct ActiveLaunch {
    work_id: i64,
    pid: u32,
    started_at: String,
    job: Option<Arc<ProcessJob>>,
    manual_stop: Arc<AtomicBool>,
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
            if let Some(job) = &launch.job {
                launch.manual_stop.store(true, Ordering::SeqCst);
                job.terminate()?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn finish(&self, launch_id: &str) {
        if let Ok(mut active) = self.active.lock() {
            active.remove(launch_id);
        }
    }
}

fn build_command(target: &db::LaunchTarget, profile: &LaunchProfile) -> Command {
    let wrapper = profile
        .wrapper_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty());
    let mut command = if let Some(wrapper) = wrapper {
        let mut command = Command::new(wrapper);
        command.args(&profile.wrapper_args);
        command.arg(&target.exe_path);
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
    command
}

fn validation_message(report: &db::ValidationReport) -> String {
    let mut parts = Vec::new();
    if !report.exe.ok {
        parts.push(report.exe.message.clone());
    }
    if !report.working_dir.ok {
        parts.push(report.working_dir.message.clone());
    }
    if let Some(wrapper) = &report.wrapper
        && !wrapper.ok
    {
        parts.push(wrapper.message.clone());
    }
    if parts.is_empty() {
        "启动路径无效".to_string()
    } else {
        parts.join("；")
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
    db::validate_profile(&target.profile)?;
    let report = db::validate_launch(&pool, work_id, Some(target.profile.clone())).await?;
    if !report.valid {
        bail!("{}", validation_message(&report));
    }

    let mut command = build_command(&target, &target.profile);
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
    if let Ok(mut active) = manager.active.lock() {
        active.insert(
            launch_id.clone(),
            ActiveLaunch {
                work_id,
                pid,
                started_at: started_at.clone(),
                job: job.clone(),
                manual_stop: manual_stop.clone(),
            },
        );
    } else {
        bail!("启动状态锁已损坏");
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
    let watch_job = job.clone();
    let watch_launch_id = launch_id.clone();
    let watch_target_exe = target.exe_path.clone();
    let watch_local_copy_id = target.local_copy_id;
    let uses_wrapper = target.profile.wrapper_path.is_some();
    tauri::async_runtime::spawn(async move {
        let outcome = tracking::watch_launch(LaunchWatch {
            app: event_app.clone(),
            pool: watch_pool,
            launch_id: watch_launch_id,
            local_copy_id: watch_local_copy_id,
            root_pid: pid,
            target_exe: watch_target_exe,
            job: watch_job.clone(),
            uses_wrapper,
            manual_stop,
            root_exit_code,
        })
        .await;
        let (exit_code, message) = match outcome {
            WatchOutcome::Exited { exit_code, message } => (exit_code, message),
            WatchOutcome::ManualStop => (None, Some("已从 MiyuManager 停止游戏".to_string())),
            WatchOutcome::LaunchFailed(message) => {
                if let Some(job) = &watch_job {
                    let _ = job.terminate();
                }
                (None, Some(message))
            }
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
            profile: LaunchProfile::default(),
        };
        let profile = LaunchProfile {
            args: vec!["--window".to_string()],
            env: vec![EnvVar {
                key: "MIYU_TEST".to_string(),
                value: "1".to_string(),
            }],
            wrapper_path: Some("C:\\Tools\\LEProc.exe".to_string()),
            wrapper_args: vec!["-runas".to_string(), "profile".to_string()],
            monitor: None,
            fullscreen: false,
        };
        let command = build_command(&target, &profile);
        let program = command.get_program().to_string_lossy().to_string();
        assert!(program.ends_with("LEProc.exe"));
        let args = command
            .get_args()
            .map(|value| value.to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert_eq!(args[0], "-runas");
        assert_eq!(args[1], "profile");
        assert_eq!(args[2], target.exe_path);
        assert_eq!(args[3], "--window");
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
}
