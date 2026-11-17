use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use anyhow::{Context, Result, bail};
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use sqlx::SqlitePool;
use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

use crate::diagnostics;

pub const BACKUP_DIR: &str = "backups";
const AUTOMATIC_BACKUP_LIMIT: usize = 20;
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealth {
    pub db_path: String,
    pub backup_dir: String,
    pub log_dir: String,
    pub size_bytes: u64,
    pub integrity: String,
    pub applied_migrations: usize,
    pub pending_migrations: Vec<i64>,
    pub backup_count: usize,
    pub latest_backup: Option<BackupInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub safety_backup: BackupInfo,
    pub restarting: bool,
}

pub fn backup_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(BACKUP_DIR)
}

pub async fn backup_before_migration(
    pool: &SqlitePool,
    db_path: &Path,
    migrator: &Migrator,
) -> Result<Option<BackupInfo>> {
    let has_schema: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'works'",
    )
    .fetch_one(pool)
    .await?;
    if has_schema == 0 {
        return Ok(None);
    }
    if pending_migration_versions(pool, migrator).await?.is_empty() {
        return Ok(None);
    }
    let directory = db_path
        .parent()
        .context("数据库路径没有父目录")?
        .join(BACKUP_DIR);
    let backup = create_named_backup(pool, &directory, db_path, "pre-migration").await?;
    prune_automatic_backups(&directory)?;
    diagnostics::event(
        "info",
        "database_pre_migration_backup",
        "迁移前数据库快照已创建",
        json!({"path": backup.path, "sizeBytes": backup.size_bytes}),
    );
    Ok(Some(backup))
}

pub async fn health(pool: &SqlitePool, data_dir: &Path, db_path: &Path) -> Result<DatabaseHealth> {
    let size_bytes = fs::metadata(db_path).map(|value| value.len()).unwrap_or(0);
    let integrity = quick_check(pool).await?;
    let applied_migrations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    let pending_migrations = pending_migration_versions(pool, &crate::db::MIGRATOR).await?;
    let directory = backup_dir(data_dir);
    fs::create_dir_all(&directory)?;
    let backups = list_backups_in(&directory)?;
    Ok(DatabaseHealth {
        db_path: db_path.to_string_lossy().to_string(),
        backup_dir: directory.to_string_lossy().to_string(),
        log_dir: diagnostics::log_dir()
            .unwrap_or_else(|| data_dir.join("logs"))
            .to_string_lossy()
            .to_string(),
        size_bytes,
        integrity,
        applied_migrations: usize::try_from(applied_migrations).unwrap_or(0),
        pending_migrations,
        backup_count: backups.len(),
        latest_backup: backups.first().cloned(),
    })
}

pub async fn backup_to(
    pool: &SqlitePool,
    _data_dir: &Path,
    db_path: &Path,
    destination: &Path,
) -> Result<BackupInfo> {
    let destination = absolute_destination(destination)?;
    if same_path(destination.as_path(), db_path) {
        bail!("不能把数据库备份覆盖到正在使用的数据库文件");
    }
    let parent = destination.parent().context("备份路径没有父目录")?;
    fs::create_dir_all(parent).with_context(|| format!("无法创建备份目录 {}", parent.display()))?;
    let backup = create_backup_at(pool, &destination).await?;
    diagnostics::event(
        "info",
        "database_backup_created",
        "数据库备份完成",
        json!({"path": backup.path, "sizeBytes": backup.size_bytes}),
    );
    Ok(backup)
}

pub async fn backup_to_default(
    pool: &SqlitePool,
    data_dir: &Path,
    db_path: &Path,
) -> Result<BackupInfo> {
    let directory = backup_dir(data_dir);
    let backup = create_named_backup(pool, &directory, db_path, "manual").await?;
    prune_automatic_backups(&directory)?;
    diagnostics::event(
        "info",
        "database_backup_created",
        "数据库备份完成",
        json!({"path": backup.path, "sizeBytes": backup.size_bytes}),
    );
    Ok(backup)
}

