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
    pub install_status: String,
    pub added_at: String,
    pub last_played_at: Option<String>,
    pub playtime_minutes: i64,
    pub launch_count: i64,
    pub catalog_no: String,
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
pub struct AppInfo {
    pub data_dir: String,
    pub db_path: String,
    pub library_count: i64,
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
)
";

const LIBRARY_JOINS: &str = "
FROM works w
JOIN primary_copy lc ON lc.rn = 1
JOIN releases r ON r.id = lc.release_id AND r.work_id = w.id
LEFT JOIN user_entries ue ON ue.work_id = w.id
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
                  OR lc.display_name LIKE ? ESCAPE '\\'
                  OR lc.exe_path LIKE ? ESCAPE '\\')"
                    .to_string(),
            );
            binds.push(fts);
            for _ in 0..4 {
                binds.push(like.clone());
            }
        } else {
            clauses.push(
                "(w.canonical_title LIKE ? ESCAPE '\\'
                  OR w.original_title LIKE ? ESCAPE '\\'
                  OR w.aliases_json LIKE ? ESCAPE '\\'
                  OR r.developer LIKE ? ESCAPE '\\'
                  OR r.publisher LIKE ? ESCAPE '\\'
                  OR lc.display_name LIKE ? ESCAPE '\\'
                  OR lc.exe_path LIKE ? ESCAPE '\\')"
                    .to_string(),
            );
            for _ in 0..7 {
                binds.push(like.clone());
            }
        }
    }

    let status = query.status.trim();
    if include_status && !status.is_empty() && status != "all" && STATUSES.contains(&status) {
        clauses.push("COALESCE(ue.status, 'unclassified') = ?".to_string());
        binds.push(status.to_string());
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
        "last_played_desc" => "lc.created_at DESC, w.id DESC",
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
           w.id AS work_id,
           w.canonical_title AS title,
           w.original_title,
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
           lc.install_status,
           lc.created_at AS added_at,
           NULL AS last_played_at,
           0 AS playtime_minutes,
           0 AS launch_count,
           printf('LOCAL-%04d', lc.id) AS catalog_no
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
        tags: Vec::new(),
        description: row.try_get("description")?,
        size_bytes: row.try_get("size_bytes")?,
        file_size_bytes: row.try_get("file_size_bytes")?,
        exe_path: row.try_get("exe_path")?,
        working_dir: row.try_get("working_dir")?,
        root_path: row.try_get("root_path")?,
        display_name: row.try_get("display_name")?,
        install_status: row.try_get("install_status")?,
        added_at: row.try_get("added_at")?,
        last_played_at: row.try_get("last_played_at")?,
        playtime_minutes: row.try_get("playtime_minutes")?,
        launch_count: row.try_get("launch_count")?,
        catalog_no: row.try_get("catalog_no")?,
    })
}

pub async fn get_library_item(
    pool: &SqlitePool,
    work_id: i64,
) -> Result<Option<LibraryItemDetail>> {
    let sql = format!(
        "{PRIMARY_COPY_CTE}
         SELECT
           w.id AS work_id,
           w.canonical_title AS title,
           w.original_title,
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
           lc.install_status,
           lc.created_at AS added_at,
           NULL AS last_played_at,
           0 AS playtime_minutes,
           0 AS launch_count,
           printf('LOCAL-%04d', lc.id) AS catalog_no,
           COALESCE(ue.notes, '') AS notes,
           r.release_date,
           r.language,
           r.platform
         {LIBRARY_JOINS}
         WHERE w.id = ?
         ORDER BY lc.id ASC
         LIMIT 1"
    );

    let row = sqlx::query(&sql).bind(work_id).fetch_optional(pool).await?;
    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(LibraryItemDetail {
        item: row_to_library_item(&row)?,
        notes: row.try_get("notes")?,
        release_date: row.try_get("release_date")?,
        language: row.try_get("language")?,
        platform: row.try_get("platform")?,
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

pub async fn remove_library_work(pool: &SqlitePool, work_id: i64) -> Result<()> {
    let result = sqlx::query("DELETE FROM works WHERE id = ?")
        .bind(work_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        bail!("作品不存在");
    }
    Ok(())
}

async fn work_exists(pool: &SqlitePool, work_id: i64) -> Result<bool> {
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
        let existing: Option<i64> =
            sqlx::query_scalar("SELECT id FROM local_copies WHERE exe_key = ?")
                .bind(&candidate.exe_key)
                .fetch_optional(&mut *tx)
                .await?;

        let root_id = roots.get(&candidate.root_path).copied();
        if existing.is_some() {
            sqlx::query(
                "UPDATE local_copies
                 SET root_id = ?, root_path = ?, working_dir = ?, display_name = ?,
                     size_bytes = ?, file_size_bytes = ?, install_status = 'installed',
                     last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE exe_key = ?",
            )
            .bind(root_id)
            .bind(&candidate.root_path)
            .bind(&candidate.working_dir)
            .bind(&candidate.display_name)
            .bind(candidate.size_bytes)
            .bind(candidate.file_size_bytes)
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
                 )",
            )
            .bind(&candidate.display_name)
            .bind(&candidate.exe_key)
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
                size_bytes, file_size_bytes, install_status, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'installed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
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
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT INTO user_entries (work_id, status) VALUES (?, 'unclassified')")
            .bind(work_id)
            .execute(&mut *tx)
            .await?;
        result.imported += 1;
    }

    tx.commit().await?;
    Ok(result)
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

        let second = import_candidates(&pool, vec![candidate])
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
}
