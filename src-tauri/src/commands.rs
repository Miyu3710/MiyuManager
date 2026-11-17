use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use anyhow::Context;
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;

use crate::assets::{self, CoverAsset, CoverCandidate};
use crate::database_maintenance::{self, BackupInfo, DatabaseHealth, RestoreOutcome};
use crate::db::{
    self, AppInfo, CollectionSummary, ImportCandidateInput, ImportResult, LaunchConfigInput,
    LaunchProfile, LibraryItemDetail, LibraryPage, LibraryQuery, ScanExclusionRecord, ScanRoot,
    ValidationReport, WorkUpdateInput,
};
use crate::diagnostics::{self, FrontendError};
use crate::launcher::{self, LaunchManager, LaunchSnapshot};
use crate::metadata::{self, MetadataHttp, MetadataImportRequest, MetadataImportResult};
use crate::oauth::OAuthService;
use crate::preferences::{self, AppPreferences, UpdateCheck};
use crate::scan::{self, ScanCandidate, ScanCoordinator};
use crate::steam_library;
use crate::tracking::{
    self, PlaySessionWithWork, SessionCreateInput, SessionUpdateInput, StatsOverview, StatsPeriod,
};

pub struct AppState {
    pub pool: SqlitePool,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub scan: Arc<ScanCoordinator>,
    pub launches: Arc<LaunchManager>,
    pub metadata_http: RwLock<Arc<MetadataHttp>>,
    pub metadata_jobs: Arc<MetadataCoordinator>,
    pub batch_jobs: Arc<BatchCoordinator>,
    pub oauth: Arc<OAuthService>,
}

impl AppState {
    pub fn http(&self) -> Arc<MetadataHttp> {
        self.metadata_http
            .read()
            .expect("metadata HTTP client lock poisoned")
            .clone()
    }

    pub fn replace_http(&self, proxy: Option<String>) -> Result<(), String> {
        let client = Arc::new(MetadataHttp::with_proxy(proxy).map_err(|error| error.to_string())?);
        *self
            .metadata_http
            .write()
            .map_err(|_| "元数据网络锁失效".to_string())? = client;
        Ok(())
    }
}

#[derive(Default)]
pub struct MetadataCoordinator {
    jobs: Mutex<HashMap<String, CancellationToken>>,
}

impl MetadataCoordinator {
    fn start(&self, job_id: String) -> Result<CancellationToken, String> {
        let token = CancellationToken::new();
        let mut jobs = self.jobs.lock().map_err(|_| "元数据任务锁失效")?;
        if jobs.contains_key(&job_id) {
            return Err("元数据任务 ID 重复".to_string());
        }
        jobs.insert(job_id, token.clone());
        Ok(token)
    }

    fn cancel(&self, job_id: &str) -> bool {
        if let Ok(jobs) = self.jobs.lock()
            && let Some(token) = jobs.get(job_id)
        {
            token.cancel();
            return true;
        }
        false
    }

    fn finish(&self, job_id: &str) {
        if let Ok(mut jobs) = self.jobs.lock() {
            jobs.remove(job_id);
        }
    }
}

pub struct BatchJob {
    pub cancel: CancellationToken,
    pub paused: Arc<AtomicBool>,
    pub previews: Mutex<HashMap<i64, metadata::MergePreview>>,
}

impl BatchJob {
    fn new() -> Self {
        Self {
            cancel: CancellationToken::new(),
            paused: Arc::new(AtomicBool::new(false)),
            previews: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Default)]
pub struct BatchCoordinator {
    jobs: Mutex<HashMap<String, Arc<BatchJob>>>,
}

impl BatchCoordinator {
    fn start(&self, job_id: String) -> Result<Arc<BatchJob>, String> {
        let job = Arc::new(BatchJob::new());
        let mut jobs = self.jobs.lock().map_err(|_| "批量任务锁失效")?;
        if jobs.contains_key(&job_id) {
            return Err("批量任务 ID 重复".to_string());
        }
        jobs.insert(job_id, job.clone());
        Ok(job)
    }

    fn get(&self, job_id: &str) -> Option<Arc<BatchJob>> {
        self.jobs.lock().ok()?.get(job_id).cloned()
    }