async fn create_named_backup(
    pool: &SqlitePool,
    directory: &Path,
    db_path: &Path,
    prefix: &str,
) -> Result<BackupInfo> {
    fs::create_dir_all(directory)?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S-%3f");
    let destination = directory.join(format!("{prefix}-{stamp}.sqlite3"));
    if same_path(&destination, db_path) {
        bail!("自动备份路径与正在使用的数据库相同");
    }
    create_backup_at(pool, &destination).await
}

async fn create_backup_at(pool: &SqlitePool, destination: &Path) -> Result<BackupInfo> {
    if destination.exists() {
        fs::remove_file(destination)
            .with_context(|| format!("无法覆盖备份文件 {}", destination.display()))?;
    }
    let literal = sqlite_string_literal(destination);
    sqlx::query(&format!("VACUUM INTO {literal}"))
        .execute(pool)
        .await
        .with_context(|| format!("无法创建数据库备份 {}", destination.display()))?;
    let metadata = fs::metadata(destination)?;
    let created_at = metadata
        .modified()
        .ok()
        .and_then(system_time_to_rfc3339)
        .unwrap_or_else(|| Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true));
    Ok(BackupInfo {
        name: destination
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "database.sqlite3".to_string()),
        path: destination.to_string_lossy().to_string(),
        created_at,
        size_bytes: metadata.len(),
    })
}

pub async fn restore_database(
    pool: &SqlitePool,
    data_dir: &Path,
    db_path: &Path,
    source: &Path,
) -> Result<RestoreOutcome> {
    let source = dunce::canonicalize(source)
        .with_context(|| format!("备份文件不存在或无法访问：{}", source.display()))?;
    if same_path(&source, db_path) {
        bail!("不能从正在使用的数据库文件恢复");
    }
    verify_sqlite_file(&source).await?;
    let safety_backup =
        create_named_backup(pool, &backup_dir(data_dir), db_path, "pre-restore").await?;
    let staging = data_dir.join(".miyu-restore-pending.sqlite3");
    if staging.exists() {
        let _ = fs::remove_file(&staging);
    }
    fs::copy(&source, &staging).with_context(|| {
        format!(
            "无法把备份复制到临时文件 {} → {}",
            source.display(),
            staging.display()
        )
    })?;
    if let Err(error) = verify_sqlite_file(&staging).await {
        let _ = fs::remove_file(&staging);
        return Err(error);
    }
    let metadata = json!({
        "source": source.to_string_lossy(),
        "safetyBackup": safety_backup.path,
        "stagedAt": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
    });
    fs::write(
        data_dir.join(".miyu-restore-pending.json"),
        serde_json::to_vec_pretty(&metadata)?,
    )?;
    diagnostics::event(
        "warn",
        "database_restore_staged",
        "数据库恢复已准备完成，应用即将重启",
        json!({
            "source": source.to_string_lossy(),
            "safetyBackup": safety_backup.path,
        }),
    );
    Ok(RestoreOutcome {
        safety_backup,
        restarting: true,
    })
}

