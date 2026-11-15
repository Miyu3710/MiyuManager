use std::collections::HashSet;

use anyhow::{Context, Result, bail};
use serde_json::Value;
use sqlx::sqlite::SqliteConnection;
use sqlx::{Row, SqlitePool};

#[derive(Debug, Clone)]
pub struct ProviderDescriptor {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub fields: &'static [&'static str],
    pub requires_auth: bool,
    pub auth_kind: &'static str,
    pub oauth_provider: Option<&'static str>,
}

#[derive(Debug, Clone)]
pub struct ProviderRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub priority: i64,
    pub enabled: bool,
}

#[derive(Debug, Clone)]
pub struct ClaimRow {
    pub id: i64,
    pub field: String,
    pub source: String,
    pub source_id: String,
    pub value: Value,
    pub confidence: Option<f64>,
    pub locked: bool,
    pub fetched_at: String,
    pub provider_name: String,
    pub priority: i64,
}

#[derive(Debug, Clone)]
pub struct CachedRecord {
    pub raw_json: String,
}

#[derive(Debug, Clone)]
pub struct FieldPriorityRow {
    pub field: String,
    pub provider: String,
    pub rank: i64,
}

#[derive(Debug, Clone, Default)]
pub struct WorkFieldValues {
    pub title: String,
    pub original_title: String,
    pub aliases: Vec<String>,
    pub description: String,
    pub year: Option<i64>,
    pub tags: Vec<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub cover_source: Option<String>,
    pub steam_app_id: Option<i64>,
}

impl WorkFieldValues {
    pub fn current(&self, field: &str) -> Value {
        match field {
            "title" => Value::String(self.title.clone()),
            "original_title" => Value::String(self.original_title.clone()),
            "aliases" => serde_json::to_value(&self.aliases).unwrap_or(Value::Array(Vec::new())),
            "description" => Value::String(self.description.clone()),
            "year" => self.year.map_or(Value::Null, Value::from),
            "tags" => serde_json::to_value(&self.tags).unwrap_or(Value::Array(Vec::new())),
            "developer" => self.developer.clone().map_or(Value::Null, Value::String),
            "publisher" => self.publisher.clone().map_or(Value::Null, Value::String),
            "release_date" => self.release_date.clone().map_or(Value::Null, Value::String),
            "cover" => self.cover_source.clone().map_or(Value::Null, Value::String),
            _ => Value::Null,
        }
    }
}

pub async fn ensure_providers(pool: &SqlitePool, providers: &[ProviderDescriptor]) -> Result<()> {
    for provider in providers {
        let exists: Option<i64> =
            sqlx::query_scalar("SELECT priority FROM metadata_providers WHERE id = ?")
                .bind(provider.id)
                .fetch_optional(pool)
                .await?;
        if exists.is_some() {
            sqlx::query(
                "UPDATE metadata_providers SET name = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
            )
            .bind(provider.name)
            .bind(provider.description)
            .bind(provider.id)
            .execute(pool)
            .await?;
        } else {
            let next: i64 = sqlx::query_scalar(
                "SELECT COALESCE(MAX(priority), 0) + 10 FROM metadata_providers",
            )
            .fetch_one(pool)
            .await?;
            sqlx::query(
                "INSERT INTO metadata_providers (id, name, description, priority) VALUES (?, ?, ?, ?)",
            )
            .bind(provider.id)
            .bind(provider.name)
            .bind(provider.description)
            .bind(next)
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}

pub async fn list_providers(pool: &SqlitePool) -> Result<Vec<ProviderRow>> {
    let rows = sqlx::query(
        "SELECT id, name, description, priority, enabled FROM metadata_providers ORDER BY priority ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| ProviderRow {
            id: row.get("id"),
            name: row.get("name"),
            description: row.get("description"),
            priority: row.get("priority"),
            enabled: row.get::<i64, _>("enabled") != 0,
        })
        .collect())
}

