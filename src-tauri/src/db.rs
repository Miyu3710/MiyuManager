use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, SqlitePool};

pub const STATUSES: [&str; 5] = ["unclassified", "playing", "queued", "finished", "paused"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryQuery {
    #[serde(default)]
    pub search: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default = "default_sort")]
    pub sort: String,
    #[serde(default)]
    pub page: u32,
    #[serde(default = "default_page_size")]
    pub page_size: u32,
    #[serde(default)]
    pub favorite_only: bool,
    #[serde(default)]
    pub collection_id: Option<i64>,
}

fn default_status() -> String {
    "all".to_string()
}

fn default_sort() -> String {
    "added_desc".to_string()
}

fn default_page_size() -> u32 {
    60
}

impl Default for LibraryQuery {
    fn default() -> Self {
        Self {
            search: String::new(),
            status: default_status(),
            sort: default_sort(),
            page: 0,
            page_size: default_page_size(),
            favorite_only: false,
            collection_id: None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCounts {
    pub all: i64,
    pub unclassified: i64,
    pub playing: i64,
    pub queued: i64,
    pub finished: i64,
    pub paused: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    pub local_copy_id: i64,
    pub work_id: i64,
    pub title: String,
    pub original_title: String,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub year: Option<i64>,
    pub edition: Option<String>,
    pub status: String,
    pub rating: Option<f64>,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub description: String,
    pub size_bytes: i64,
    pub file_size_bytes: i64,
    pub exe_path: String,
    pub working_dir: String,
    pub root_path: String,
    pub display_name: String,
    pub steam_app_id: Option<i64>,
    pub install_status: String,
    pub added_at: String,
    pub last_played_at: Option<String>,
    pub playtime_minutes: i64,
    pub playtime_seconds: i64,
    pub launch_count: i64,
    pub catalog_no: String,
    pub cover_thumb_path: Option<String>,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItemDetail {
    #[serde(flatten)]
    pub item: LibraryItem,
    pub notes: String,
    pub release_date: Option<String>,
    pub language: Option<String>,
    pub platform: String,
    pub aliases: Vec<String>,
    pub cover_source: Option<String>,
    pub cover_updated_at: Option<String>,
    pub launch_profile: Option<LaunchProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchProfile {
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<EnvVar>,
    #[serde(default)]
    pub wrapper_path: Option<String>,
    #[serde(default)]
    pub wrapper_args: Vec<String>,
    #[serde(default)]
    pub monitor: Option<i64>,
    #[serde(default)]
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchConfigInput {
    pub exe_path: String,
    pub working_dir: String,
    pub profile: LaunchProfile,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkUpdateInput {
    pub title: String,
    #[serde(default)]
    pub original_title: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub year: Option<i64>,
    #[serde(default)]
    pub developer: Option<String>,
    #[serde(default)]
    pub publisher: Option<String>,
    #[serde(default)]
    pub edition: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub rating: Option<f64>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathCheck {
    pub path: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub exe: PathCheck,
    pub working_dir: PathCheck,
    pub wrapper: Option<PathCheck>,
    pub valid: bool,
}

#[derive(Debug, Clone)]
pub struct LaunchTarget {
    pub local_copy_id: i64,
    pub title: String,
    pub exe_path: String,
    pub working_dir: String,
    pub steam_app_id: Option<i64>,
    pub profile: LaunchProfile,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPage {
    pub items: Vec<LibraryItem>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
    pub counts: LibraryCounts,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRoot {
    pub id: i64,
    pub path: String,
    pub enabled: bool,
    pub last_scanned_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanExclusionRecord {
    pub id: i64,
    pub exe_key: String,
    pub exe_path: String,
    pub dir_key: String,
    pub working_dir: String,
    pub root_path: String,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct ScanExclusionSets {
    pub exe_keys: HashSet<String>,
    pub dir_keys: HashSet<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub data_dir: String,
    pub db_path: String,
    pub library_count: i64,
    pub exclusion_count: i64,
    pub root_count: i64,
    pub onboarding_completed: bool,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidateInput {
    pub exe_path: String,
    pub working_dir: String,
    pub display_name: String,
    pub root_path: String,
    #[serde(default)]
    pub size_bytes: i64,
    #[serde(default)]
    pub steam_app_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub updated: usize,
}

pub async fn open_pool(db_path: &Path) -> Result<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("无法创建数据目录 {}", parent.display()))?;
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .with_context(|| format!("无法打开数据库 {}", db_path.display()))?;

    run_migrations(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
pub async fn open_memory_pool() -> Result<SqlitePool> {
    let options = "sqlite::memory:"
        .parse::<SqliteConnectOptions>()?
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    run_migrations(&pool).await?;
    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    sqlx::migrate!("./migrations")
        .run(pool)
        .await
        .context("数据库迁移失败")?;
    Ok(())
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\")
}

pub fn canonical_directory(path: &Path) -> Result<PathBuf> {
    let canonical = dunce::canonicalize(path)
        .with_context(|| format!("目录不存在或无法访问：{}", path.display()))?;
    if !canonical.is_dir() {
        bail!("不是目录：{}", canonical.display());
    }
    Ok(canonical)
}

pub async fn ensure_scan_root(pool: &SqlitePool, path: &Path) -> Result<ScanRoot> {
    let canonical = canonical_directory(path)?;
    let path = path_string(&canonical);
    let path_key = path.to_lowercase();

    sqlx::query(
        "INSERT INTO scan_roots (path, path_key) VALUES (?, ?)
         ON CONFLICT(path_key) DO UPDATE SET path = excluded.path",
    )
    .bind(&path)
    .bind(&path_key)
    .execute(pool)
    .await?;

    let row = sqlx::query(
        "SELECT id, path, enabled, last_scanned_at, created_at FROM scan_roots WHERE path_key = ?",
    )
    .bind(&path_key)
    .fetch_one(pool)
    .await?;

    row_to_scan_root(&row)
}

pub async fn list_scan_roots(pool: &SqlitePool) -> Result<Vec<ScanRoot>> {
    let rows = sqlx::query(
        "SELECT id, path, enabled, last_scanned_at, created_at
         FROM scan_roots ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;

    rows.iter().map(row_to_scan_root).collect()
}

pub async fn remove_scan_root(pool: &SqlitePool, root_id: i64) -> Result<()> {
    let result = sqlx::query("DELETE FROM scan_roots WHERE id = ?")
        .bind(root_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        bail!("扫描目录不存在");
    }
    Ok(())
}

pub async fn mark_root_scanned(pool: &SqlitePool, path: &str) -> Result<()> {
    sqlx::query(
        "UPDATE scan_roots
         SET last_scanned_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE path_key = ?",
    )
    .bind(path.to_lowercase())
    .execute(pool)
    .await?;
    Ok(())
}

fn row_to_scan_root(row: &sqlx::sqlite::SqliteRow) -> Result<ScanRoot> {
    Ok(ScanRoot {
        id: row.try_get("id")?,
        path: row.try_get("path")?,
        enabled: row.try_get::<i64, _>("enabled")? != 0,
        last_scanned_at: row.try_get("last_scanned_at")?,
        created_at: row.try_get("created_at")?,
    })
}

const PRIMARY_COPY_CTE: &str = "
WITH primary_copy AS (
  SELECT lc.*, ROW_NUMBER() OVER (PARTITION BY r.work_id ORDER BY lc.id ASC) AS rn
  FROM local_copies lc
  JOIN releases r ON r.id = lc.release_id
), session_totals AS (
  SELECT local_copy_id, COALESCE(SUM(duration_sec), 0) AS duration_sec
  FROM play_sessions
  GROUP BY local_copy_id
)
";

const LIBRARY_JOINS: &str = "
FROM works w
JOIN primary_copy lc ON lc.rn = 1
JOIN releases r ON r.id = lc.release_id AND r.work_id = w.id
LEFT JOIN user_entries ue ON ue.work_id = w.id
LEFT JOIN session_totals st ON st.local_copy_id = lc.id
";

struct FilterParts {
    sql: String,
    binds: Vec<String>,
}

fn build_filters(query: &LibraryQuery, force_like: bool, include_status: bool) -> FilterParts {
    let mut clauses = Vec::new();
    let mut binds = Vec::new();
    let search = query.search.trim();

    if !search.is_empty() {
        let like = format!("%{}%", escape_like(search));
        if !force_like && search.chars().count() >= 3 {
            let fts = format!("\"{}\"", search.replace('"', "\"\""));
            clauses.push(
                "(w.id IN (SELECT rowid FROM works_fts WHERE works_fts MATCH ?)
                  OR r.developer LIKE ? ESCAPE '\\'
                  OR r.publisher LIKE ? ESCAPE '\\'
                  OR w.tags_json LIKE ? ESCAPE '\\'
                  OR lc.display_name LIKE ? ESCAPE '\\'
                  OR lc.exe_path LIKE ? ESCAPE '\\')"
                    .to_string(),
            );
            binds.push(fts);
            for _ in 0..5 {
                binds.push(like.clone());
            }
        } else {
            clauses.push(
                "(w.canonical_title LIKE ? ESCAPE '\\'
                  OR w.original_title LIKE ? ESCAPE '\\'
                  OR w.aliases_json LIKE ? ESCAPE '\\'
                  OR w.tags_json LIKE ? ESCAPE '\\'
                  OR r.developer LIKE ? ESCAPE '\\'
                  OR r.publisher LIKE ? ESCAPE '\\'
                  OR lc.display_name LIKE ? ESCAPE '\\'
                  OR lc.exe_path LIKE ? ESCAPE '\\')"
                    .to_string(),
            );
            for _ in 0..8 {
                binds.push(like.clone());
            }
        }
    }

    let status = query.status.trim();
    if include_status && !status.is_empty() && status != "all" && STATUSES.contains(&status) {
        clauses.push("COALESCE(ue.status, 'unclassified') = ?".to_string());
        binds.push(status.to_string());
    }

    if query.favorite_only {
        clauses.push("COALESCE(ue.favorite, 0) = 1".to_string());
    }

    if let Some(collection_id) = query.collection_id {
        clauses.push(format!(
            "w.id IN (SELECT work_id FROM collection_items WHERE collection_id = {collection_id})"
        ));
    }

    FilterParts {
        sql: if clauses.is_empty() {
            "1 = 1".to_string()
        } else {
            clauses.join(" AND ")
        },
        binds,
    }
}

fn order_clause(sort: &str) -> &'static str {
    match sort {
        "title_asc" => "w.canonical_title COLLATE NOCASE ASC, lc.id ASC",
        "size_desc" => "lc.size_bytes DESC, w.id DESC",
        "last_played_desc" => {
            "lc.last_launched_at IS NULL, lc.last_launched_at DESC, lc.created_at DESC, w.id DESC"
        }
        _ => "lc.created_at DESC, w.id DESC",
    }
}

pub async fn query_library(pool: &SqlitePool, query: LibraryQuery) -> Result<LibraryPage> {
    match query_library_inner(pool, query.clone(), false).await {
        Ok(page) => Ok(page),
        Err(error) if query.search.trim().chars().count() >= 3 => {
            query_library_inner(pool, query, true)
                .await
                .with_context(|| format!("全文搜索失败，改用模糊搜索也失败：{error}"))
        }
        Err(error) => Err(error),
    }
}

async fn query_library_inner(
    pool: &SqlitePool,
    query: LibraryQuery,
    force_like: bool,
) -> Result<LibraryPage> {
    let page = query.page;
    let page_size = query.page_size.clamp(1, 200);
    let offset = i64::from(page) * i64::from(page_size);

    let filters = build_filters(&query, force_like, true);
    let count_filters = build_filters(&query, force_like, false);

    let total_sql = format!(
        "{PRIMARY_COPY_CTE}
         SELECT COUNT(DISTINCT w.id)
         {LIBRARY_JOINS}
         WHERE {}",
        filters.sql
    );
    let mut total_query = sqlx::query_scalar::<_, i64>(&total_sql);
    for value in &filters.binds {
        total_query = total_query.bind(value);
    }
    let total = total_query.fetch_one(pool).await?;

    let page_sql = format!(
        "{PRIMARY_COPY_CTE}
         SELECT
           lc.id AS local_copy_id,
           w.id AS work_id,
           w.canonical_title AS title,
           w.original_title,
           w.tags_json,
           r.developer,
           r.publisher,
           w.release_year AS year,
           r.edition,
           COALESCE(ue.status, 'unclassified') AS status,
           ue.rating,
           COALESCE(ue.favorite, 0) AS favorite,
           w.description,
           lc.size_bytes,
           lc.file_size_bytes,
           lc.exe_path,
           lc.working_dir,
           lc.root_path,
           lc.display_name,
           lc.steam_app_id,
           lc.install_status,
           lc.created_at AS added_at,
           lc.last_launched_at AS last_played_at,
           COALESCE(st.duration_sec, 0) / 60 AS playtime_minutes,
           COALESCE(st.duration_sec, 0) AS playtime_seconds,
           lc.launch_count,
           printf('LOCAL-%04d', lc.id) AS catalog_no,
           (SELECT a.thumb_path FROM assets a
             WHERE a.work_id = w.id AND a.kind = 'cover' LIMIT 1) AS cover_thumb_path,
           (SELECT a.original_path FROM assets a
             WHERE a.work_id = w.id AND a.kind = 'cover' LIMIT 1) AS cover_path
         {LIBRARY_JOINS}
         WHERE {}
         ORDER BY {}
         LIMIT ? OFFSET ?",
        filters.sql,
        order_clause(&query.sort)
    );

    let mut page_query = sqlx::query(&page_sql);
    for value in &filters.binds {
        page_query = page_query.bind(value);
    }
    let rows = page_query
        .bind(i64::from(page_size))
        .bind(offset)
        .fetch_all(pool)
        .await?;
    let items = rows
        .iter()
        .map(row_to_library_item)
        .collect::<Result<Vec<_>>>()?;

    let counts_sql = format!(
        "{PRIMARY_COPY_CTE}
         SELECT COALESCE(ue.status, 'unclassified') AS status, COUNT(DISTINCT w.id) AS count
         {LIBRARY_JOINS}
         WHERE {}
         GROUP BY COALESCE(ue.status, 'unclassified')",
        count_filters.sql
    );
    let mut counts_query = sqlx::query(&counts_sql);
    for value in &count_filters.binds {
        counts_query = counts_query.bind(value);
    }
    let count_rows = counts_query.fetch_all(pool).await?;
    let mut counts = LibraryCounts::default();
    for row in count_rows {
        let status: String = row.try_get("status")?;
        let count: i64 = row.try_get("count")?;
        counts.all += count;
        match status.as_str() {
            "playing" => counts.playing = count,
            "queued" => counts.queued = count,
            "finished" => counts.finished = count,
            "paused" => counts.paused = count,
            _ => counts.unclassified = count,
        }
    }

    Ok(LibraryPage {
        items,
        total,
        page,
        page_size,
        counts,
    })
}

fn row_to_library_item(row: &sqlx::sqlite::SqliteRow) -> Result<LibraryItem> {
    Ok(LibraryItem {
        local_copy_id: row.try_get("local_copy_id")?,
        work_id: row.try_get("work_id")?,
        title: row.try_get("title")?,
        original_title: row.try_get("original_title")?,
        developer: row.try_get("developer")?,
        publisher: row.try_get("publisher")?,
        year: row.try_get("year")?,
        edition: row.try_get("edition")?,
        status: row.try_get("status")?,
        rating: row.try_get("rating")?,
        favorite: row.try_get::<i64, _>("favorite")? != 0,
        tags: parse_json_list(row.try_get::<String, _>("tags_json")?),
        description: row.try_get("description")?,
        size_bytes: row.try_get("size_bytes")?,
        file_size_bytes: row.try_get("file_size_bytes")?,
        exe_path: row.try_get("exe_path")?,
        working_dir: row.try_get("working_dir")?,
        root_path: row.try_get("root_path")?,
        display_name: row.try_get("display_name")?,
        steam_app_id: row.try_get("steam_app_id")?,
        install_status: row.try_get("install_status")?,
        added_at: row.try_get("added_at")?,
        last_played_at: row.try_get("last_played_at")?,
        playtime_minutes: row.try_get("playtime_minutes")?,
        playtime_seconds: row.try_get("playtime_seconds")?,
        launch_count: row.try_get("launch_count")?,
        catalog_no: row.try_get("catalog_no")?,
        cover_thumb_path: row.try_get("cover_thumb_path")?,
        cover_path: row.try_get("cover_path")?,
    })
}

fn parse_json_list(value: String) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(&value).unwrap_or_default()
}

pub async fn get_library_item(
    pool: &SqlitePool,
    work_id: i64,
) -> Result<Option<LibraryItemDetail>> {
    let sql = format!(
        "{PRIMARY_COPY_CTE}
         SELECT
           lc.id AS local_copy_id,
           w.id AS work_id,
           w.canonical_title AS title,
           w.original_title,
           w.tags_json,
           r.developer,
           r.publisher,
           w.release_year AS year,
           r.edition,
           COALESCE(ue.status, 'unclassified') AS status,
           ue.rating,
           COALESCE(ue.favorite, 0) AS favorite,
           w.description,
           lc.size_bytes,
           lc.file_size_bytes,
           lc.exe_path,
           lc.working_dir,
           lc.root_path,
           lc.display_name,
           lc.steam_app_id,
           lc.install_status,
           lc.created_at AS added_at,
           lc.last_launched_at AS last_played_at,
           COALESCE(st.duration_sec, 0) / 60 AS playtime_minutes,
           COALESCE(st.duration_sec, 0) AS playtime_seconds,
           lc.launch_count,
           printf('LOCAL-%04d', lc.id) AS catalog_no,
           (SELECT a.thumb_path FROM assets a
             WHERE a.work_id = w.id AND a.kind = 'cover' LIMIT 1) AS cover_thumb_path,
           (SELECT a.original_path FROM assets a
             WHERE a.work_id = w.id AND a.kind = 'cover' LIMIT 1) AS cover_path,
           COALESCE(ue.notes, '') AS notes,
           w.aliases_json,
           r.release_date,
           r.language,
           r.platform,
           (SELECT a.source FROM assets a
             WHERE a.work_id = w.id AND a.kind = 'cover' LIMIT 1) AS cover_source,
           (SELECT a.updated_at FROM assets a
             WHERE a.work_id = w.id AND a.kind = 'cover' LIMIT 1) AS cover_updated_at
         {LIBRARY_JOINS}
         WHERE w.id = ?
         ORDER BY lc.id ASC
         LIMIT 1"
    );

    let row = sqlx::query(&sql).bind(work_id).fetch_optional(pool).await?;
    let Some(row) = row else {
        return Ok(None);
    };

    let item = row_to_library_item(&row)?;
    let launch_profile = get_launch_profile(pool, item.local_copy_id).await?;

    Ok(Some(LibraryItemDetail {
        item,
        notes: row.try_get("notes")?,
        release_date: row.try_get("release_date")?,
        language: row.try_get("language")?,
        platform: row.try_get("platform")?,
        aliases: parse_json_list(row.try_get::<String, _>("aliases_json")?),
        cover_source: row.try_get("cover_source")?,
        cover_updated_at: row.try_get("cover_updated_at")?,
        launch_profile,
    }))
}

pub async fn set_library_status(pool: &SqlitePool, work_id: i64, status: &str) -> Result<()> {
    if !STATUSES.contains(&status) {
        bail!("未知的游玩状态：{status}");
    }
    if !work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    sqlx::query(
        "INSERT INTO user_entries (work_id, status, updated_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(work_id) DO UPDATE
         SET status = excluded.status, updated_at = excluded.updated_at",
    )
    .bind(work_id)
    .bind(status)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_library_favorite(pool: &SqlitePool, work_id: i64, favorite: bool) -> Result<()> {
    if !work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    sqlx::query(
        "INSERT INTO user_entries (work_id, favorite, updated_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(work_id) DO UPDATE
         SET favorite = excluded.favorite, updated_at = excluded.updated_at",
    )
    .bind(work_id)
    .bind(if favorite { 1 } else { 0 })
    .execute(pool)
    .await?;
    Ok(())
}

fn clean_list(
    values: Vec<String>,
    max_items: usize,
    max_len: usize,
    label: &str,
) -> Result<Vec<String>> {
    if values.len() > max_items {
        bail!("{label}最多 {max_items} 项");
    }
    let mut seen = HashSet::new();
    let mut cleaned = Vec::new();
    for value in values {
        let value = value.trim().to_string();
        if value.is_empty() {
            continue;
        }
        if value.chars().count() > max_len {
            bail!("{label}单项不能超过 {max_len} 个字符");
        }
        let key = value.to_lowercase();
        if seen.insert(key) {
            cleaned.push(value);
        }
    }
    Ok(cleaned)
}

fn clean_optional(value: Option<String>, max_len: usize, label: &str) -> Result<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_string();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > max_len {
        bail!("{label}不能超过 {max_len} 个字符");
    }
    Ok(Some(value))
}

fn validate_release_date(value: &str) -> Result<()> {
    if value.is_empty() {
        return Ok(());
    }
    if !value.is_ascii() {
        bail!("发行日期需要写成 YYYY-MM-DD");
    }
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        bail!("发行日期需要写成 YYYY-MM-DD");
    }
    let year = value[0..4].parse::<i32>().context("发行日期年份无效")?;
    let month = value[5..7].parse::<u32>().context("发行日期月份无效")?;
    let day = value[8..10].parse::<u32>().context("发行日期日期无效")?;
    if !(1900..=2100).contains(&year) || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        bail!("发行日期超出可用范围");
    }
    Ok(())
}

pub async fn update_work(pool: &SqlitePool, work_id: i64, input: WorkUpdateInput) -> Result<()> {
    if !work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    let title = input.title.trim();
    if title.is_empty() {
        bail!("标题不能为空");
    }
    if title.chars().count() > 200 {
        bail!("标题不能超过 200 个字符");
    }
    let original_title = input.original_title.trim();
    if original_title.chars().count() > 200 {
        bail!("原题不能超过 200 个字符");
    }
    if input.description.chars().count() > 8000 {
        bail!("简介不能超过 8000 个字符");
    }
    if input.notes.chars().count() > 4000 {
        bail!("备注不能超过 4000 个字符");
    }
    if let Some(year) = input.year
        && !(1900..=2100).contains(&year)
    {
        bail!("年份需要在 1900 到 2100 之间");
    }
    if let Some(rating) = input.rating
        && (!rating.is_finite() || !(0.0..=10.0).contains(&rating))
    {
        bail!("个人评分需要在 0 到 10 之间");
    }
    let status = if input.status.trim().is_empty() {
        "unclassified"
    } else {
        input.status.trim()
    };
    if !STATUSES.contains(&status) {
        bail!("未知的游玩状态：{status}");
    }
    let aliases = clean_list(input.aliases, 20, 120, "别名")?;
    let tags = clean_list(input.tags, 30, 40, "标签")?;
    let developer = clean_optional(input.developer, 200, "开发商")?;
    let publisher = clean_optional(input.publisher, 200, "发行商")?;
    let edition = clean_optional(input.edition, 100, "版本")?;
    let language = clean_optional(input.language, 100, "语言")?;
    let release_date = clean_optional(input.release_date, 10, "发行日期")?;
    if let Some(value) = &release_date {
        validate_release_date(value)?;
    }
    let aliases_json = serde_json::to_string(&aliases)?;
    let tags_json = serde_json::to_string(&tags)?;

    let mut tx = pool.begin().await?;
    let old = sqlx::query(
        "SELECT w.canonical_title, w.original_title, w.aliases_json, w.description,
                w.release_year, w.tags_json, r.developer, r.publisher, r.release_date
         FROM works w
         LEFT JOIN releases r ON r.id = (
           SELECT r2.id FROM releases r2 JOIN local_copies lc ON lc.release_id = r2.id
           WHERE r2.work_id = w.id ORDER BY lc.id ASC LIMIT 1
         )
         WHERE w.id = ?",
    )
    .bind(work_id)
    .fetch_one(&mut *tx)
    .await?;
    let developer_for_claim = developer.clone();
    let publisher_for_claim = publisher.clone();
    let release_date_for_claim = release_date.clone();
    sqlx::query(
        "UPDATE works
         SET canonical_title = ?, original_title = ?, aliases_json = ?, description = ?,
             release_year = ?, tags_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?",
    )
    .bind(title)
    .bind(original_title)
    .bind(aliases_json)
    .bind(input.description.trim())
    .bind(input.year)
    .bind(tags_json)
    .bind(work_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE releases
         SET developer = ?, publisher = ?, edition = ?, language = ?, release_date = ?
         WHERE id = (
           SELECT r.id FROM releases r
           JOIN local_copies lc ON lc.release_id = r.id
           WHERE r.work_id = ?
           ORDER BY lc.id ASC LIMIT 1
         )",
    )
    .bind(developer)
    .bind(publisher)
    .bind(edition)
    .bind(language)
    .bind(release_date)
    .bind(work_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO user_entries (work_id, status, rating, favorite, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(work_id) DO UPDATE SET
           status = excluded.status,
           rating = excluded.rating,
           favorite = excluded.favorite,
           notes = excluded.notes,
           updated_at = excluded.updated_at",
    )
    .bind(work_id)
    .bind(status)
    .bind(input.rating)
    .bind(if input.favorite { 1 } else { 0 })
    .bind(input.notes.trim())
    .execute(&mut *tx)
    .await?;

    let mut manual_changes: Vec<(&str, serde_json::Value)> = Vec::new();
    if old.get::<String, _>("canonical_title") != title {
        manual_changes.push(("title", serde_json::Value::String(title.to_string())));
    }
    if old.get::<String, _>("original_title") != original_title {
        manual_changes.push((
            "original_title",
            serde_json::Value::String(original_title.to_string()),
        ));
    }
    if old.get::<String, _>("aliases_json") != serde_json::to_string(&aliases).unwrap_or_default() {
        manual_changes.push(("aliases", serde_json::to_value(&aliases)?));
    }
    if old.get::<String, _>("description") != input.description.trim() {
        manual_changes.push((
            "description",
            serde_json::Value::String(input.description.trim().to_string()),
        ));
    }
    if old.get::<Option<i64>, _>("release_year") != input.year {
        manual_changes.push((
            "year",
            input
                .year
                .map_or(serde_json::Value::Null, serde_json::Value::from),
        ));
    }
    if old.get::<String, _>("tags_json") != serde_json::to_string(&tags).unwrap_or_default() {
        manual_changes.push(("tags", serde_json::to_value(&tags)?));
    }
    if old.get::<Option<String>, _>("developer") != developer_for_claim {
        manual_changes.push((
            "developer",
            developer_for_claim
                .clone()
                .map_or(serde_json::Value::Null, serde_json::Value::String),
        ));
    }
    if old.get::<Option<String>, _>("publisher") != publisher_for_claim {
        manual_changes.push((
            "publisher",
            publisher_for_claim
                .clone()
                .map_or(serde_json::Value::Null, serde_json::Value::String),
        ));
    }
    if old.get::<Option<String>, _>("release_date") != release_date_for_claim {
        manual_changes.push((
            "release_date",
            release_date_for_claim
                .clone()
                .map_or(serde_json::Value::Null, serde_json::Value::String),
        ));
    }
    for (field, value) in manual_changes {
        crate::metadata::record_manual_claim(&mut tx, work_id, field, &value).await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn get_launch_profile(
    pool: &SqlitePool,
    local_copy_id: i64,
) -> Result<Option<LaunchProfile>> {
    let row = sqlx::query(
        "SELECT args_json, env_json, wrapper_path, wrapper_args_json, monitor, fullscreen
         FROM launch_profiles WHERE local_copy_id = ?",
    )
    .bind(local_copy_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    Ok(Some(LaunchProfile {
        args: parse_json_list(row.try_get("args_json")?),
        env: serde_json::from_str::<Vec<EnvVar>>(&row.try_get::<String, _>("env_json")?)
            .unwrap_or_default(),
        wrapper_path: row.try_get("wrapper_path")?,
        wrapper_args: parse_json_list(row.try_get("wrapper_args_json")?),
        monitor: row.try_get("monitor")?,
        fullscreen: row.try_get::<i64, _>("fullscreen")? != 0,
    }))
}

fn clean_args(values: Vec<String>, label: &str) -> Result<Vec<String>> {
    if values.len() > 128 {
        bail!("{label}最多 128 项");
    }
    let mut cleaned = Vec::new();
    for value in values {
        if value.contains('\0') {
            bail!("{label}不能包含 NUL 字符");
        }
        if value.chars().count() > 8192 {
            bail!("{label}单项不能超过 8192 个字符");
        }
        cleaned.push(value);
    }
    Ok(cleaned)
}

fn clean_env(values: Vec<EnvVar>) -> Result<Vec<EnvVar>> {
    if values.len() > 128 {
        bail!("环境变量最多 128 项");
    }
    let mut seen = HashSet::new();
    let mut cleaned = Vec::new();
    for variable in values {
        let key = variable.key.trim();
        if key.is_empty() {
            continue;
        }
        if key.chars().count() > 128 || key.contains('=') || key.contains('\0') {
            bail!("环境变量名称无效：{key}");
        }
        if variable.value.contains('\0') {
            bail!("环境变量 {key} 的值包含 NUL 字符");
        }
        if seen.insert(key.to_lowercase()) {
            cleaned.push(EnvVar {
                key: key.to_string(),
                value: variable.value,
            });
        }
    }
    Ok(cleaned)
}

pub fn validate_profile(profile: &LaunchProfile) -> Result<()> {
    clean_args(profile.args.clone(), "启动参数")?;
    clean_args(profile.wrapper_args.clone(), "包装器参数")?;
    clean_env(profile.env.clone())?;
    if profile
        .wrapper_path
        .as_deref()
        .is_some_and(|path| path.contains('\0'))
    {
        bail!("包装器路径不能包含 NUL 字符");
    }
    Ok(())
}

pub async fn save_launch_profile(
    pool: &SqlitePool,
    work_id: i64,
    profile: LaunchProfile,
) -> Result<LaunchProfile> {
    let local_copy_id: Option<i64> = sqlx::query_scalar(
        "SELECT lc.id FROM local_copies lc
         JOIN releases r ON r.id = lc.release_id
         WHERE r.work_id = ? ORDER BY lc.id ASC LIMIT 1",
    )
    .bind(work_id)
    .fetch_optional(pool)
    .await?;
    let Some(local_copy_id) = local_copy_id else {
        bail!("作品没有本地安装副本");
    };
    validate_profile(&profile)?;
    let args = clean_args(profile.args, "启动参数")?;
    let wrapper_args = clean_args(profile.wrapper_args, "包装器参数")?;
    let env = clean_env(profile.env)?;
    let wrapper_path = clean_optional(profile.wrapper_path, 4096, "包装器路径")?;
    if let Some(path) = &wrapper_path {
        let wrapper = Path::new(path);
        if !wrapper.is_file() {
            bail!("包装器不存在或不是文件：{path}");
        }
    }
    let env_json = serde_json::to_string(&env)?;
    let args_json = serde_json::to_string(&args)?;
    let wrapper_args_json = serde_json::to_string(&wrapper_args)?;
    sqlx::query(
        "INSERT INTO launch_profiles
           (local_copy_id, args_json, env_json, wrapper_path, wrapper_args_json, monitor, fullscreen)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(local_copy_id) DO UPDATE SET
           args_json = excluded.args_json,
           env_json = excluded.env_json,
           wrapper_path = excluded.wrapper_path,
           wrapper_args_json = excluded.wrapper_args_json,
           monitor = excluded.monitor,
           fullscreen = excluded.fullscreen,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
    )
    .bind(local_copy_id)
    .bind(args_json)
    .bind(env_json)
    .bind(wrapper_path)
    .bind(wrapper_args_json)
    .bind(profile.monitor)
    .bind(if profile.fullscreen { 1 } else { 0 })
    .execute(pool)
    .await?;
    get_launch_profile(pool, local_copy_id)
        .await?
        .context("启动配置保存后无法读取")
}

pub async fn save_launch_config(
    pool: &SqlitePool,
    work_id: i64,
    input: LaunchConfigInput,
) -> Result<LaunchProfile> {
    let report = validate_launch_config_report(pool, work_id, &input).await?;
    if !report.valid {
        let mut reasons = Vec::new();
        if !report.exe.ok {
            reasons.push(report.exe.message);
        }
        if !report.working_dir.ok {
            reasons.push(report.working_dir.message);
        }
        if let Some(wrapper) = &report.wrapper
            && !wrapper.ok
        {
            reasons.push(wrapper.message.clone());
        }
        bail!("{}", reasons.join("；"));
    }
    let local_copy_id = validate_launch_config(pool, work_id, &input).await?;
    let exe = dunce::canonicalize(&input.exe_path)
        .with_context(|| format!("可执行文件不存在：{}", input.exe_path))?;
    let working_dir = dunce::canonicalize(&input.working_dir)
        .with_context(|| format!("工作目录不存在：{}", input.working_dir))?;
    let exe_path = path_string(&exe);
    let exe_key = exe_path.to_lowercase();
    let conflict: Option<i64> =
        sqlx::query_scalar("SELECT id FROM local_copies WHERE exe_key = ? AND id <> ?")
            .bind(&exe_key)
            .bind(local_copy_id)
            .fetch_optional(pool)
            .await?;
    if conflict.is_some() {
        bail!("这个可执行文件已经属于库中的另一部作品");
    }
    sqlx::query(
        "UPDATE local_copies
         SET exe_path = ?, exe_key = ?, working_dir = ?, install_status = 'installed',
             last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?",
    )
    .bind(&exe_path)
    .bind(&exe_key)
    .bind(path_string(&working_dir))
    .bind(local_copy_id)
    .execute(pool)
    .await?;
    save_launch_profile(pool, work_id, input.profile).await
}

async fn validate_launch_config(
    pool: &SqlitePool,
    work_id: i64,
    input: &LaunchConfigInput,
) -> Result<i64> {
    validate_profile(&input.profile)?;
    let local_copy_id: Option<i64> = sqlx::query_scalar(
        "SELECT lc.id FROM local_copies lc
         JOIN releases r ON r.id = lc.release_id
         WHERE r.work_id = ? ORDER BY lc.id ASC LIMIT 1",
    )
    .bind(work_id)
    .fetch_optional(pool)
    .await?;
    let Some(local_copy_id) = local_copy_id else {
        bail!("作品没有本地安装副本");
    };
    Ok(local_copy_id)
}

pub async fn validate_launch_config_report(
    pool: &SqlitePool,
    work_id: i64,
    input: &LaunchConfigInput,
) -> Result<ValidationReport> {
    validate_launch_config(pool, work_id, input).await?;
    let exe = check_file(&input.exe_path, Some("exe"), "可执行文件");
    let working_dir = check_directory(&input.working_dir);
    let wrapper = input
        .profile
        .wrapper_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .map(|path| check_file(path, Some("exe"), "包装器"));
    let valid = exe.ok && working_dir.ok && wrapper.as_ref().is_none_or(|check| check.ok);
    Ok(ValidationReport {
        exe,
        working_dir,
        wrapper,
        valid,
    })
}

pub async fn get_launch_target(pool: &SqlitePool, work_id: i64) -> Result<LaunchTarget> {
    let row = sqlx::query(
        "SELECT lc.id AS local_copy_id, w.id AS work_id, w.canonical_title AS title,
                lc.exe_path, lc.working_dir, lc.steam_app_id
         FROM works w
         JOIN releases r ON r.work_id = w.id
         JOIN local_copies lc ON lc.release_id = r.id
         WHERE w.id = ?
         ORDER BY lc.id ASC LIMIT 1",
    )
    .bind(work_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else {
        bail!("作品没有本地安装副本");
    };
    let local_copy_id: i64 = row.try_get("local_copy_id")?;
    let profile = get_launch_profile(pool, local_copy_id)
        .await?
        .unwrap_or_default();
    Ok(LaunchTarget {
        local_copy_id,
        title: row.try_get("title")?,
        exe_path: row.try_get("exe_path")?,
        working_dir: row.try_get("working_dir")?,
        steam_app_id: row.try_get("steam_app_id")?,
        profile,
    })
}

#[cfg(test)]
pub async fn record_launch_started(pool: &SqlitePool, local_copy_id: i64) -> Result<String> {
    sqlx::query(
        "UPDATE local_copies
         SET last_launched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             launch_count = launch_count + 1,
             install_status = 'installed'
         WHERE id = ?",
    )
    .bind(local_copy_id)
    .execute(pool)
    .await?;
    let started_at: Option<String> =
        sqlx::query_scalar("SELECT last_launched_at FROM local_copies WHERE id = ?")
            .bind(local_copy_id)
            .fetch_one(pool)
            .await?;
    started_at.context("启动时间写入失败")
}

fn check_file(path: &str, extension: Option<&str>, label: &str) -> PathCheck {
    let candidate = Path::new(path);
    if !candidate.exists() {
        return PathCheck {
            path: path.to_string(),
            ok: false,
            message: format!("{label}不存在"),
        };
    }
    if !candidate.is_file() {
        return PathCheck {
            path: path.to_string(),
            ok: false,
            message: format!("{label}不是文件"),
        };
    }
    if let Some(extension) = extension
        && !candidate
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
    {
        return PathCheck {
            path: path.to_string(),
            ok: false,
            message: format!("{label}需要是 .{extension} 文件"),
        };
    }
    PathCheck {
        path: path.to_string(),
        ok: true,
        message: format!("{label}可用"),
    }
}

fn check_directory(path: &str) -> PathCheck {
    let candidate = Path::new(path);
    if !candidate.exists() {
        return PathCheck {
            path: path.to_string(),
            ok: false,
            message: "工作目录不存在".to_string(),
        };
    }
    if !candidate.is_dir() {
        return PathCheck {
            path: path.to_string(),
            ok: false,
            message: "工作目录不是文件夹".to_string(),
        };
    }
    PathCheck {
        path: path.to_string(),
        ok: true,
        message: "工作目录可用".to_string(),
    }
}

pub async fn validate_launch(
    pool: &SqlitePool,
    work_id: i64,
    profile: Option<LaunchProfile>,
) -> Result<ValidationReport> {
    let target = get_launch_target(pool, work_id).await?;
    let profile = profile.unwrap_or(target.profile);
    validate_profile(&profile)?;
    let exe = check_file(&target.exe_path, Some("exe"), "可执行文件");
    let working_dir = check_directory(&target.working_dir);
    let wrapper = profile
        .wrapper_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .map(|path| check_file(path, Some("exe"), "包装器"));
    let valid = exe.ok && working_dir.ok && wrapper.as_ref().is_none_or(|check| check.ok);
    if !exe.ok {
        sqlx::query("UPDATE local_copies SET install_status = 'missing' WHERE id = ?")
            .bind(target.local_copy_id)
            .execute(pool)
            .await?;
    } else {
        sqlx::query("UPDATE local_copies SET install_status = 'installed' WHERE id = ?")
            .bind(target.local_copy_id)
            .execute(pool)
            .await?;
    }
    Ok(ValidationReport {
        exe,
        working_dir,
        wrapper,
        valid,
    })
}

pub async fn remove_library_work(pool: &SqlitePool, work_id: i64) -> Result<()> {
    let mut tx = pool.begin().await?;
    let copies = sqlx::query(
        "SELECT lc.exe_path, lc.exe_key, lc.working_dir, lc.root_path
         FROM local_copies lc
         JOIN releases r ON r.id = lc.release_id
         WHERE r.work_id = ?",
    )
    .bind(work_id)
    .fetch_all(&mut *tx)
    .await?;

    if copies.is_empty() {
        let exists: i64 = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM works WHERE id = ?)")
            .bind(work_id)
            .fetch_one(&mut *tx)
            .await?;
        if exists == 0 {
            bail!("作品不存在");
        }
    }

    for copy in copies {
        let exe_path: String = copy.try_get("exe_path")?;
        let exe_key: String = copy.try_get("exe_key")?;
        let working_dir: String = copy.try_get("working_dir")?;
        let root_path: String = copy.try_get("root_path")?;
        let dir_key = working_dir.to_lowercase();
        sqlx::query(
            "INSERT INTO scan_exclusions (exe_key, exe_path, dir_key, working_dir, root_path, reason)
             VALUES (?, ?, ?, ?, ?, 'removed_from_library')
             ON CONFLICT(exe_key) DO UPDATE SET
               exe_path = excluded.exe_path,
               dir_key = excluded.dir_key,
               working_dir = excluded.working_dir,
               root_path = excluded.root_path,
               reason = excluded.reason",
        )
        .bind(&exe_key)
        .bind(&exe_path)
        .bind(&dir_key)
        .bind(&working_dir)
        .bind(&root_path)
        .execute(&mut *tx)
        .await?;
    }

    let result = sqlx::query("DELETE FROM works WHERE id = ?")
        .bind(work_id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        bail!("作品不存在");
    }
    tx.commit().await?;
    Ok(())
}

pub async fn work_exists(pool: &SqlitePool, work_id: i64) -> Result<bool> {
    let exists: i64 = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM works WHERE id = ?)")
        .bind(work_id)
        .fetch_one(pool)
        .await?;
    Ok(exists != 0)
}

pub async fn library_count(pool: &SqlitePool) -> Result<i64> {
    Ok(sqlx::query_scalar("SELECT COUNT(*) FROM works")
        .fetch_one(pool)
        .await?)
}

pub async fn existing_exe_keys(pool: &SqlitePool) -> Result<HashSet<String>> {
    let keys = sqlx::query_scalar::<_, String>("SELECT exe_key FROM local_copies")
        .fetch_all(pool)
        .await?;
    Ok(keys.into_iter().collect())
}

pub async fn existing_steam_app_ids(pool: &SqlitePool) -> Result<HashSet<i64>> {
    let ids = sqlx::query_scalar::<_, i64>(
        "SELECT steam_app_id FROM local_copies WHERE steam_app_id IS NOT NULL",
    )
    .fetch_all(pool)
    .await?;
    Ok(ids.into_iter().collect())
}

pub async fn list_scan_exclusions(pool: &SqlitePool) -> Result<Vec<ScanExclusionRecord>> {
    let rows = sqlx::query(
        "SELECT id, exe_key, exe_path, dir_key, working_dir, root_path, reason, created_at
         FROM scan_exclusions ORDER BY created_at DESC, id DESC",
    )
    .fetch_all(pool)
    .await?;

    rows.iter().map(row_to_scan_exclusion).collect()
}

pub async fn load_scan_exclusions(pool: &SqlitePool) -> Result<ScanExclusionSets> {
    let records = list_scan_exclusions(pool).await?;
    let mut exclusions = ScanExclusionSets::default();
    for record in records {
        exclusions.exe_keys.insert(record.exe_key);
        exclusions.dir_keys.insert(record.dir_key);
    }
    Ok(exclusions)
}

pub async fn remove_scan_exclusion(pool: &SqlitePool, exe_key: &str) -> Result<()> {
    let dir_key: Option<String> =
        sqlx::query_scalar("SELECT dir_key FROM scan_exclusions WHERE exe_key = ?")
            .bind(exe_key)
            .fetch_optional(pool)
            .await?;
    if let Some(dir_key) = dir_key {
        sqlx::query("DELETE FROM scan_exclusions WHERE exe_key = ? OR dir_key = ?")
            .bind(exe_key)
            .bind(dir_key)
            .execute(pool)
            .await?;
    }
    Ok(())
}

fn row_to_scan_exclusion(row: &sqlx::sqlite::SqliteRow) -> Result<ScanExclusionRecord> {
    Ok(ScanExclusionRecord {
        id: row.try_get("id")?,
        exe_key: row.try_get("exe_key")?,
        exe_path: row.try_get("exe_path")?,
        dir_key: row.try_get("dir_key")?,
        working_dir: row.try_get("working_dir")?,
        root_path: row.try_get("root_path")?,
        reason: row.try_get("reason")?,
        created_at: row.try_get("created_at")?,
    })
}

pub async fn import_candidates(
    pool: &SqlitePool,
    candidates: Vec<ImportCandidateInput>,
) -> Result<ImportResult> {
    if candidates.is_empty() {
        bail!("没有要导入的候选程序");
    }

    struct ValidatedCandidate {
        root_path: String,
        exe_path: String,
        exe_key: String,
        working_dir: String,
        display_name: String,
        size_bytes: i64,
        file_size_bytes: i64,
        steam_app_id: Option<i64>,
    }

    let mut validated = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        let root = canonical_directory(Path::new(&candidate.root_path))?;
        let exe = dunce::canonicalize(&candidate.exe_path)
            .with_context(|| format!("可执行文件不存在：{}", candidate.exe_path))?;
        if !exe.is_file() {
            bail!("不是文件：{}", exe.display());
        }
        if !exe
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        {
            bail!("只接受 .exe 文件：{}", exe.display());
        }
        if !exe.starts_with(&root) {
            bail!("可执行文件不在扫描目录内：{}", exe.display());
        }

        let working_dir = dunce::canonicalize(&candidate.working_dir)
            .with_context(|| format!("工作目录不存在：{}", candidate.working_dir))?;
        if !working_dir.is_dir() {
            bail!("工作目录不存在：{}", working_dir.display());
        }
        if !working_dir.starts_with(&root) {
            bail!("工作目录不在扫描目录内：{}", working_dir.display());
        }

        let display_name = candidate.display_name.trim();
        if display_name.is_empty() {
            bail!("显示名称不能为空");
        }
        if display_name.chars().count() > 200 {
            bail!("显示名称不能超过 200 个字符");
        }

        let exe_path = path_string(&exe);
        let exe_key = exe_path.to_lowercase();
        let file_size_bytes = std::fs::metadata(&exe)
            .map(|metadata| metadata.len() as i64)
            .unwrap_or(0);

        validated.push(ValidatedCandidate {
            root_path: path_string(&root),
            exe_path,
            exe_key,
            working_dir: path_string(&working_dir),
            display_name: display_name.to_string(),
            size_bytes: candidate.size_bytes.max(0),
            file_size_bytes,
            steam_app_id: candidate.steam_app_id,
        });
    }

    let mut roots = std::collections::HashMap::new();
    for candidate in &validated {
        if !roots.contains_key(&candidate.root_path) {
            let root = ensure_scan_root(pool, Path::new(&candidate.root_path)).await?;
            roots.insert(candidate.root_path.clone(), root.id);
        }
    }

    let mut tx = pool.begin().await?;
    let mut result = ImportResult::default();

    for candidate in validated {
        let existing = sqlx::query("SELECT id, display_name FROM local_copies WHERE exe_key = ?")
            .bind(&candidate.exe_key)
            .fetch_optional(&mut *tx)
            .await?;

        let root_id = roots.get(&candidate.root_path).copied();
        if let Some(existing) = existing {
            let previous_display_name: String = existing.try_get("display_name")?;
            sqlx::query(
                "UPDATE local_copies
                 SET root_id = ?, root_path = ?, working_dir = ?, display_name = ?,
                     size_bytes = ?, file_size_bytes = ?, install_status = 'installed',
                     steam_app_id = ?,
                     last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE exe_key = ?",
            )
            .bind(root_id)
            .bind(&candidate.root_path)
            .bind(&candidate.working_dir)
            .bind(&candidate.display_name)
            .bind(candidate.size_bytes)
            .bind(candidate.file_size_bytes)
            .bind(candidate.steam_app_id)
            .bind(&candidate.exe_key)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "UPDATE works
                 SET canonical_title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = (
                   SELECT r.work_id FROM releases r
                   JOIN local_copies lc ON lc.release_id = r.id
                   WHERE lc.exe_key = ?
                 )
                 AND canonical_title = ?",
            )
            .bind(&candidate.display_name)
            .bind(&candidate.exe_key)
            .bind(previous_display_name)
            .execute(&mut *tx)
            .await?;
            sqlx::query("DELETE FROM scan_exclusions WHERE exe_key = ? OR dir_key = ?")
                .bind(&candidate.exe_key)
                .bind(candidate.working_dir.to_lowercase())
                .execute(&mut *tx)
                .await?;
            result.updated += 1;
            continue;
        }

        let work_id = sqlx::query("INSERT INTO works (canonical_title) VALUES (?)")
            .bind(&candidate.display_name)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();
        let release_id = sqlx::query(
            "INSERT INTO releases (work_id, platform, edition) VALUES (?, 'Windows', NULL)",
        )
        .bind(work_id)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        sqlx::query(
            "INSERT INTO local_copies
               (release_id, root_id, root_path, exe_path, exe_key, working_dir, display_name,
                size_bytes, file_size_bytes, steam_app_id, install_status, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'installed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(release_id)
        .bind(root_id)
        .bind(&candidate.root_path)
        .bind(&candidate.exe_path)
        .bind(&candidate.exe_key)
        .bind(&candidate.working_dir)
        .bind(&candidate.display_name)
        .bind(candidate.size_bytes)
        .bind(candidate.file_size_bytes)
        .bind(candidate.steam_app_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT INTO user_entries (work_id, status) VALUES (?, 'unclassified')")
            .bind(work_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM scan_exclusions WHERE exe_key = ? OR dir_key = ?")
            .bind(&candidate.exe_key)
            .bind(candidate.working_dir.to_lowercase())
            .execute(&mut *tx)
            .await?;
        result.imported += 1;
    }

    tx.commit().await?;
    Ok(result)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    pub id: i64,
    pub name: String,
    pub sort_order: i64,
    pub work_count: i64,
    pub covers: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn normalize_collection_name(name: &str) -> Result<String> {
    let value = name.trim();
    if value.is_empty() {
        bail!("收藏集名称不能为空");
    }
    if value.chars().count() > 80 {
        bail!("收藏集名称最多 80 个字符");
    }
    Ok(value.to_string())
}

async fn collection_summary_row(
    pool: &SqlitePool,
    id: i64,
    name: String,
    sort_order: i64,
    created_at: String,
    updated_at: String,
    work_count: i64,
) -> Result<CollectionSummary> {
    let rows = sqlx::query(
        "SELECT a.thumb_path
         FROM collection_items ci
         JOIN assets a ON a.work_id = ci.work_id AND a.kind = 'cover'
         WHERE ci.collection_id = ?
         ORDER BY ci.added_at DESC, ci.work_id DESC
         LIMIT 4",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;
    let covers = rows
        .iter()
        .map(|row| row.try_get::<String, _>("thumb_path"))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(CollectionSummary {
        id,
        name,
        sort_order,
        work_count,
        covers,
        created_at,
        updated_at,
    })
}

pub async fn list_collections(pool: &SqlitePool) -> Result<Vec<CollectionSummary>> {
    let rows = sqlx::query(
        "SELECT c.id, c.name, c.sort_order, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS work_count
         FROM collections c
         ORDER BY c.sort_order ASC, c.id ASC",
    )
    .fetch_all(pool)
    .await?;

    let mut collections = Vec::with_capacity(rows.len());
    for row in rows {
        collections.push(
            collection_summary_row(
                pool,
                row.try_get("id")?,
                row.try_get("name")?,
                row.try_get("sort_order")?,
                row.try_get("created_at")?,
                row.try_get("updated_at")?,
                row.try_get("work_count")?,
            )
            .await?,
        );
    }
    Ok(collections)
}

pub async fn get_collection(pool: &SqlitePool, collection_id: i64) -> Result<CollectionSummary> {
    let row = sqlx::query(
        "SELECT c.id, c.name, c.sort_order, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS work_count
         FROM collections c WHERE c.id = ?",
    )
    .bind(collection_id)
    .fetch_optional(pool)
    .await?
    .context("收藏集不存在")?;
    collection_summary_row(
        pool,
        row.try_get("id")?,
        row.try_get("name")?,
        row.try_get("sort_order")?,
        row.try_get("created_at")?,
        row.try_get("updated_at")?,
        row.try_get("work_count")?,
    )
    .await
}

pub async fn create_collection(pool: &SqlitePool, name: &str) -> Result<CollectionSummary> {
    let name = normalize_collection_name(name)?;
    let duplicate: Option<i64> =
        sqlx::query_scalar("SELECT id FROM collections WHERE name = ? COLLATE NOCASE LIMIT 1")
            .bind(&name)
            .fetch_optional(pool)
            .await?;
    if duplicate.is_some() {
        bail!("已经有同名收藏集");
    }
    let sort_order: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM collections")
            .fetch_one(pool)
            .await?;
    let id = sqlx::query("INSERT INTO collections (name, sort_order) VALUES (?, ?)")
        .bind(&name)
        .bind(sort_order)
        .execute(pool)
        .await?
        .last_insert_rowid();
    get_collection(pool, id).await
}

pub async fn rename_collection(
    pool: &SqlitePool,
    collection_id: i64,
    name: &str,
) -> Result<CollectionSummary> {
    let name = normalize_collection_name(name)?;
    let duplicate: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM collections WHERE name = ? COLLATE NOCASE AND id != ? LIMIT 1",
    )
    .bind(&name)
    .bind(collection_id)
    .fetch_optional(pool)
    .await?;
    if duplicate.is_some() {
        bail!("已经有同名收藏集");
    }
    let result = sqlx::query(
        "UPDATE collections SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?",
    )
    .bind(&name)
    .bind(collection_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        bail!("收藏集不存在");
    }
    get_collection(pool, collection_id).await
}

pub async fn delete_collection(pool: &SqlitePool, collection_id: i64) -> Result<()> {
    let result = sqlx::query("DELETE FROM collections WHERE id = ?")
        .bind(collection_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        bail!("收藏集不存在");
    }
    Ok(())
}

pub async fn reorder_collections(pool: &SqlitePool, ids: &[i64]) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let mut unique = HashSet::new();
    if ids.iter().any(|id| !unique.insert(*id)) {
        bail!("收藏集排序包含重复项");
    }
    let existing: Vec<i64> =
        sqlx::query_scalar("SELECT id FROM collections ORDER BY sort_order ASC, id ASC")
            .fetch_all(pool)
            .await?;
    if existing.len() != ids.len() || existing.iter().any(|id| !unique.contains(id)) {
        bail!("收藏集列表已变化，请刷新后重试");
    }

    let mut tx = pool.begin().await?;
    for (index, id) in ids.iter().enumerate() {
        sqlx::query(
            "UPDATE collections SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?",
        )
        .bind(index as i64 + 1)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn add_collection_works(
    pool: &SqlitePool,
    collection_id: i64,
    work_ids: &[i64],
) -> Result<usize> {
    if work_ids.is_empty() {
        return Ok(0);
    }
    get_collection(pool, collection_id).await?;
    let mut tx = pool.begin().await?;
    let mut added = 0usize;
    for work_id in work_ids {
        let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM works WHERE id = ?")
            .bind(work_id)
            .fetch_optional(&mut *tx)
            .await?;
        if exists.is_none() {
            bail!("作品不存在：{work_id}");
        }
        let result = sqlx::query(
            "INSERT OR IGNORE INTO collection_items (collection_id, work_id) VALUES (?, ?)",
        )
        .bind(collection_id)
        .bind(work_id)
        .execute(&mut *tx)
        .await?;
        added += result.rows_affected() as usize;
    }
    sqlx::query(
        "UPDATE collections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(collection_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(added)
}

pub async fn remove_collection_work(
    pool: &SqlitePool,
    collection_id: i64,
    work_id: i64,
) -> Result<()> {
    sqlx::query("DELETE FROM collection_items WHERE collection_id = ? AND work_id = ?")
        .bind(collection_id)
        .bind(work_id)
        .execute(pool)
        .await?;
    sqlx::query(
        "UPDATE collections SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(collection_id)
    .execute(pool)
    .await?;
    Ok(())
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::*;

    async fn fixture_pool() -> (TempDir, SqlitePool) {
        let temp = TempDir::new().expect("temp dir");
        let root = temp.path().join("games");
        fs::create_dir_all(&root).expect("games dir");
        let game = root.join("月影工房");
        fs::create_dir_all(&game).expect("game dir");
        fs::write(game.join("game.exe"), vec![0u8; 256 * 1024]).expect("exe");
        let pool = open_memory_pool().await.expect("pool");
        (temp, pool)
    }

    async fn imported_pool() -> (TempDir, SqlitePool, i64) {
        let (temp, pool) = fixture_pool().await;
        let root = temp.path().join("games");
        let game = root.join("月影工房");
        let candidate = ImportCandidateInput {
            exe_path: game.join("game.exe").to_string_lossy().to_string(),
            working_dir: game.to_string_lossy().to_string(),
            display_name: "月影工房".to_string(),
            root_path: root.to_string_lossy().to_string(),
            size_bytes: 512 * 1024,
            steam_app_id: None,
        };
        import_candidates(&pool, vec![candidate])
            .await
            .expect("import fixture");
        let work_id = query_library(&pool, LibraryQuery::default())
            .await
            .expect("query fixture")
            .items[0]
            .work_id;
        (temp, pool, work_id)
    }

    #[tokio::test]
    async fn imports_and_queries_a_scanned_game() {
        let (temp, pool) = fixture_pool().await;
        let root = temp.path().join("games");
        let game = root.join("月影工房");
        let candidate = ImportCandidateInput {
            exe_path: game.join("game.exe").to_string_lossy().to_string(),
            working_dir: game.to_string_lossy().to_string(),
            display_name: "月影工房".to_string(),
            root_path: root.to_string_lossy().to_string(),
            size_bytes: 512 * 1024,
            steam_app_id: None,
        };

        let result = import_candidates(&pool, vec![candidate.clone()])
            .await
            .expect("import");
        assert_eq!(result.imported, 1);

        let page = query_library(&pool, LibraryQuery::default())
            .await
            .expect("query");
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].title, "月影工房");
        assert_eq!(page.items[0].status, "unclassified");
        assert_eq!(page.counts.unclassified, 1);

        let search = query_library(
            &pool,
            LibraryQuery {
                search: "月影".to_string(),
                ..LibraryQuery::default()
            },
        )
        .await
        .expect("short search");
        assert_eq!(search.total, 1);

        let fts_search = query_library(
            &pool,
            LibraryQuery {
                search: "月影工".to_string(),
                ..LibraryQuery::default()
            },
        )
        .await
        .expect("fts search");
        assert_eq!(fts_search.total, 1);

        set_library_status(&pool, page.items[0].work_id, "playing")
            .await
            .expect("status");
        let playing = query_library(
            &pool,
            LibraryQuery {
                status: "playing".to_string(),
                ..LibraryQuery::default()
            },
        )
        .await
        .expect("playing query");
        assert_eq!(playing.total, 1);
        assert_eq!(playing.counts.playing, 1);

        let second = import_candidates(&pool, vec![candidate.clone()])
            .await
            .expect("reimport");
        assert_eq!(second.updated, 1);
        assert_eq!(
            query_library(&pool, LibraryQuery::default())
                .await
                .unwrap()
                .total,
            1
        );

        remove_library_work(&pool, page.items[0].work_id)
            .await
            .expect("remove");
        assert_eq!(
            query_library(&pool, LibraryQuery::default())
                .await
                .unwrap()
                .total,
            0
        );
        let exclusions = list_scan_exclusions(&pool).await.expect("exclusions");
        assert_eq!(exclusions.len(), 1);
        let loaded = load_scan_exclusions(&pool)
            .await
            .expect("loaded exclusions");
        assert!(loaded.dir_keys.contains(&exclusions[0].dir_key));

        let manual = import_candidates(&pool, vec![candidate])
            .await
            .expect("manual reimport");
        assert_eq!(manual.imported, 1);
        assert!(
            list_scan_exclusions(&pool)
                .await
                .expect("cleared exclusions")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn collections_persist_membership_and_filter_library() {
        let (_temp, pool, work_id) = imported_pool().await;
        let first = create_collection(&pool, "深夜推荐")
            .await
            .expect("create first");
        let second = create_collection(&pool, "想再玩一遍")
            .await
            .expect("create second");
        assert!(create_collection(&pool, "深夜推荐").await.is_err());

        let added = add_collection_works(&pool, first.id, &[work_id, work_id])
            .await
            .expect("add work");
        assert_eq!(added, 1);
        sqlx::query(
            "INSERT INTO assets
               (work_id, kind, original_path, thumb_path, width, height, checksum, source)
             VALUES (?, 'cover', '/covers/original.webp', '/covers/thumb.webp', 600, 900, 'fixture', 'manual')",
        )
        .bind(work_id)
        .execute(&pool)
        .await
        .expect("cover fixture");
        let page = query_library(
            &pool,
            LibraryQuery {
                collection_id: Some(first.id),
                ..LibraryQuery::default()
            },
        )
        .await
        .expect("collection query");
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].work_id, work_id);

        let renamed = rename_collection(&pool, first.id, "周末短篇")
            .await
            .expect("rename");
        assert_eq!(renamed.name, "周末短篇");
        assert_eq!(renamed.work_count, 1);
        assert_eq!(renamed.covers, vec!["/covers/thumb.webp"]);

        reorder_collections(&pool, &[second.id, first.id])
            .await
            .expect("reorder");
        let collections = list_collections(&pool).await.expect("list");
        assert_eq!(collections[0].id, second.id);

        remove_collection_work(&pool, first.id, work_id)
            .await
            .expect("remove work");
        assert_eq!(
            get_collection(&pool, first.id)
                .await
                .expect("reload")
                .work_count,
            0
        );
        delete_collection(&pool, second.id).await.expect("delete");
        assert_eq!(list_collections(&pool).await.expect("list again").len(), 1);
    }

    #[tokio::test]
    async fn paginates_five_thousand_records() {
        let pool = open_memory_pool().await.expect("pool");
        let mut tx = pool.begin().await.expect("transaction");
        for index in 0..5_000 {
            let work_id = sqlx::query("INSERT INTO works (canonical_title) VALUES (?)")
                .bind(format!("Fixture {index:05}"))
                .execute(&mut *tx)
                .await
                .expect("work")
                .last_insert_rowid();
            let release_id =
                sqlx::query("INSERT INTO releases (work_id, platform) VALUES (?, 'Windows')")
                    .bind(work_id)
                    .execute(&mut *tx)
                    .await
                    .expect("release")
                    .last_insert_rowid();
            sqlx::query(
                "INSERT INTO local_copies
                   (release_id, root_path, exe_path, exe_key, working_dir, display_name, size_bytes)
                 VALUES (?, 'C:\\Games', ?, ?, 'C:\\Games', ?, ?)",
            )
            .bind(release_id)
            .bind(format!("C:\\Games\\{index:05}\\game.exe"))
            .bind(format!("c:\\games\\{index:05}\\game.exe"))
            .bind(format!("Fixture {index:05}"))
            .bind(index as i64)
            .execute(&mut *tx)
            .await
            .expect("copy");
            sqlx::query("INSERT INTO user_entries (work_id, status) VALUES (?, 'unclassified')")
                .bind(work_id)
                .execute(&mut *tx)
                .await
                .expect("entry");
        }
        tx.commit().await.expect("commit");

        let page = query_library(
            &pool,
            LibraryQuery {
                page: 0,
                page_size: 60,
                ..LibraryQuery::default()
            },
        )
        .await
        .expect("page");
        assert_eq!(page.total, 5_000);
        assert_eq!(page.items.len(), 60);
        assert_eq!(page.counts.all, 5_000);

        let last_page = query_library(
            &pool,
            LibraryQuery {
                page: 83,
                page_size: 60,
                ..LibraryQuery::default()
            },
        )
        .await
        .expect("last page");
        assert_eq!(last_page.items.len(), 20);
    }

    #[tokio::test]
    async fn updates_work_profile_and_user_entry() {
        let (temp, pool, work_id) = imported_pool().await;
        update_work(
            &pool,
            work_id,
            WorkUpdateInput {
                title: "月影工房 完全版".to_string(),
                original_title: "月影のアトリエ 完全版".to_string(),
                aliases: vec![
                    "月影".to_string(),
                    "Tsukikage".to_string(),
                    "月影".to_string(),
                ],
                description: "新的简介".to_string(),
                year: Some(2024),
                developer: Some("Lunar Atelier".to_string()),
                publisher: Some("Miyu Press".to_string()),
                edition: Some("正式版".to_string()),
                language: Some("日语 / 简体中文".to_string()),
                release_date: Some("2024-08-30".to_string()),
                tags: vec!["奇幻".to_string(), "悬疑".to_string(), "奇幻".to_string()],
                notes: "二周目想走透子线".to_string(),
                rating: Some(8.7),
                status: "playing".to_string(),
                favorite: true,
            },
        )
        .await
        .expect("update work");

        let detail = get_library_item(&pool, work_id)
            .await
            .expect("detail")
            .expect("work exists");
        assert_eq!(detail.item.title, "月影工房 完全版");
        assert_eq!(detail.item.tags, vec!["奇幻", "悬疑"]);
        assert_eq!(detail.aliases, vec!["月影", "Tsukikage"]);
        assert_eq!(detail.release_date.as_deref(), Some("2024-08-30"));
        assert_eq!(detail.notes, "二周目想走透子线");
        assert_eq!(detail.item.rating, Some(8.7));
        assert_eq!(detail.item.status, "playing");
        assert!(detail.item.favorite);
        assert_eq!(detail.item.developer.as_deref(), Some("Lunar Atelier"));
        let tag_search = query_library(
            &pool,
            LibraryQuery {
                search: "悬疑".to_string(),
                ..LibraryQuery::default()
            },
        )
        .await
        .expect("tag search");
        assert_eq!(tag_search.total, 1);

        let invalid = update_work(
            &pool,
            work_id,
            WorkUpdateInput {
                title: "月影".to_string(),
                original_title: String::new(),
                aliases: Vec::new(),
                description: String::new(),
                year: Some(1800),
                developer: None,
                publisher: None,
                edition: None,
                language: None,
                release_date: None,
                tags: Vec::new(),
                notes: String::new(),
                rating: None,
                status: "playing".to_string(),
                favorite: false,
            },
        )
        .await;
        assert!(invalid.is_err());

        let root = temp.path().join("games");
        let game = root.join("月影工房");
        import_candidates(
            &pool,
            vec![ImportCandidateInput {
                exe_path: game.join("game.exe").to_string_lossy().to_string(),
                working_dir: game.to_string_lossy().to_string(),
                display_name: "扫描器的新名称".to_string(),
                root_path: root.to_string_lossy().to_string(),
                size_bytes: 1,
                steam_app_id: None,
            }],
        )
        .await
        .expect("reimport");
        let after_rescan = get_library_item(&pool, work_id)
            .await
            .expect("detail")
            .expect("work");
        assert_eq!(after_rescan.item.title, "月影工房 完全版");
    }

    #[tokio::test]
    async fn migrates_a_c2_database_with_existing_library_rows() {
        let temp = TempDir::new().expect("temp");
        let path = temp.path().join("c2.sqlite3");
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true)
                    .foreign_keys(true),
            )
            .await
            .expect("c2 pool");
        let mut c2_migrator = sqlx::migrate!("./migrations");
        c2_migrator.migrations = c2_migrator
            .migrations
            .iter()
            .filter(|migration| migration.version < 20261115000300)
            .cloned()
            .collect::<Vec<_>>()
            .into();
        c2_migrator.run(&pool).await.expect("c2 schema");
        let work_id = sqlx::query("INSERT INTO works (canonical_title) VALUES ('旧库作品')")
            .execute(&pool)
            .await
            .expect("work")
            .last_insert_rowid();
        let release_id = sqlx::query("INSERT INTO releases (work_id) VALUES (?)")
            .bind(work_id)
            .execute(&pool)
            .await
            .expect("release")
            .last_insert_rowid();
        sqlx::query(
            "INSERT INTO local_copies
               (release_id, root_path, exe_path, exe_key, working_dir, display_name)
             VALUES (?, 'C:\\Games', 'C:\\Games\\game.exe', 'c:\\games\\game.exe',
                     'C:\\Games', '旧库作品')",
        )
        .bind(release_id)
        .execute(&pool)
        .await
        .expect("copy");

        run_migrations(&pool).await.expect("c3 migration");
        let detail = get_library_item(&pool, work_id)
            .await
            .expect("detail")
            .expect("work");
        assert_eq!(detail.item.title, "旧库作品");
        assert!(detail.item.tags.is_empty());
        assert_eq!(detail.item.launch_count, 0);
        assert!(detail.item.cover_path.is_none());
        assert!(detail.launch_profile.is_none());
    }

    #[tokio::test]
    async fn saves_launch_config_and_records_launch() {
        let (temp, pool, work_id) = imported_pool().await;
        let game = temp.path().join("games").join("月影工房");
        let profile = LaunchProfile {
            args: vec!["--window".to_string()],
            env: vec![EnvVar {
                key: "MIYU_TEST".to_string(),
                value: "1".to_string(),
            }],
            wrapper_path: None,
            wrapper_args: Vec::new(),
            monitor: Some(0),
            fullscreen: true,
        };
        let saved = save_launch_config(
            &pool,
            work_id,
            LaunchConfigInput {
                exe_path: game.join("game.exe").to_string_lossy().to_string(),
                working_dir: game.to_string_lossy().to_string(),
                profile,
            },
        )
        .await
        .expect("save launch config");
        assert_eq!(saved.args, vec!["--window"]);
        assert_eq!(saved.monitor, Some(0));
        assert!(saved.fullscreen);

        let invalid_report = validate_launch_config_report(
            &pool,
            work_id,
            &LaunchConfigInput {
                exe_path: "C:\\missing\\game.exe".to_string(),
                working_dir: game.to_string_lossy().to_string(),
                profile: saved.clone(),
            },
        )
        .await
        .expect("invalid report");
        assert!(!invalid_report.valid);
        let status_before_launch: String =
            sqlx::query_scalar("SELECT install_status FROM local_copies WHERE id = 1")
                .fetch_one(&pool)
                .await
                .expect("status before launch");
        assert_eq!(status_before_launch, "installed");

        let local_copy_id = get_library_item(&pool, work_id)
            .await
            .expect("detail")
            .expect("work")
            .item
            .local_copy_id;
        let started_at = record_launch_started(&pool, local_copy_id)
            .await
            .expect("launch start");
        assert!(!started_at.is_empty());
        let item = query_library(&pool, LibraryQuery::default())
            .await
            .expect("query")
            .items[0]
            .clone();
        assert_eq!(item.launch_count, 1);
        assert_eq!(item.last_played_at.as_deref(), Some(started_at.as_str()));

        let report = validate_launch(&pool, work_id, None)
            .await
            .expect("validate");
        assert!(report.valid);

        fs::remove_file(game.join("game.exe")).expect("remove exe");
        let missing = validate_launch(&pool, work_id, None)
            .await
            .expect("missing validation");
        assert!(!missing.valid);
        assert!(!missing.exe.ok);
        let status: String =
            sqlx::query_scalar("SELECT install_status FROM local_copies WHERE id = 1")
                .fetch_one(&pool)
                .await
                .expect("status");
        assert_eq!(status, "missing");
    }
}