pub async fn apply_pending_restore(data_dir: &Path, db_path: &Path) -> Result<Option<BackupInfo>> {
    let staging = data_dir.join(".miyu-restore-pending.sqlite3");
    if !staging.is_file() {
        return Ok(None);
    }
    if let Err(error) = verify_sqlite_file(&staging).await {
        let failed = data_dir.join(format!(
            ".miyu-restore-failed-{}.sqlite3",
            Utc::now().format("%Y%m%d%H%M%S%3f")
        ));
        let _ = fs::rename(&staging, failed);
        let _ = fs::remove_file(data_dir.join(".miyu-restore-pending.json"));
        diagnostics::event(
            "error",
            "database_restore_staging_invalid",
            "待恢复数据库校验失败，已保留为失败快照并继续使用当前数据库",
            json!({"error": error.to_string()}),
        );
        return Ok(None);
    }
    remove_sqlite_sidecars(db_path);
    let retired = data_dir.join(".miyu-database-pre-restore.sqlite3");
    let _ = fs::remove_file(&retired);
    if db_path.exists() {
        fs::copy(db_path, &retired)
            .with_context(|| format!("无法暂存当前数据库 {}", db_path.display()))?;
    }
    if let Err(error) = fs::copy(&staging, db_path) {
        if retired.exists() {
            let _ = fs::copy(&retired, db_path);
        }
        return Err(error)
            .with_context(|| format!("无法把备份放到数据库位置 {}", db_path.display()));
    }
    if let Err(error) = verify_sqlite_file(db_path).await {
        if retired.exists() {
            let _ = fs::copy(&retired, db_path);
        }
        return Err(error).context("恢复后的数据库完整性复检失败，已回滚当前数据库");
    }
    let _ = fs::remove_file(&staging);
    let _ = fs::remove_file(&retired);
    remove_sqlite_sidecars(db_path);
    let metadata_path = data_dir.join(".miyu-restore-pending.json");
    let metadata: Value = fs::read(&metadata_path)
        .ok()
        .and_then(|value| serde_json::from_slice(&value).ok())
        .unwrap_or_else(|| json!({}));
    let _ = fs::remove_file(metadata_path);
    let safety_backup = metadata
        .get("safetyBackup")
        .and_then(Value::as_str)
        .map(Path::new)
        .and_then(|path| {
            let info = fs::metadata(path).ok()?;
            Some(BackupInfo {
                name: path
                    .file_name()
                    .map(|value| value.to_string_lossy().to_string())
                    .unwrap_or_else(|| "pre-restore.sqlite3".to_string()),
                path: path.to_string_lossy().to_string(),
                created_at: info
                    .modified()
                    .ok()
                    .and_then(system_time_to_rfc3339)
                    .unwrap_or_default(),
                size_bytes: info.len(),
            })
        })
        .unwrap_or_else(|| BackupInfo {
            name: "pre-restore.sqlite3".to_string(),
            path: String::new(),
            created_at: String::new(),
            size_bytes: 0,
        });
    diagnostics::event(
        "warn",
        "database_restored",
        "数据库已从待恢复快照替换",
        json!({"source": metadata.get("source"), "safetyBackup": safety_backup.path}),
    );
    Ok(Some(safety_backup))
}

pub async fn verify_sqlite_file(path: &Path) -> Result<()> {
    let mut header = [0_u8; 16];
    File::open(path)
        .with_context(|| format!("无法读取备份文件 {}", path.display()))?
        .read_exact(&mut header)
        .context("备份文件过短，无法识别为 SQLite 数据库")?;
    if &header != SQLITE_HEADER {
        bail!("所选文件不是 SQLite 数据库");
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .immutable(true)
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .with_context(|| format!("无法打开数据库备份 {}", path.display()))?;
    let result = async {
        let check = quick_check(&pool).await?;
        if check != "ok" {
            bail!("数据库完整性检查失败：{check}");
        }
        let tables = sqlx::query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('works', 'local_copies', 'play_sessions')",
        )
        .fetch_all(&pool)
        .await?;
        if tables.len() < 3 {
            bail!("备份缺少 MiyuManager 必需的数据表");
        }
        Ok(())
    }
    .await;
    pool.close().await;
    result
}

async fn quick_check(pool: &SqlitePool) -> Result<String> {
    let rows: Vec<String> = sqlx::query_scalar("PRAGMA quick_check")
        .fetch_all(pool)
        .await?;
    if rows.is_empty() {
        return Ok("ok".to_string());
    }
    Ok(rows.join("; "))
}

async fn pending_migration_versions(pool: &SqlitePool, migrator: &Migrator) -> Result<Vec<i64>> {
    let has_table: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_sqlx_migrations'",
    )
    .fetch_one(pool)
    .await?;
    let applied: Vec<i64> = if has_table == 0 {
        Vec::new()
    } else {
        sqlx::query_scalar("SELECT version FROM _sqlx_migrations")
            .fetch_all(pool)
            .await?
    };
    Ok(migrator
        .iter()
        .filter(|migration| !applied.contains(&migration.version))
        .map(|migration| migration.version)
        .collect())
}

fn list_backups_in(directory: &Path) -> Result<Vec<BackupInfo>> {
    let mut backups = Vec::new();
    let Ok(entries) = fs::read_dir(directory) else {
        return Ok(backups);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("sqlite3") {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let created_at = metadata
            .modified()
            .ok()
            .and_then(system_time_to_rfc3339)
            .unwrap_or_default();
        backups.push(BackupInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            created_at,
            size_bytes: metadata.len(),
        });
    }
    backups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(backups)
}