pub async fn reorder_providers(pool: &SqlitePool, ids: &[String]) -> Result<()> {
    if ids.is_empty() {
        bail!("来源顺序不能为空");
    }
    let known: Vec<String> = sqlx::query_scalar("SELECT id FROM metadata_providers")
        .fetch_all(pool)
        .await?;
    let unique: HashSet<&String> = ids.iter().collect();
    if ids.len() != known.len()
        || unique.len() != ids.len()
        || ids.iter().any(|id| !known.contains(id))
    {
        bail!("来源顺序必须包含当前全部来源");
    }
    let mut tx = pool.begin().await?;
    for (index, id) in ids.iter().enumerate() {
        sqlx::query(
            "UPDATE metadata_providers SET priority = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        )
        .bind((index as i64 + 1) * 10)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn set_provider_enabled(pool: &SqlitePool, id: &str, enabled: bool) -> Result<()> {
    let result = sqlx::query(
        "UPDATE metadata_providers SET enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(if enabled { 1 } else { 0 })
    .bind(id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        bail!("元数据来源不存在");
    }
    Ok(())
}

pub async fn load_field_priorities(pool: &SqlitePool) -> Result<Vec<FieldPriorityRow>> {
    let rows = sqlx::query(
        "SELECT field, provider, rank FROM metadata_field_priorities ORDER BY field, rank",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| FieldPriorityRow {
            field: row.get("field"),
            provider: row.get("provider"),
            rank: row.get("rank"),
        })
        .collect())
}

pub async fn set_field_priorities(
    pool: &SqlitePool,
    field: &str,
    providers: &[String],
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM metadata_field_priorities WHERE field = ?")
        .bind(field)
        .execute(&mut *tx)
        .await?;
    for (index, provider) in providers.iter().enumerate() {
        sqlx::query(
            "INSERT INTO metadata_field_priorities (field, provider, rank, updated_at)
             VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(field)
        .bind(provider)
        .bind((index as i64 + 1) * 10)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn reset_field_priorities(pool: &SqlitePool, field: &str) -> Result<()> {
    sqlx::query("DELETE FROM metadata_field_priorities WHERE field = ?")
        .bind(field)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn field_priority_global(pool: &SqlitePool) -> Result<bool> {
    let value: Option<String> = sqlx::query_scalar(
        "SELECT value_json FROM settings WHERE key = 'metadata.field_priority_global'",
    )
    .fetch_optional(pool)
    .await?;
    Ok(value
        .and_then(|value| serde_json::from_str::<bool>(&value).ok())
        .unwrap_or(false))
}

pub async fn set_field_priority_global(pool: &SqlitePool, enabled: bool) -> Result<()> {
    sqlx::query(
        "INSERT INTO settings (key, value_json) VALUES ('metadata.field_priority_global', ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(if enabled { "true" } else { "false" })
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn cache_get(
    pool: &SqlitePool,
    provider: &str,
    record_key: &str,
) -> Result<Option<CachedRecord>> {
    let row = sqlx::query(
        "SELECT raw_json FROM source_records
         WHERE provider = ? AND record_key = ?
           AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(provider)
    .bind(record_key)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| CachedRecord {
        raw_json: row.get("raw_json"),
    }))
}

pub async fn cache_put(
    pool: &SqlitePool,
    provider: &str,
    record_key: &str,
    source_id: &str,
    kind: &str,
    raw_json: &str,
    ttl_minutes: i64,
) -> Result<()> {
    sqlx::query(
        "DELETE FROM source_records
         WHERE expires_at IS NOT NULL
           AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "INSERT INTO source_records
           (provider, record_key, source_id, kind, raw_json, etag, fetched_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))
         ON CONFLICT(record_key) DO UPDATE SET
           raw_json = excluded.raw_json,
           etag = excluded.etag,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at",
    )
    .bind(provider)
    .bind(record_key)
    .bind(source_id)
    .bind(kind)
    .bind(raw_json)
    .bind(Option::<String>::None)
    .bind(format!("+{ttl_minutes} minutes"))
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn load_claims(pool: &SqlitePool, work_id: i64) -> Result<Vec<ClaimRow>> {
    let rows = sqlx::query(
        "SELECT c.id, c.field, c.source, c.source_id, c.value_json, c.confidence,
                c.locked, c.fetched_at,
                COALESCE(p.name, CASE WHEN c.source = 'manual' THEN '手动编辑' ELSE c.source END) AS provider_name,
                COALESCE(p.priority, 0) AS priority
         FROM metadata_claims c
         LEFT JOIN metadata_providers p ON p.id = c.source
         WHERE c.work_id = ?
         ORDER BY c.field ASC, priority ASC, c.fetched_at DESC",
    )
    .bind(work_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| ClaimRow {
            id: row.get("id"),
            field: row.get("field"),
            source: row.get("source"),
            source_id: row.get("source_id"),
            value: serde_json::from_str(&row.get::<String, _>("value_json")).unwrap_or(Value::Null),
            confidence: row.get("confidence"),
            locked: row.get::<i64, _>("locked") != 0,
            fetched_at: row.get("fetched_at"),
            provider_name: row.get("provider_name"),
            priority: row.get("priority"),
        })
        .collect())
}

pub async fn set_field_lock(
    pool: &SqlitePool,
    work_id: i64,
    field: &str,
    locked: bool,
    current_value: Value,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    let result =
        sqlx::query("UPDATE metadata_claims SET locked = ? WHERE work_id = ? AND field = ?")
            .bind(if locked { 1 } else { 0 })
            .bind(work_id)
            .bind(field)
            .execute(&mut *tx)
            .await?;
    if locked && result.rows_affected() == 0 {
        upsert_claim(
            &mut tx,
            work_id,
            field,
            "manual",
            "",
            &current_value,
            None,
            true,
        )
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn load_work_field_values(pool: &SqlitePool, work_id: i64) -> Result<WorkFieldValues> {
    let row = sqlx::query(
        "SELECT w.canonical_title, w.original_title, w.aliases_json, w.description,
                w.release_year, w.tags_json,
                r.developer, r.publisher, r.release_date,
                (SELECT a.source FROM assets a WHERE a.work_id = w.id AND a.kind = 'cover' LIMIT 1) AS cover_source,
                (SELECT lc.steam_app_id FROM releases r2
                 JOIN local_copies lc ON lc.release_id = r2.id
                 WHERE r2.work_id = w.id ORDER BY lc.id ASC LIMIT 1) AS steam_app_id
         FROM works w
         LEFT JOIN releases r ON r.id = (
           SELECT r2.id FROM releases r2
           JOIN local_copies lc ON lc.release_id = r2.id
           WHERE r2.work_id = w.id ORDER BY lc.id ASC LIMIT 1
         )
         WHERE w.id = ?",
    )
    .bind(work_id)
    .fetch_optional(pool)
    .await?;
    let Some(row) = row else {
        bail!("作品不存在");
    };
    let aliases_json: String = row.get("aliases_json");
    let tags_json: String = row.get("tags_json");
    Ok(WorkFieldValues {
        title: row.get("canonical_title"),
        original_title: row.get("original_title"),
        aliases: serde_json::from_str::<Vec<String>>(&aliases_json).unwrap_or_default(),
        description: row.get("description"),
        year: row.get("release_year"),
        tags: serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default(),
        developer: row.get("developer"),
        publisher: row.get("publisher"),
        release_date: row.get("release_date"),
        cover_source: row.get("cover_source"),
        steam_app_id: row.get("steam_app_id"),
    })
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert_claim(
    conn: &mut SqliteConnection,
    work_id: i64,
    field: &str,
    source: &str,
    source_id: &str,
    value: &Value,
    confidence: Option<f64>,
    locked: bool,
) -> Result<()> {
    let value_json = serde_json::to_string(value)?;
    sqlx::query(
        "INSERT INTO metadata_claims
           (work_id, field, source, source_id, value_json, confidence, locked, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(work_id, field, source, source_id) DO UPDATE SET
           value_json = excluded.value_json,
           confidence = excluded.confidence,
           locked = excluded.locked,
           fetched_at = excluded.fetched_at",
    )
    .bind(work_id)
    .bind(field)
    .bind(source)
    .bind(source_id)
    .bind(value_json)
    .bind(confidence)
    .bind(if locked { 1 } else { 0 })
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn apply_field(
    conn: &mut SqliteConnection,
    work_id: i64,
    field: &str,
    value: &Value,
) -> Result<()> {
    let string_value = value.as_str().map(ToOwned::to_owned);
    match field {
        "title" => {
            let title = string_value.context("标题值无效")?;
            if title.trim().is_empty() {
                bail!("标题不能为空");
            }
            if title.chars().count() > 200 {
                bail!("标题不能超过 200 个字符");
            }
            sqlx::query("UPDATE works SET canonical_title = ? WHERE id = ?")
                .bind(title.trim())
                .bind(work_id)
                .execute(&mut *conn)
                .await?;
        }
        "original_title" => {
            let title = string_value.context("原题值无效")?;
            if title.chars().count() > 200 {
                bail!("原题不能超过 200 个字符");
            }
            sqlx::query("UPDATE works SET original_title = ? WHERE id = ?")
                .bind(title.trim())
                .bind(work_id)
                .execute(&mut *conn)
                .await?;
        }
        "aliases" => {
            let aliases = value.as_array().context("别名值无效")?;
            validate_string_list(aliases, 20, 120, "别名")?;
            sqlx::query("UPDATE works SET aliases_json = ? WHERE id = ?")
                .bind(serde_json::to_string(aliases)?)
                .bind(work_id)
                .execute(&mut *conn)
                .await?;
        }
        "description" => {
            let description = string_value.context("简介值无效")?;
            if description.chars().count() > 8000 {
                bail!("简介不能超过 8000 个字符");
            }
            sqlx::query("UPDATE works SET description = ? WHERE id = ?")
                .bind(description.trim())
                .bind(work_id)
                .execute(&mut *conn)
                .await?;
        }
        "year" => {
            let year = if value.is_null() {
                None
            } else {
                Some(value.as_i64().context("年份值无效")?)
            };
            if let Some(year) = year
                && !(1900..=2100).contains(&year)
            {
                bail!("年份需要在 1900 到 2100 之间");
            }
            sqlx::query("UPDATE works SET release_year = ? WHERE id = ?")
                .bind(year)
                .bind(work_id)
                .execute(&mut *conn)
                .await?;
        }
        "tags" => {
            let tags = value.as_array().context("标签值无效")?;
            validate_string_list(tags, 30, 40, "标签")?;
            sqlx::query("UPDATE works SET tags_json = ? WHERE id = ?")
                .bind(serde_json::to_string(tags)?)
                .bind(work_id)
                .execute(&mut *conn)
                .await?;
        }
        "developer" | "publisher" | "release_date" => {
            let release_id: Option<i64> = sqlx::query_scalar(
                "SELECT r.id FROM releases r JOIN local_copies lc ON lc.release_id = r.id
                 WHERE r.work_id = ? ORDER BY lc.id ASC LIMIT 1",
            )
            .bind(work_id)
            .fetch_optional(&mut *conn)
            .await?;
            let release_id = release_id.context("作品没有发行版本")?;
            let value = string_value.unwrap_or_default();
            if value.chars().count() > 200 && field != "release_date" {
                bail!("发行信息不能超过 200 个字符");
            }
            let column = match field {
                "developer" => "developer",
                "publisher" => "publisher",
                _ => "release_date",
            };
            if field == "release_date" && !value.is_empty() && value.len() != 10 {
                bail!("发行日期需要写成 YYYY-MM-DD");
            }
            let sql = format!("UPDATE releases SET {column} = ? WHERE id = ?");
            sqlx::query(&sql)
                .bind(value.trim())
                .bind(release_id)
                .execute(&mut *conn)
                .await?;
        }
        "cover" | "related" => {}
        _ => bail!("未知的元数据字段：{field}"),
    }
    Ok(())
}

fn validate_string_list(
    values: &[Value],
    max_items: usize,
    max_len: usize,
    label: &str,
) -> Result<()> {
    if values.len() > max_items {
        bail!("{label}最多 {max_items} 项");
    }
    for value in values {
        let text = value.as_str().context("列表项必须是字符串")?;
        if text.chars().count() > max_len {
            bail!("{label}单项不能超过 {max_len} 个字符");
        }
    }
    Ok(())
}

pub async fn touch_work(conn: &mut SqliteConnection, work_id: i64) -> Result<()> {
    sqlx::query("UPDATE works SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .bind(work_id)
        .execute(conn)
        .await?;
    Ok(())
}
