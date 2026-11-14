use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Context;
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::{
    self, AppInfo, ImportCandidateInput, ImportResult, LibraryItemDetail, LibraryPage,
    LibraryQuery, ScanRoot,
};
use crate::scan::{self, ScanCandidate, ScanCoordinator};

pub struct AppState {
    pub pool: SqlitePool,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub scan: Arc<ScanCoordinator>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStart {
    pub job_id: String,
    pub root_path: String,
    pub root_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanComplete {
    pub job_id: String,
    pub root_path: String,
    pub candidates: Vec<ScanCandidate>,
    pub cancelled: bool,
    pub scanned_dirs: u64,
    pub skipped_dirs: u64,
    pub truncated: bool,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanErrorEvent {
    pub job_id: String,
    pub root_path: String,
    pub message: String,
}

pub async fn create_app_state(app: &AppHandle) -> anyhow::Result<AppState> {
    let data_dir = match std::env::var_os("MIYU_DATA_DIR") {
        Some(value) => PathBuf::from(value),
        None => app
            .path()
            .data_dir()
            .context("无法定位应用数据目录")?
            .join("MiyuManager"),
    };
    std::fs::create_dir_all(&data_dir)
        .with_context(|| format!("无法创建数据目录 {}", data_dir.display()))?;
    let db_path = data_dir.join("miyumanager.sqlite3");
    let pool = db::open_pool(&db_path).await?;

    Ok(AppState {
        pool,
        data_dir,
        db_path,
        scan: Arc::new(ScanCoordinator::default()),
    })
}

#[tauri::command]
pub async fn library_query(
    state: State<'_, AppState>,
    query: LibraryQuery,
) -> Result<LibraryPage, String> {
    db::query_library(&state.pool, query)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn library_get(
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<Option<LibraryItemDetail>, String> {
    db::get_library_item(&state.pool, work_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn library_set_status(
    state: State<'_, AppState>,
    work_id: i64,
    status: String,
) -> Result<(), String> {
    db::set_library_status(&state.pool, work_id, &status)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn library_set_favorite(
    state: State<'_, AppState>,
    work_id: i64,
    favorite: bool,
) -> Result<(), String> {
    db::set_library_favorite(&state.pool, work_id, favorite)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn library_remove_work(state: State<'_, AppState>, work_id: i64) -> Result<(), String> {
    db::remove_library_work(&state.pool, work_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn library_roots(state: State<'_, AppState>) -> Result<Vec<ScanRoot>, String> {
    db::list_scan_roots(&state.pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn library_remove_root(state: State<'_, AppState>, root_id: i64) -> Result<(), String> {
    db::remove_scan_root(&state.pool, root_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn app_info(state: State<'_, AppState>) -> Result<AppInfo, String> {
    let library_count = db::library_count(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    Ok(AppInfo {
        data_dir: state.data_dir.to_string_lossy().to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        library_count,
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub async fn library_scan_start(
    app: AppHandle,
    state: State<'_, AppState>,
    root_path: String,
) -> Result<ScanStart, String> {
    let canonical =
        db::canonical_directory(Path::new(&root_path)).map_err(|error| error.to_string())?;
    let root = db::ensure_scan_root(&state.pool, &canonical)
        .await
        .map_err(|error| error.to_string())?;
    let job_id = uuid::Uuid::new_v4().to_string();
    let cancel = state.scan.start(job_id.clone())?;
    let existing = db::existing_exe_keys(&state.pool)
        .await
        .map_err(|error| error.to_string())?;

    let app_handle = app.clone();
    let pool = state.pool.clone();
    let coordinator = state.scan.clone();
    let root_for_task = PathBuf::from(&root.path);
    let root_for_event = root.path.clone();
    let job_for_event = job_id.clone();

    tauri::async_runtime::spawn(async move {
        let scan_job_id = job_for_event.clone();
        let scan_root_path = root_for_event.clone();
        let progress_app = app_handle.clone();
        let progress_job_id = scan_job_id.clone();
        let scan_cancel = cancel.clone();

        let result = tauri::async_runtime::spawn_blocking(move || {
            scan::scan_root(
                &root_for_task,
                &progress_job_id,
                scan_cancel,
                move |progress| {
                    let _ = progress_app.emit("library-scan-progress", progress);
                },
            )
        })
        .await;

        match result {
            Ok(Ok(outcome)) => {
                let mut candidates = outcome.candidates;
                mark_existing(&existing, &mut candidates);
                let _ = db::mark_root_scanned(&pool, &scan_root_path).await;
                let _ = app_handle.emit(
                    "library-scan-complete",
                    ScanComplete {
                        job_id: scan_job_id.clone(),
                        root_path: scan_root_path.clone(),
                        candidates,
                        cancelled: outcome.cancelled,
                        scanned_dirs: outcome.scanned_dirs,
                        skipped_dirs: outcome.skipped_dirs,
                        truncated: outcome.truncated,
                        duration_ms: outcome.duration_ms,
                    },
                );
            }
            Ok(Err(error)) => {
                let _ = app_handle.emit(
                    "library-scan-error",
                    ScanErrorEvent {
                        job_id: scan_job_id.clone(),
                        root_path: scan_root_path.clone(),
                        message: error.to_string(),
                    },
                );
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "library-scan-error",
                    ScanErrorEvent {
                        job_id: scan_job_id.clone(),
                        root_path: scan_root_path.clone(),
                        message: format!("扫描任务失败：{error}"),
                    },
                );
            }
        }

        coordinator.finish(&scan_job_id);
    });

    Ok(ScanStart {
        job_id,
        root_path: root.path,
        root_id: root.id,
    })
}

#[tauri::command]
pub async fn library_scan_cancel(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.scan.cancel())
}

#[tauri::command]
pub async fn library_import_candidates(
    state: State<'_, AppState>,
    candidates: Vec<ImportCandidateInput>,
) -> Result<ImportResult, String> {
    db::import_candidates(&state.pool, candidates)
        .await
        .map_err(|error| error.to_string())
}

fn mark_existing(existing: &HashSet<String>, candidates: &mut [ScanCandidate]) {
    for candidate in candidates {
        candidate.already_imported = existing.contains(&candidate.exe_key);
    }
}