fn prune_automatic_backups(directory: &Path) -> Result<()> {
    let backups = list_backups_in(directory)?;
    for backup in backups.into_iter().skip(AUTOMATIC_BACKUP_LIMIT) {
        let _ = fs::remove_file(backup.path);
    }
    Ok(())
}

fn remove_sqlite_sidecars(db_path: &Path) {
    for suffix in ["-wal", "-shm"] {
        let path = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), suffix));
        let _ = fs::remove_file(path);
    }
}

fn sqlite_string_literal(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "''"))
}

fn absolute_destination(path: &Path) -> Result<PathBuf> {
    if path.as_os_str().is_empty() {
        bail!("备份路径为空");
    }
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        Ok(std::env::current_dir()?.join(path))
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    let normalize = |path: &Path| path.to_string_lossy().replace('/', "\\").to_lowercase();
    normalize(left) == normalize(right)
}

fn system_time_to_rfc3339(value: SystemTime) -> Option<String> {
    let value: DateTime<Utc> = value.into();
    Some(value.to_rfc3339_opts(SecondsFormat::Millis, true))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{ConnectOptions, Connection};

    use super::{
        apply_pending_restore, backup_to_default, create_backup_at, restore_database,
        verify_sqlite_file,
    };

    #[tokio::test]
    async fn creates_and_verifies_a_restorable_snapshot() {
        let temp = tempfile::tempdir().expect("temp");
        let db_path = temp.path().join("source.sqlite3");
        let options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        let mut connection = options.connect().await.expect("connection");
        sqlx::query("CREATE TABLE works (id INTEGER PRIMARY KEY)")
            .execute(&mut connection)
            .await
            .expect("works");
        sqlx::query("CREATE TABLE local_copies (id INTEGER PRIMARY KEY)")
            .execute(&mut connection)
            .await
            .expect("copies");
        sqlx::query("CREATE TABLE play_sessions (id INTEGER PRIMARY KEY)")
            .execute(&mut connection)
            .await
            .expect("sessions");
        sqlx::query("INSERT INTO works DEFAULT VALUES")
            .execute(&mut connection)
            .await
            .expect("insert");
        connection.close().await.expect("close");

        let pool = sqlx::SqlitePool::connect(&db_path.to_string_lossy())
            .await
            .expect("pool");
        let backup_path = temp.path().join("snapshot.sqlite3");
        let backup = create_backup_at(&pool, &backup_path).await.expect("backup");
        assert!(backup.size_bytes > 0);
        verify_sqlite_file(&backup_path).await.expect("verify");
        pool.close().await;
        assert!(fs::metadata(backup_path).expect("metadata").len() > 0);
    }

    #[tokio::test]
    async fn restores_a_snapshot_and_keeps_a_safety_copy() {
        let temp = tempfile::tempdir().expect("temp");
        let data_dir = temp.path();
        let db_path = data_dir.join("miyumanager.sqlite3");
        let pool = crate::db::open_pool(&db_path).await.expect("database");
        sqlx::query("INSERT INTO works (canonical_title) VALUES ('Original work')")
            .execute(&pool)
            .await
            .expect("original work");
        let backup = backup_to_default(&pool, data_dir, &db_path)
            .await
            .expect("backup");
        sqlx::query("INSERT INTO works (canonical_title) VALUES ('Temporary work')")
            .execute(&pool)
            .await
            .expect("temporary work");

        let outcome = restore_database(&pool, data_dir, &db_path, Path::new(&backup.path))
            .await
            .expect("restore");
        assert!(outcome.restarting);
        assert!(Path::new(&outcome.safety_backup.path).is_file());
        pool.close().await;
        drop(pool);
        let applied = apply_pending_restore(data_dir, &db_path)
            .await
            .expect("apply restore")
            .expect("pending restore");
        assert_eq!(applied.path, outcome.safety_backup.path);
        let reopened = crate::db::open_pool(&db_path).await.expect("reopened");
        let titles: Vec<String> =
            sqlx::query_scalar("SELECT canonical_title FROM works ORDER BY id")
                .fetch_all(&reopened)
                .await
                .expect("titles");
        assert_eq!(titles, vec!["Original work"]);
        reopened.close().await;
    }
}