    fn cancel(&self, job_id: &str) -> bool {
        if let Some(job) = self.get(job_id) {
            job.cancel.cancel();
            job.paused.store(false, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    fn pause(&self, job_id: &str, paused: bool) -> bool {
        if let Some(job) = self.get(job_id) {
            job.paused.store(paused, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    fn finish(&self, job_id: &str) {
        if let Ok(mut jobs) = self.jobs.lock() {
            jobs.remove(job_id);
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub index: i64,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
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
pub struct SteamScanStart {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamScanError {
    pub job_id: String,
    pub message: String,
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
    diagnostics::init(&data_dir)?;
    let db_path = data_dir.join("miyumanager.sqlite3");
    if let Some(backup) = database_maintenance::apply_pending_restore(&data_dir, &db_path)
        .await
        .with_context(|| "无法应用待恢复的数据库快照")?
    {
        diagnostics::event(
            "info",
            "database_restore_completed",
            "数据库恢复已在启动阶段完成",
            serde_json::json!({"safetyBackup": backup.path}),
        );
    }
    let pool = db::open_pool(&db_path).await.inspect_err(|error| {
        diagnostics::event(
            "fatal",
            "database_open_failed",
            "数据库无法打开或迁移失败",
            serde_json::json!({"error": error.to_string(), "path": db_path.to_string_lossy()}),
        );
    })?;
    let recovered = tracking::recover_open_sessions(&pool).await?;
    if recovered > 0 {
        diagnostics::event(
            "info",
            "play_sessions_recovered",
            "已结算上次异常退出留下的游玩会话",
            serde_json::json!({"count": recovered}),
        );
    }
    let preferences = preferences::load(&pool).await?;
    let proxy = preferences.effective_proxy();
    let metadata_http = Arc::new(MetadataHttp::with_proxy(proxy.clone())?);
    let oauth = Arc::new(OAuthService::new_with_proxy(&data_dir, proxy)?);

    Ok(AppState {
        pool,
        data_dir,
        db_path,
        scan: Arc::new(ScanCoordinator::default()),
        launches: Arc::new(LaunchManager::default()),
        metadata_http: RwLock::new(metadata_http),
        metadata_jobs: Arc::new(MetadataCoordinator::default()),
        batch_jobs: Arc::new(BatchCoordinator::default()),
        oauth,
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
pub async fn work_update(
    state: State<'_, AppState>,
    work_id: i64,
    input: WorkUpdateInput,
) -> Result<(), String> {
    db::update_work(&state.pool, work_id, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn work_validate(
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<ValidationReport, String> {
    db::validate_launch(&state.pool, work_id, None)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn work_set_cover(
    state: State<'_, AppState>,
    work_id: i64,
    source_path: String,
) -> Result<CoverAsset, String> {
    assets::set_cover(
        &state.pool,
        &state.data_dir,
        work_id,
        &source_path,
        "manual",
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn work_apply_local_cover(
    state: State<'_, AppState>,
    work_id: i64,
    source_path: String,
) -> Result<CoverAsset, String> {
    assets::set_cover(&state.pool, &state.data_dir, work_id, &source_path, "local")
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn work_clear_cover(state: State<'_, AppState>, work_id: i64) -> Result<(), String> {
    assets::clear_cover(&state.pool, &state.data_dir, work_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn work_discover_covers(
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<Vec<CoverCandidate>, String> {
    assets::discover_covers(&state.pool, work_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn launch_profile_save(
    state: State<'_, AppState>,
    work_id: i64,
    profile: LaunchProfile,
) -> Result<LaunchProfile, String> {
    db::save_launch_profile(&state.pool, work_id, profile)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn launch_config_save(
    state: State<'_, AppState>,
    work_id: i64,
    input: LaunchConfigInput,
) -> Result<LaunchProfile, String> {
    db::save_launch_config(&state.pool, work_id, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn launch_config_validate(
    state: State<'_, AppState>,
    work_id: i64,
    input: LaunchConfigInput,
) -> Result<ValidationReport, String> {
    db::validate_launch_config_report(&state.pool, work_id, &input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn launch_validate(
    state: State<'_, AppState>,
    work_id: i64,
    profile: Option<LaunchProfile>,
) -> Result<ValidationReport, String> {
    db::validate_launch(&state.pool, work_id, profile)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn launch_start(
    app: AppHandle,
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<LaunchSnapshot, String> {
    launcher::start(app, state.pool.clone(), state.launches.clone(), work_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn launch_stop(state: State<'_, AppState>, work_id: i64) -> Result<bool, String> {
    launcher::stop(&state.launches, work_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn launch_state(
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<Option<LaunchSnapshot>, String> {
    Ok(launcher::state(&state.launches, work_id))
}

#[tauri::command]
pub async fn sessions_list(
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<Vec<PlaySessionWithWork>, String> {
    tracking::list_work_sessions(&state.pool, work_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn session_create(
    state: State<'_, AppState>,
    input: SessionCreateInput,
) -> Result<PlaySessionWithWork, String> {
    tracking::create_manual_session(&state.pool, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn session_update(
    state: State<'_, AppState>,
    session_id: i64,
    input: SessionUpdateInput,
) -> Result<PlaySessionWithWork, String> {
    tracking::update_manual_session(&state.pool, session_id, input)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn session_delete(state: State<'_, AppState>, session_id: i64) -> Result<(), String> {
    tracking::delete_session(&state.pool, session_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn stats_get(
    state: State<'_, AppState>,
    period: Option<String>,
) -> Result<StatsOverview, String> {
    tracking::stats_overview(&state.pool, StatsPeriod::parse(period.as_deref()))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn monitors_list(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口尚未创建".to_string())?;
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let size = monitor.size();
            MonitorInfo {
                index: index as i64,
                name: monitor
                    .name()
                    .cloned()
                    .unwrap_or_else(|| format!("显示器 {}", index + 1)),
                width: size.width,
                height: size.height,
                scale_factor: monitor.scale_factor(),
            }
        })
        .collect())
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
pub async fn collections_list(
    state: State<'_, AppState>,
) -> Result<Vec<CollectionSummary>, String> {
    db::list_collections(&state.pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn collection_create(
    state: State<'_, AppState>,
    name: String,
) -> Result<CollectionSummary, String> {
    db::create_collection(&state.pool, &name)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn collection_rename(
    state: State<'_, AppState>,
    collection_id: i64,
    name: String,
) -> Result<CollectionSummary, String> {
    db::rename_collection(&state.pool, collection_id, &name)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn collection_delete(
    state: State<'_, AppState>,
    collection_id: i64,
) -> Result<(), String> {
    db::delete_collection(&state.pool, collection_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn collection_reorder(
    state: State<'_, AppState>,
    collection_ids: Vec<i64>,
) -> Result<(), String> {
    db::reorder_collections(&state.pool, &collection_ids)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn collection_add_works(
    state: State<'_, AppState>,
    collection_id: i64,
    work_ids: Vec<i64>,
) -> Result<usize, String> {
    db::add_collection_works(&state.pool, collection_id, &work_ids)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn collection_remove_work(
    state: State<'_, AppState>,
    collection_id: i64,
    work_id: i64,
) -> Result<(), String> {
    db::remove_collection_work(&state.pool, collection_id, work_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn report_frontend_error(input: FrontendError) -> Result<(), String> {
    diagnostics::record_frontend_error(input);
    Ok(())
}

#[tauri::command]
pub async fn database_health(state: State<'_, AppState>) -> Result<DatabaseHealth, String> {
    database_maintenance::health(&state.pool, &state.data_dir, &state.db_path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn database_backup(
    state: State<'_, AppState>,
    destination: String,
) -> Result<BackupInfo, String> {
    database_maintenance::backup_to(
        &state.pool,
        &state.data_dir,
        &state.db_path,
        Path::new(&destination),
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn database_backup_default(state: State<'_, AppState>) -> Result<BackupInfo, String> {
    database_maintenance::backup_to_default(&state.pool, &state.data_dir, &state.db_path)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn database_restore(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
) -> Result<RestoreOutcome, String> {
    let pool = state.pool.clone();
    let data_dir = state.data_dir.clone();
    let db_path = state.db_path.clone();
    let result =
        database_maintenance::restore_database(&pool, &data_dir, &db_path, Path::new(&source_path))
            .await;
    if let Err(error) = &result {
        diagnostics::event(
            "error",
            "database_restore_failed",
            "数据库恢复未完成",
            serde_json::json!({"error": error.to_string(), "source": source_path}),
        );
    }
    if result.is_ok() {
        let restart_app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(450)).await;
            restart_app.restart();
        });
    }
    result.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn app_info(state: State<'_, AppState>) -> Result<AppInfo, String> {
    let library_count = db::library_count(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let exclusion_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM scan_exclusions")
        .fetch_one(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let root_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM scan_roots")
        .fetch_one(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let preferences = preferences::load(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    Ok(AppInfo {
        data_dir: state.data_dir.to_string_lossy().to_string(),
        db_path: state.db_path.to_string_lossy().to_string(),
        backup_dir: database_maintenance::backup_dir(&state.data_dir)
            .to_string_lossy()
            .to_string(),
        log_dir: diagnostics::log_dir()
            .unwrap_or_else(|| state.data_dir.join("logs"))
            .to_string_lossy()
            .to_string(),
        library_count,
        exclusion_count,
        root_count,
        onboarding_completed: preferences.onboarding_completed,
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub async fn preferences_get(state: State<'_, AppState>) -> Result<AppPreferences, String> {
    preferences::load(&state.pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn preferences_update(
    state: State<'_, AppState>,
    mut input: AppPreferences,
) -> Result<AppPreferences, String> {
    input.validate().map_err(|error| error.to_string())?;
    let previous = preferences::load(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let previous_proxy = previous.effective_proxy();
    let next_proxy = input.effective_proxy();
    if previous_proxy != next_proxy {
        state.replace_http(next_proxy)?;
    }
    preferences::save(&state.pool, &input)
        .await
        .map_err(|error| error.to_string())?;
    Ok(input)
}

#[tauri::command]
pub async fn onboarding_complete(state: State<'_, AppState>) -> Result<AppPreferences, String> {
    preferences::mark_onboarding_completed(&state.pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_data_dir(state: State<'_, AppState>) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(&state.data_dir)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("无法打开数据目录：{error}"))
    }
    #[cfg(not(windows))]
    {
        let _ = state;
        Err("当前平台不支持打开数据目录".to_string())
    }
}

#[tauri::command]
pub fn open_backup_dir(state: State<'_, AppState>) -> Result<(), String> {
    let directory = database_maintenance::backup_dir(&state.data_dir);
    std::fs::create_dir_all(&directory).map_err(|error| format!("无法创建备份目录：{error}"))?;
    open_directory(&directory)
}

#[tauri::command]
pub fn open_log_dir(state: State<'_, AppState>) -> Result<(), String> {
    let directory = diagnostics::log_dir().unwrap_or_else(|| state.data_dir.join("logs"));
    std::fs::create_dir_all(&directory).map_err(|error| format!("无法创建日志目录：{error}"))?;
    open_directory(&directory)
}

fn open_directory(directory: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(directory)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("无法打开目录：{error}"))
    }
    #[cfg(not(windows))]
    {
        let _ = directory;
        Err("当前平台不支持打开目录".to_string())
    }
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|error| format!("链接格式无效：{error}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("只允许打开 http 或 https 链接".to_string());
    }
    webbrowser::open(parsed.as_str())
        .map(|_| ())
        .map_err(|error| format!("无法打开系统浏览器：{error}"))
}

#[tauri::command]
pub fn reveal_work_path(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let target = std::path::PathBuf::from(&path);
        if !target.exists() {
            return Err("路径不存在，可能已被移动或删除。".to_string());
        }
        let mut command = std::process::Command::new("explorer.exe");
        if target.is_file() {
            command.arg(format!("/select,{}", target.display()));
        } else {
            command.arg(&target);
        }
        command
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("无法打开所在文件夹：{error}"))
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("当前平台不支持在文件夹中显示".to_string())
    }
}

#[tauri::command]
pub async fn update_check(state: State<'_, AppState>) -> Result<UpdateCheck, String> {
    let preferences = preferences::load(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let http = state.http();
    Ok(preferences::check_for_update(
        &http,
        &preferences.update_manifest_url,
        env!("CARGO_PKG_VERSION"),
    )
    .await)
}

#[tauri::command]
pub async fn library_scan_start(
    app: AppHandle,
    state: State<'_, AppState>,
    root_path: String,
    include_excluded: Option<bool>,
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
    let exclusions = db::load_scan_exclusions(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let exclusions = scan::ScanExclusions {
        exe_keys: exclusions.exe_keys,
        dir_keys: exclusions.dir_keys,
    };
    let manual_import = include_excluded.unwrap_or(false);

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
                &exclusions,
                manual_import,
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
pub async fn steam_scan_start(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SteamScanStart, String> {
    let job_id = uuid::Uuid::new_v4().to_string();
    let cancel = state.scan.start(job_id.clone())?;
    let existing = db::existing_exe_keys(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let existing_app_ids = db::existing_steam_app_ids(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let exclusions = db::load_scan_exclusions(&state.pool)
        .await
        .map_err(|error| error.to_string())?;
    let exclusions = scan::ScanExclusions {
        exe_keys: exclusions.exe_keys,
        dir_keys: exclusions.dir_keys,
    };
    let app_handle = app.clone();
    let coordinator = state.scan.clone();
    let task_job_id = job_id.clone();

    tauri::async_runtime::spawn(async move {
        let progress_app = app_handle.clone();
        let progress_job = task_job_id.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            steam_library::scan_steam_libraries(
                &task_job_id,
                cancel,
                &exclusions,
                &existing,
                &existing_app_ids,
                move |progress| {
                    let _ = progress_app.emit("steam-scan-progress", progress);
                },
            )
        })
        .await;

        match result {
            Ok(Ok(report)) => {
                let _ = app_handle.emit("steam-scan-complete", report);
            }
            Ok(Err(error)) => {
                let _ = app_handle.emit(
                    "steam-scan-error",
                    SteamScanError {
                        job_id: progress_job.clone(),
                        message: error.to_string(),
                    },
                );
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "steam-scan-error",
                    SteamScanError {
                        job_id: progress_job.clone(),
                        message: format!("Steam 扫描任务失败：{error}"),
                    },
                );
            }
        }
        coordinator.finish(&progress_job);
    });

    Ok(SteamScanStart { job_id })
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

#[tauri::command]
pub async fn library_scan_exclusions(
    state: State<'_, AppState>,
) -> Result<Vec<ScanExclusionRecord>, String> {
    db::list_scan_exclusions(&state.pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn library_remove_scan_exclusion(
    state: State<'_, AppState>,
    exe_key: String,
) -> Result<(), String> {
    db::remove_scan_exclusion(&state.pool, &exe_key)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_providers(
    state: State<'_, AppState>,
) -> Result<Vec<metadata::ProviderInfo>, String> {
    metadata::list_providers(&state.pool, &state.oauth)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_provider_reorder(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<(), String> {
    metadata::reorder_providers(&state.pool, &ids)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_provider_set_enabled(
    state: State<'_, AppState>,
    provider_id: String,
    enabled: bool,
) -> Result<(), String> {
    metadata::set_provider_enabled(&state.pool, &provider_id, enabled)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_work_state(
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<metadata::MetadataWorkState, String> {
    metadata::work_state(&state.pool, &state.oauth, work_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_search_start(
    app: AppHandle,
    state: State<'_, AppState>,
    work_id: i64,
    query: String,
    provider: Option<String>,
) -> Result<metadata::MetadataJobStart, String> {
    if !db::work_exists(&state.pool, work_id)
        .await
        .map_err(|error| error.to_string())?
    {
        return Err("作品不存在".to_string());
    }
    let job_id = uuid::Uuid::new_v4().to_string();
    let cancel = state.metadata_jobs.start(job_id.clone())?;
    let pool = state.pool.clone();
    let http = state.http();
    let oauth = state.oauth.clone();
    let coordinator = state.metadata_jobs.clone();
    let app_handle = app.clone();
    let task_job_id = job_id.clone();
    let start = metadata::MetadataJobStart {
        job_id: job_id.clone(),
    };

    tauri::async_runtime::spawn(async move {
        let progress_app = app_handle.clone();
        let progress_job = task_job_id.clone();
        let result = metadata::search_all(
            &pool,
            &http,
            &oauth,
            &query,
            provider.as_deref(),
            &cancel,
            move |provider_id, provider_name, completed, total| {
                let _ = progress_app.emit(
                    "metadata-search-progress",
                    metadata::MetadataSearchProgress {
                        job_id: progress_job.clone(),
                        work_id,
                        provider: provider_id.to_string(),
                        provider_name: provider_name.to_string(),
                        completed,
                        total,
                        message: format!("正在查询 {provider_name}"),
                    },
                );
            },
        )
        .await;

        match result {
            Ok(outcome) => {
                let _ = app_handle.emit(
                    "metadata-search-complete",
                    metadata::MetadataSearchComplete {
                        job_id: task_job_id.clone(),
                        work_id,
                        query,
                        results: outcome.results,
                        errors: outcome.errors,
                        cancelled: outcome.cancelled,
                    },
                );
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "metadata-search-error",
                    metadata::MetadataSearchError {
                        job_id: task_job_id.clone(),
                        work_id,
                        message: error.to_string(),
                    },
                );
            }
        }
        coordinator.finish(&task_job_id);
    });

    Ok(start)
}

#[tauri::command]
pub async fn metadata_search_cancel(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<bool, String> {
    Ok(state.metadata_jobs.cancel(&job_id))
}

#[tauri::command]
pub async fn metadata_candidate_preview(
    state: State<'_, AppState>,
    work_id: i64,
    provider: String,
    source_id: String,
) -> Result<metadata::MetadataPreview, String> {
    let cancel = CancellationToken::new();
    let http = state.http();
    metadata::preview(
        &state.pool,
        &http,
        &state.oauth,
        work_id,
        &provider,
        &source_id,
        &cancel,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_import(
    state: State<'_, AppState>,
    request: MetadataImportRequest,
) -> Result<MetadataImportResult, String> {
    let cancel = CancellationToken::new();
    let http = state.http();
    metadata::import(
        &state.pool,
        &state.data_dir,
        &http,
        &state.oauth,
        request,
        &cancel,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_field_priorities(
    state: State<'_, AppState>,
) -> Result<Vec<metadata::FieldPriorityState>, String> {
    metadata::field_priority_states(&state.pool, &state.oauth)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_field_priority_reorder(
    state: State<'_, AppState>,
    field: String,
    provider_ids: Vec<String>,
) -> Result<(), String> {
    metadata::reorder_field_priorities(&state.pool, &state.oauth, &field, &provider_ids)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_field_priority_reset(
    state: State<'_, AppState>,
    field: String,
) -> Result<(), String> {
    metadata::reset_field_priority(&state.pool, &field)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_set_field_priority_global(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<bool, String> {
    metadata::set_field_priority_global(&state.pool, enabled)
        .await
        .map_err(|error| error.to_string())?;
    Ok(enabled)
}

#[tauri::command]
pub async fn metadata_merge_preview(
    state: State<'_, AppState>,
    work_id: i64,
    providers: Option<Vec<String>>,
) -> Result<metadata::MergePreview, String> {
    let cancel = CancellationToken::new();
    let http = state.http();
    metadata::merge_preview(
        &state.pool,
        &http,
        &state.oauth,
        work_id,
        providers.as_deref(),
        &cancel,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_merge_apply(
    state: State<'_, AppState>,
    request: metadata::MergeApplyRequest,
) -> Result<metadata::MergeApplyResult, String> {
    let cancel = CancellationToken::new();
    let http = state.http();
    metadata::merge_apply(
        &state.pool,
        &state.data_dir,
        &http,
        &state.oauth,
        request,
        &cancel,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_adopt_claim(
    state: State<'_, AppState>,
    work_id: i64,
    claim_id: i64,
) -> Result<metadata::MergeApplyResult, String> {
    let cancel = CancellationToken::new();
    let http = state.http();
    metadata::adopt_claim(
        &state.pool,
        &state.data_dir,
        &http,
        &state.oauth,
        work_id,
        claim_id,
        &cancel,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn metadata_batch_start(
    app: AppHandle,
    state: State<'_, AppState>,
    request: metadata::BatchStartRequest,
) -> Result<metadata::MetadataJobStart, String> {
    let mut work_ids = request.work_ids;
    work_ids.sort_unstable();
    work_ids.dedup();
    if work_ids.is_empty() {
        return Err("批量刮削至少需要选择一部作品".to_string());
    }
    if work_ids.len() > 200 {
        return Err("一次最多批量处理 200 部作品".to_string());
    }
    let job_id = uuid::Uuid::new_v4().to_string();
    let job = state.batch_jobs.start(job_id.clone())?;
    let pool = state.pool.clone();
    let http = state.http();
    let oauth = state.oauth.clone();
    let coordinator = state.batch_jobs.clone();
    let app_handle = app.clone();
    let task_job_id = job_id.clone();
    let provider_ids = request.provider_ids;
    let include_covers = request.include_covers;
    let task_job = job.clone();

    tauri::async_runtime::spawn(async move {
        let total = work_ids.len();
        let mut completed = 0usize;
        let mut failed = 0usize;
        let mut skipped = 0usize;
        let provider_filter: Option<Vec<String>> = if provider_ids.is_empty() {
            None
        } else {
            Some(provider_ids)
        };
        for work_id in work_ids {
            if task_job.cancel.is_cancelled() {
                break;
            }
            while task_job.paused.load(Ordering::SeqCst) {
                if task_job.cancel.is_cancelled() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            if task_job.cancel.is_cancelled() {
                break;
            }
            let title: Option<String> =
                sqlx::query_scalar("SELECT canonical_title FROM works WHERE id = ?")
                    .bind(work_id)
                    .fetch_optional(&pool)
                    .await
                    .ok()
                    .flatten();
            let title = title.unwrap_or_else(|| format!("作品 #{work_id}"));
            let _ = app_handle.emit(
                "metadata-batch-progress",
                metadata::BatchProgress {
                    job_id: task_job_id.clone(),
                    total,
                    completed,
                    failed,
                    skipped,
                    paused: task_job.paused.load(Ordering::SeqCst),
                    cancelled: task_job.cancel.is_cancelled(),
                    current_work_id: Some(work_id),
                    current_title: title.clone(),
                    message: format!("正在匹配 {title}"),
                },
            );
            let result = metadata::merge_preview(
                &pool,
                &http,
                &oauth,
                work_id,
                provider_filter.as_deref(),
                &task_job.cancel,
            )
            .await;
            match result {
                Ok(mut preview) => {
                    if !include_covers {
                        preview.covers.clear();
                    }
                    preview.work_id = work_id;
                    let has_proposals = !preview.fields.is_empty() || !preview.covers.is_empty();
                    if has_proposals {
                        if let Ok(mut previews) = task_job.previews.lock() {
                            previews.insert(work_id, preview.clone());
                        }
                        let _ = app_handle.emit(
                            "metadata-batch-work",
                            metadata::BatchWorkResult {
                                job_id: task_job_id.clone(),
                                work_id,
                                title,
                                status: "proposed".to_string(),
                                preview: Some(preview),
                                error: None,
                            },
                        );
                    } else {
                        skipped += 1;
                        let _ = app_handle.emit(
                            "metadata-batch-work",
                            metadata::BatchWorkResult {
                                job_id: task_job_id.clone(),
                                work_id,
                                title,
                                status: "skipped".to_string(),
                                preview: None,
                                error: None,
                            },
                        );
                    }
                }
                Err(error) => {
                    failed += 1;
                    let _ = app_handle.emit(
                        "metadata-batch-work",
                        metadata::BatchWorkResult {
                            job_id: task_job_id.clone(),
                            work_id,
                            title,
                            status: "failed".to_string(),
                            preview: None,
                            error: Some(error.to_string()),
                        },
                    );
                }
            }
            completed += 1;
            let _ = app_handle.emit(
                "metadata-batch-progress",
                metadata::BatchProgress {
                    job_id: task_job_id.clone(),
                    total,
                    completed,
                    failed,
                    skipped,
                    paused: task_job.paused.load(Ordering::SeqCst),
                    cancelled: task_job.cancel.is_cancelled(),
                    current_work_id: None,
                    current_title: String::new(),
                    message: format!("已完成 {completed} / {total}"),
                },
            );
        }
        let cancelled = task_job.cancel.is_cancelled();
        let _ = app_handle.emit(
            "metadata-batch-complete",
            metadata::BatchComplete {
                job_id: task_job_id.clone(),
                total,
                completed,
                failed,
                cancelled,
                message: if cancelled {
                    format!("批量任务已取消，完成 {completed} / {total}")
                } else {
                    format!("批量匹配完成，{completed} / {total} 部作品已生成提案")
                },
            },
        );
        if cancelled {
            coordinator.finish(&task_job_id);
        }
    });

    Ok(metadata::MetadataJobStart { job_id })
}

#[tauri::command]
pub async fn metadata_batch_pause(
    state: State<'_, AppState>,
    job_id: String,
    paused: bool,
) -> Result<bool, String> {
    Ok(state.batch_jobs.pause(&job_id, paused))
}

#[tauri::command]
pub async fn metadata_batch_cancel(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<bool, String> {
    Ok(state.batch_jobs.cancel(&job_id))
}

#[tauri::command]
pub async fn metadata_batch_apply(
    app: AppHandle,
    state: State<'_, AppState>,
    request: metadata::BatchApplyRequest,
) -> Result<metadata::BatchApplyResult, String> {
    let job = state
        .batch_jobs
        .get(&request.job_id)
        .ok_or_else(|| "批量任务不存在或已结束".to_string())?;
    let previews = {
        let guard = job.previews.lock().map_err(|_| "批量提案锁失效")?;
        guard
            .iter()
            .map(|(work_id, preview)| (*work_id, preview.clone()))
            .collect::<Vec<_>>()
    };
    let selected: HashSet<i64> = if request.work_ids.is_empty() {
        previews.iter().map(|(work_id, _)| *work_id).collect()
    } else {
        request.work_ids.iter().copied().collect()
    };
    let total = selected.len();
    let mut completed = 0usize;
    let mut applied_works = 0usize;
    let mut failed_works = 0usize;
    let mut skipped_works = 0usize;
    let mut applied_fields = 0usize;
    let mut cover_applied = 0usize;
    let mut works = Vec::new();
    let http = state.http();

    for (work_id, preview) in previews.into_iter() {
        if !selected.contains(&work_id) {
            continue;
        }
        let mut selections = Vec::new();
        for field in &preview.fields {
            if field.default_selected
                && let Some(candidate) = field.candidates.first()
            {
                selections.push(metadata::MergeSelection {
                    field: field.field.clone(),
                    provider: candidate.provider.clone(),
                    source_id: candidate.source_id.clone(),
                    url: None,
                });
            }
        }
        let cover = if request.include_covers {
            preview
                .covers
                .iter()
                .find(|cover| cover.default_selected)
                .map(|cover| metadata::MergeSelection {
                    field: "cover".to_string(),
                    provider: cover.provider.clone(),
                    source_id: cover.source_id.clone(),
                    url: Some(cover.url.clone()),
                })
        } else {
            None
        };
        let source_links = preview
            .matched
            .iter()
            .map(|matched| metadata::MergeSourceLink {
                provider: matched.provider.clone(),
                source_id: matched.source_id.clone(),
                title: matched.title.clone(),
            })
            .collect::<Vec<_>>();
        let result = if selections.is_empty() && cover.is_none() && source_links.is_empty() {
            Ok(metadata::MergeApplyResult {
                applied: Vec::new(),
                skipped_non_empty: Vec::new(),
                cover_applied: false,
                errors: Vec::new(),
            })
        } else {
            metadata::merge_apply(
                &state.pool,
                &state.data_dir,
                &http,
                &state.oauth,
                metadata::MergeApplyRequest {
                    work_id,
                    selections,
                    cover,
                    source_links,
                    only_if_empty: true,
                },
                &job.cancel,
            )
            .await
        };
        match result {
            Ok(result) => {
                let status = if result.applied.is_empty() && !result.cover_applied {
                    skipped_works += 1;
                    "skipped"
                } else {
                    applied_works += 1;
                    "applied"
                };
                applied_fields += result.applied.len();
                if result.cover_applied {
                    cover_applied += 1;
                }
                works.push(metadata::BatchApplyWorkResult {
                    work_id,
                    title: preview.title.clone(),
                    status: status.to_string(),
                    applied: result.applied,
                    skipped_non_empty: result.skipped_non_empty,
                    cover_applied: result.cover_applied,
                    errors: result.errors,
                });
            }
            Err(error) => {
                failed_works += 1;
                works.push(metadata::BatchApplyWorkResult {
                    work_id,
                    title: preview.title.clone(),
                    status: "failed".to_string(),
                    applied: Vec::new(),
                    skipped_non_empty: Vec::new(),
                    cover_applied: false,
                    errors: vec![error.to_string()],
                });
            }
        }
        completed += 1;
        let _ = app.emit(
            "metadata-batch-apply-progress",
            metadata::BatchProgress {
                job_id: request.job_id.clone(),
                total,
                completed,
                failed: failed_works,
                skipped: skipped_works,
                paused: false,
                cancelled: false,
                current_work_id: Some(work_id),
                current_title: preview.title.clone(),
                message: format!("正在应用 {completed} / {total}"),
            },
        );
    }

    state.batch_jobs.finish(&request.job_id);
    Ok(metadata::BatchApplyResult {
        total,
        applied_works,
        failed_works,
        skipped_works,
        applied_fields,
        cover_applied,
        works,
    })
}

#[tauri::command]
pub async fn oauth_status(
    state: State<'_, AppState>,
) -> Result<Vec<crate::oauth::OAuthStatus>, String> {
    state
        .oauth
        .statuses(&state.pool)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn oauth_config_info(
    state: State<'_, AppState>,
) -> Result<crate::oauth::OAuthConfigInfo, String> {
    Ok(state.oauth.config_info())
}

#[tauri::command]
pub async fn oauth_import_config(
    state: State<'_, AppState>,
    source_path: String,
) -> Result<crate::oauth::OAuthConfigInfo, String> {
    state
        .oauth
        .install_config(Path::new(&source_path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn oauth_connect(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<crate::oauth::OAuthStatus, String> {
    state
        .oauth
        .connect(&state.pool, &provider_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn oauth_sync_profile(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<crate::oauth::OAuthStatus, String> {
    state
        .oauth
        .sync_profile(&state.pool, &provider_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn oauth_disconnect(
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<(), String> {
    state
        .oauth
        .disconnect(&state.pool, &provider_id)
        .await
        .map_err(|error| error.to_string())
}

fn mark_existing(existing: &HashSet<String>, candidates: &mut [ScanCandidate]) {
    for candidate in candidates {
        candidate.already_imported = existing.contains(&candidate.exe_key);
    }
}
