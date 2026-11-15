mod bangumi;
mod http;
mod store;
mod types;
mod vndb;

use std::path::Path;

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use serde_json::Value;
use sqlx::SqlitePool;
use sqlx::sqlite::SqliteConnection;
use tokio_util::sync::CancellationToken;

use crate::assets;
use crate::db;

pub use http::MetadataHttp;
pub use store::ProviderDescriptor;
pub use types::*;

pub const FIELD_LABELS: &[(&str, &str)] = &[
    ("title", "标题"),
    ("original_title", "原题"),
    ("aliases", "别名"),
    ("description", "简介"),
    ("year", "年份"),
    ("tags", "标签"),
    ("developer", "开发商"),
    ("publisher", "发行商"),
    ("release_date", "发行日期"),
];

const VNDB_FIELDS: &[&str] = &[
    "title",
    "original_title",
    "aliases",
    "description",
    "year",
    "tags",
    "developer",
    "publisher",
    "release_date",
    "cover",
    "related",
];
const BANGUMI_FIELDS: &[&str] = &[
    "title",
    "original_title",
    "aliases",
    "description",
    "year",
    "tags",
    "developer",
    "publisher",
    "release_date",
    "cover",
];

#[async_trait]
trait MetadataProvider: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;
    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>>;
    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        cancel: &CancellationToken,
    ) -> Result<CandidateDetail>;
    fn parse_detail(&self, raw: &str) -> Result<CandidateDetail>;
}

struct VndbProvider;

#[async_trait]
impl MetadataProvider for VndbProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "vndb",
            name: "VNDB",
            description: "原题、别名、开发商、标签和关联作品",
            fields: VNDB_FIELDS,
            requires_auth: false,
            auth_kind: "none",
        }
    }

    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>> {
        vndb::search(http, query, cancel).await
    }

    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        cancel: &CancellationToken,
    ) -> Result<CandidateDetail> {
        vndb::detail(http, source_id, cancel).await
    }

    fn parse_detail(&self, raw: &str) -> Result<CandidateDetail> {
        vndb::parse_detail(raw)
    }
}

struct BangumiProvider;

#[async_trait]
impl MetadataProvider for BangumiProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "bangumi",
            name: "Bangumi",
            description: "中文标题、简介、发行日期和中文标签",
            fields: BANGUMI_FIELDS,
            requires_auth: false,
            auth_kind: "none",
        }
    }

    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>> {
        bangumi::search(http, query, cancel).await
    }

    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        cancel: &CancellationToken,
    ) -> Result<CandidateDetail> {
        bangumi::detail(http, source_id, cancel).await
    }

    fn parse_detail(&self, raw: &str) -> Result<CandidateDetail> {
        bangumi::parse_detail(raw)
    }
}

fn all_providers() -> Vec<Box<dyn MetadataProvider>> {
    vec![Box::new(VndbProvider), Box::new(BangumiProvider)]
}

fn provider_by_id(id: &str) -> Option<Box<dyn MetadataProvider>> {
    all_providers()
        .into_iter()
        .find(|provider| provider.descriptor().id == id)
}

fn descriptors() -> Vec<ProviderDescriptor> {
    all_providers()
        .into_iter()
        .map(|provider| provider.descriptor())
        .collect()
}

pub async fn list_providers(pool: &SqlitePool) -> Result<Vec<ProviderInfo>> {
    let descriptors = descriptors();
    store::ensure_providers(pool, &descriptors).await?;
    let rows = store::list_providers(pool).await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            let descriptor = descriptors.iter().find(|item| item.id == row.id);
            ProviderInfo {
                id: row.id.clone(),
                name: row.name.clone(),
                description: descriptor
                    .map(|item| item.description.to_string())
                    .unwrap_or(row.description),
                fields: descriptor
                    .map(|item| item.fields.iter().map(|field| field.to_string()).collect())
                    .unwrap_or_default(),
                priority: row.priority,
                enabled: row.enabled,
                requires_auth: descriptor.is_some_and(|item| item.requires_auth),
                auth_kind: descriptor
                    .map(|item| item.auth_kind.to_string())
                    .unwrap_or_else(|| "none".to_string()),
                connected: descriptor.is_none_or(|item| !item.requires_auth),
                account_name: None,
            }
        })
        .collect())
}

pub async fn reorder_providers(pool: &SqlitePool, ids: &[String]) -> Result<()> {
    store::reorder_providers(pool, ids).await
}

pub async fn set_provider_enabled(pool: &SqlitePool, id: &str, enabled: bool) -> Result<()> {
    store::set_provider_enabled(pool, id, enabled).await
}

pub struct SearchOutcome {
    pub results: Vec<SearchCandidate>,
    pub errors: Vec<ProviderFailure>,
    pub cancelled: bool,
}

pub async fn search_all<F>(
    pool: &SqlitePool,
    http: &MetadataHttp,
    query: &str,
    provider_filter: Option<&str>,
    cancel: &CancellationToken,
    mut progress: F,
) -> Result<SearchOutcome>
where
    F: FnMut(&str, &str, usize, usize),
{
    let query = query.trim();
    if query.is_empty() {
        bail!("搜索词不能为空");
    }
    if query.chars().count() > 120 {
        bail!("搜索词不能超过 120 个字符");
    }
    let providers = list_providers(pool).await?;
    let providers = if let Some(filter) = provider_filter {
        let provider = providers
            .into_iter()
            .find(|provider| provider.id == filter)
            .with_context(|| format!("未知的元数据来源：{filter}"))?;
        if !provider.enabled {
            bail!("{} 已停用", provider.name);
        }
        vec![provider]
    } else {
        providers
            .into_iter()
            .filter(|provider| provider.enabled)
            .collect()
    };
    if providers.is_empty() {
        bail!("没有启用的元数据来源");
    }

    let total = providers.len();
    let mut results = Vec::new();
    let mut errors = Vec::new();
    let mut cancelled = false;
    for (index, provider_info) in providers.iter().enumerate() {
        if cancel.is_cancelled() {
            cancelled = true;
            break;
        }
        progress(&provider_info.id, &provider_info.name, index, total);
        let Some(provider) = provider_by_id(&provider_info.id) else {
            errors.push(ProviderFailure {
                provider: provider_info.id.clone(),
                provider_name: provider_info.name.clone(),
                message: "来源适配器未注册".to_string(),
            });
            continue;
        };
        let provider_results = provider.search(http, query, cancel).await;
        match provider_results {
            Ok(mut items) => {
                for item in &mut items {
                    item.priority = provider_info.priority;
                }
                results.extend(items);
            }
            Err(error) => {
                if cancel.is_cancelled() {
                    cancelled = true;
                    break;
                }
                errors.push(ProviderFailure {
                    provider: provider_info.id.clone(),
                    provider_name: provider_info.name.clone(),
                    message: error.to_string(),
                });
            }
        }
        progress(&provider_info.id, &provider_info.name, index + 1, total);
    }
    Ok(SearchOutcome {
        results,
        errors,
        cancelled,
    })
}

async fn candidate_detail(
    pool: &SqlitePool,
    http: &MetadataHttp,
    provider_id: &str,
    source_id: &str,
    cancel: &CancellationToken,
) -> Result<CandidateDetail> {
    validate_source_id(provider_id, source_id)?;
    let provider =
        provider_by_id(provider_id).with_context(|| format!("未知的元数据来源：{provider_id}"))?;
    let cache_key = format!("detail:{provider_id}:{source_id}");
    if let Some(cached) = store::cache_get(pool, provider_id, &cache_key).await?
        && let Ok(detail) = provider.parse_detail(&cached.raw_json)
    {
        return Ok(detail);
    }
    let detail = provider.detail(http, source_id, cancel).await?;
    let _ = store::cache_put(
        pool,
        provider_id,
        &cache_key,
        source_id,
        "detail",
        &detail.raw_json,
        24 * 60,
    )
    .await;
    Ok(detail)
}

fn validate_source_id(provider_id: &str, source_id: &str) -> Result<()> {
    let valid = match provider_id {
        "vndb" => source_id.strip_prefix('v').is_some_and(|value| {
            !value.is_empty() && value.chars().all(|character| character.is_ascii_digit())
        }),
        "bangumi" => {
            !source_id.is_empty()
                && source_id
                    .chars()
                    .all(|character| character.is_ascii_digit())
        }
        _ => false,
    };
    if !valid {
        bail!("来源 ID 无效");
    }
    Ok(())
}

pub async fn preview(
    pool: &SqlitePool,
    http: &MetadataHttp,
    work_id: i64,
    provider_id: &str,
    source_id: &str,
    cancel: &CancellationToken,
) -> Result<MetadataPreview> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    let candidates = candidate_detail(pool, http, provider_id, source_id, cancel).await?;
    let values = store::load_work_field_values(pool, work_id).await?;
    let claims = store::load_claims(pool, work_id).await?;
    let providers = list_providers(pool).await?;
    let provider = providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .with_context(|| format!("未知的元数据来源：{provider_id}"))?;
    let mut fields = Vec::new();
    for (field, label) in FIELD_LABELS {
        let Some(candidate) = candidate_value(&candidates, field) else {
            continue;
        };
        if is_empty_value(&candidate) {
            continue;
        }
        let current = values.current(field);
        let field_claims: Vec<&store::ClaimRow> = claims
            .iter()
            .filter(|claim| claim.field == *field)
            .collect();
        let locked_claim = field_claims.iter().find(|claim| claim.locked);
        let existing: Vec<ClaimPreview> = field_claims
            .iter()
            .map(|claim| ClaimPreview {
                source: claim.source.clone(),
                source_id: claim.source_id.clone(),
                value: claim.value.clone(),
                priority: claim.priority,
                locked: claim.locked,
            })
            .collect();
        let best_existing_priority = field_claims
            .iter()
            .filter(|claim| !is_empty_value(&claim.value))
            .map(|claim| claim.priority)
            .min();
        let current_empty = is_empty_value(&current);
        let same_as_current = same_value(&candidate, &current);
        let default_selected = current_empty
            && locked_claim.is_none()
            && !same_as_current
            && best_existing_priority.is_none_or(|priority| provider.priority <= priority);
        fields.push(PreviewField {
            field: field.to_string(),
            label: label.to_string(),
            current,
            candidate,
            source: provider_id.to_string(),
            source_id: source_id.to_string(),
            locked: locked_claim.is_some(),
            lock_source: locked_claim.map(|claim| claim.source.clone()),
            default_selected,
            priority: provider.priority,
            existing,
        });
    }
    let cover_locked = claims
        .iter()
        .any(|claim| claim.field == "cover" && claim.locked);
    let cover = candidates.cover_url.as_ref().map(|url| PreviewCover {
        current_source: values.cover_source.clone(),
        candidate_url: url.clone(),
        default_selected: values.cover_source.is_none() && !cover_locked,
        locked: cover_locked,
    });
    Ok(MetadataPreview {
        work_id,
        provider: provider_id.to_string(),
        provider_name: provider.name.clone(),
        source_id: source_id.to_string(),
        candidate: candidates,
        fields,
        cover,
    })
}

pub async fn import(
    pool: &SqlitePool,
    data_dir: &Path,
    http: &MetadataHttp,
    request: MetadataImportRequest,
    cancel: &CancellationToken,
) -> Result<MetadataImportResult> {
    if !db::work_exists(pool, request.work_id).await? {
        bail!("作品不存在");
    }
    let detail =
        candidate_detail(pool, http, &request.provider, &request.source_id, cancel).await?;
    let cover_bytes = if request.selected_cover {
        if let Some(url) = detail.cover_url.as_deref() {
            Some(http.download_image(&request.provider, url, cancel).await?)
        } else {
            None
        }
    } else {
        None
    };

    apply_import(pool, data_dir, request, &detail, cover_bytes).await
}

async fn apply_import(
    pool: &SqlitePool,
    data_dir: &Path,
    request: MetadataImportRequest,
    detail: &CandidateDetail,
    cover_bytes: Option<Vec<u8>>,
) -> Result<MetadataImportResult> {
    let claims = store::load_claims(pool, request.work_id).await?;
    let locked_fields: Vec<String> = claims
        .iter()
        .filter(|claim| claim.locked)
        .map(|claim| claim.field.clone())
        .collect();

    let mut applied = Vec::new();
    let mut skipped_locked = Vec::new();
    let mut selected_fields: Vec<String> = request.selected_fields.into_iter().collect();
    selected_fields.sort();
    selected_fields.dedup();
    let mut tx = pool.begin().await?;
    for field in &selected_fields {
        if field == "cover" {
            continue;
        }
        if locked_fields.iter().any(|locked| locked == field) {
            skipped_locked.push(field.clone());
            continue;
        }
        let Some(value) = candidate_value(detail, field) else {
            continue;
        };
        if is_empty_value(&value) {
            continue;
        }
        store::apply_field(&mut tx, request.work_id, field, &value).await?;
        store::upsert_claim(
            &mut tx,
            request.work_id,
            field,
            &request.provider,
            &request.source_id,
            &value,
            Some(0.9),
            false,
        )
        .await?;
        applied.push(field.clone());
    }
    store::touch_work(&mut tx, request.work_id).await?;
    tx.commit().await?;

    let mut cover_applied = false;
    if let Some(bytes) = cover_bytes
        && let Some(url) = detail.cover_url.as_deref()
    {
        if locked_fields.iter().any(|field| field == "cover") {
            skipped_locked.push("cover".to_string());
        } else {
            assets::set_cover_bytes(pool, data_dir, request.work_id, &bytes, url, "online").await?;
            let mut connection = pool.acquire().await?;
            store::upsert_claim(
                &mut connection,
                request.work_id,
                "cover",
                &request.provider,
                &request.source_id,
                &Value::String(url.to_string()),
                Some(0.9),
                false,
            )
            .await?;
            cover_applied = true;
        }
    }

    Ok(MetadataImportResult {
        applied,
        skipped_locked,
        cover_applied,
    })
}

pub async fn work_state(pool: &SqlitePool, work_id: i64) -> Result<MetadataWorkState> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    let values = store::load_work_field_values(pool, work_id).await?;
    let claims = store::load_claims(pool, work_id).await?;
    let providers = list_providers(pool).await?;
    let mut fields = Vec::new();
    for (field, label) in FIELD_LABELS {
        let current = values.current(field);
        let field_claims = claims.iter().filter(|claim| claim.field == *field);
        let source_claim = claims
            .iter()
            .filter(|claim| claim.field == *field)
            .find(|claim| same_value(&claim.value, &current));
        let locked_claim = field_claims.clone().find(|claim| claim.locked);
        fields.push(MetadataFieldState {
            field: field.to_string(),
            label: label.to_string(),
            current,
            source: source_claim.map(|claim| claim.source.clone()),
            source_id: source_claim.map(|claim| claim.source_id.clone()),
            locked: locked_claim.is_some(),
            lock_source: locked_claim.map(|claim| claim.source.clone()),
            claims: claims
                .iter()
                .filter(|claim| claim.field == *field)
                .map(claim_record)
                .collect(),
        });
    }
    let cover_claims: Vec<MetadataClaimRecord> = claims
        .iter()
        .filter(|claim| claim.field == "cover")
        .map(claim_record)
        .collect();
    fields.push(MetadataFieldState {
        field: "cover".to_string(),
        label: "封面".to_string(),
        current: values
            .cover_source
            .clone()
            .map_or(Value::Null, Value::String),
        source: values.cover_source.clone(),
        source_id: None,
        locked: cover_claims.iter().any(|claim| claim.locked),
        lock_source: cover_claims
            .iter()
            .find(|claim| claim.locked)
            .map(|claim| claim.source.clone()),
        claims: cover_claims,
    });
    if claims.iter().any(|claim| claim.field == "related") {
        fields.push(MetadataFieldState {
            field: "related".to_string(),
            label: "关联作品".to_string(),
            current: Value::Null,
            source: None,
            source_id: None,
            locked: false,
            lock_source: None,
            claims: claims
                .iter()
                .filter(|claim| claim.field == "related")
                .map(claim_record)
                .collect(),
        });
    }
    Ok(MetadataWorkState {
        work_id,
        providers,
        fields,
    })
}

pub async fn set_field_lock(
    pool: &SqlitePool,
    work_id: i64,
    field: &str,
    locked: bool,
) -> Result<()> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    let values = store::load_work_field_values(pool, work_id).await?;
    let current = if field == "cover" {
        values
            .cover_source
            .clone()
            .map_or(Value::Null, Value::String)
    } else if field == "related" {
        Value::Null
    } else {
        values.current(field)
    };
    store::set_field_lock(pool, work_id, field, locked, current).await
}

pub async fn record_manual_claim(
    connection: &mut SqliteConnection,
    work_id: i64,
    field: &str,
    value: &Value,
) -> Result<()> {
    store::upsert_claim(connection, work_id, field, "manual", "", value, None, true).await
}

fn claim_record(claim: &store::ClaimRow) -> MetadataClaimRecord {
    MetadataClaimRecord {
        id: claim.id,
        field: claim.field.clone(),
        source: claim.source.clone(),
        source_id: claim.source_id.clone(),
        value: claim.value.clone(),
        confidence: claim.confidence,
        locked: claim.locked,
        fetched_at: claim.fetched_at.clone(),
        provider_name: claim.provider_name.clone(),
        priority: claim.priority,
    }
}

fn candidate_value(detail: &CandidateDetail, field: &str) -> Option<Value> {
    match field {
        "title" => Some(Value::String(detail.title.clone())),
        "original_title" => Some(Value::String(detail.original_title.clone())),
        "aliases" => Some(serde_json::to_value(&detail.aliases).ok()?),
        "description" => Some(Value::String(detail.description.clone())),
        "year" => detail.year.map(Value::from),
        "tags" => Some(serde_json::to_value(&detail.tags).ok()?),
        "developer" => detail.developer.clone().map(Value::String),
        "publisher" => detail.publisher.clone().map(Value::String),
        "release_date" => detail.release_date.clone().map(Value::String),
        "cover" => detail.cover_url.clone().map(Value::String),
        _ => None,
    }
}

fn is_empty_value(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(value) => value.trim().is_empty(),
        Value::Array(values) => values.is_empty(),
        _ => false,
    }
}

fn same_value(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::String(left), Value::String(right)) => left.trim() == right.trim(),
        _ => left == right,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_memory_pool;
    use serde_json::json;
    use tempfile::TempDir;

    async fn seed_work(pool: &SqlitePool) -> i64 {
        let work_id = sqlx::query("INSERT INTO works (canonical_title) VALUES ('测试作品')")
            .execute(pool)
            .await
            .expect("work")
            .last_insert_rowid();
        let release_id = sqlx::query("INSERT INTO releases (work_id) VALUES (?)")
            .bind(work_id)
            .execute(pool)
            .await
            .expect("release")
            .last_insert_rowid();
        sqlx::query(
            "INSERT INTO local_copies
               (release_id, root_path, exe_path, exe_key, working_dir, display_name)
             VALUES (?, 'C:\\Games', 'C:\\Games\\game.exe', 'c:\\games\\game.exe',
                     'C:\\Games', '测试作品')",
        )
        .bind(release_id)
        .execute(pool)
        .await
        .expect("copy");
        work_id
    }

    #[tokio::test]
    async fn provider_order_and_enabled_state_are_persisted() {
        let pool = open_memory_pool().await.expect("pool");
        let providers = list_providers(&pool).await.expect("providers");
        assert_eq!(providers.len(), 2);
        assert_eq!(providers[0].id, "vndb");
        assert_eq!(providers[1].id, "bangumi");
        assert!(
            reorder_providers(&pool, &["vndb".to_string(), "vndb".to_string()])
                .await
                .is_err()
        );

        reorder_providers(&pool, &["bangumi".to_string(), "vndb".to_string()])
            .await
            .expect("reorder");
        set_provider_enabled(&pool, "vndb", false)
            .await
            .expect("disable");
        let providers = list_providers(&pool).await.expect("providers again");
        assert_eq!(providers[0].id, "bangumi");
        assert_eq!(providers[1].id, "vndb");
        assert!(!providers[1].enabled);
    }

    #[tokio::test]
    async fn locked_fields_are_skipped_and_other_fields_are_imported() {
        let pool = open_memory_pool().await.expect("pool");
        let work_id = seed_work(&pool).await;
        let mut connection = pool.acquire().await.expect("connection");
        store::upsert_claim(
            &mut connection,
            work_id,
            "title",
            "vndb",
            "v11469",
            &json!("VNDB 标题"),
            Some(0.9),
            false,
        )
        .await
        .expect("claim");
        drop(connection);
        set_field_lock(&pool, work_id, "title", true)
            .await
            .expect("lock");

        let detail = CandidateDetail {
            provider: "bangumi".to_string(),
            source_id: "50756".to_string(),
            title: "新标题".to_string(),
            original_title: "新月影".to_string(),
            aliases: vec!["月影".to_string()],
            description: "新简介".to_string(),
            release_date: Some("2013-04-18".to_string()),
            year: Some(2013),
            developer: Some("TAKUYO".to_string()),
            publisher: Some("TAKUYO".to_string()),
            tags: vec!["乙女向".to_string()],
            cover_url: None,
            related: Vec::new(),
            raw_json: "{}".to_string(),
        };
        let request = MetadataImportRequest {
            work_id,
            provider: "bangumi".to_string(),
            source_id: "50756".to_string(),
            selected_fields: vec!["title".to_string(), "description".to_string()],
            selected_cover: false,
        };
        let temp = TempDir::new().expect("temp");
        let result = apply_import(&pool, temp.path(), request, &detail, None)
            .await
            .expect("import");
        assert_eq!(result.applied, vec!["description"]);
        assert_eq!(result.skipped_locked, vec!["title"]);

        let state = work_state(&pool, work_id).await.expect("state");
        let title = state
            .fields
            .iter()
            .find(|field| field.field == "title")
            .expect("title field");
        assert_eq!(title.current, json!("测试作品"));
        assert!(title.locked);
        assert_eq!(title.lock_source.as_deref(), Some("vndb"));
        let description = state
            .fields
            .iter()
            .find(|field| field.field == "description")
            .expect("description field");
        assert_eq!(description.current, json!("新简介"));
        assert_eq!(description.source.as_deref(), Some("bangumi"));
    }

    #[tokio::test]
    #[ignore = "requires network access to VNDB and Bangumi"]
    async fn live_provider_smoke() {
        let http = MetadataHttp::new().expect("http");
        let cancel = CancellationToken::new();
        let vndb_results = vndb::search(&http, "月影", &cancel)
            .await
            .expect("vndb search");
        assert!(!vndb_results.is_empty());
        let vndb_detail = vndb::detail(&http, &vndb_results[0].source_id, &cancel)
            .await
            .expect("vndb detail");
        assert!(!vndb_detail.title.is_empty());
        let english_results = vndb::search(&http, "Getsuei", &cancel)
            .await
            .expect("vndb english search");
        assert!(!english_results.is_empty());

        let bangumi_results = bangumi::search(&http, "月影", &cancel)
            .await
            .expect("bangumi search");
        assert!(!bangumi_results.is_empty());
        let bangumi_detail = bangumi::detail(&http, &bangumi_results[0].source_id, &cancel)
            .await
            .expect("bangumi detail");
        assert!(!bangumi_detail.title.is_empty());
    }

    #[tokio::test]
    #[ignore = "requires network access to VNDB and Bangumi"]
    async fn live_search_priority_and_cover_import() {
        let pool = open_memory_pool().await.expect("pool");
        let work_id = seed_work(&pool).await;
        let http = MetadataHttp::new().expect("http");
        let cancel = CancellationToken::new();
        let outcome = search_all(&pool, &http, "月影", None, &cancel, |_, _, _, _| {})
            .await
            .expect("search");
        assert!(outcome.results.iter().any(|item| item.provider == "vndb"));
        assert!(
            outcome
                .results
                .iter()
                .any(|item| item.provider == "bangumi")
        );
        assert!(
            outcome
                .results
                .windows(2)
                .all(|pair| pair[0].priority <= pair[1].priority)
        );

        let candidate = outcome
            .results
            .iter()
            .find(|item| item.provider == "bangumi" && item.cover_url.is_some())
            .expect("bangumi candidate with cover");
        let detail = bangumi::detail(&http, &candidate.source_id, &cancel)
            .await
            .expect("detail");
        let cover_url = detail.cover_url.clone().expect("cover url");
        let cover_bytes = http
            .download_image("bangumi", &cover_url, &cancel)
            .await
            .expect("cover bytes");
        let temp = TempDir::new().expect("temp");
        let result = apply_import(
            &pool,
            temp.path(),
            MetadataImportRequest {
                work_id,
                provider: "bangumi".to_string(),
                source_id: candidate.source_id.clone(),
                selected_fields: Vec::new(),
                selected_cover: true,
            },
            &detail,
            Some(cover_bytes),
        )
        .await
        .expect("cover import");
        assert!(result.cover_applied);
        let (source, original_path, thumb_path): (String, String, String) = sqlx::query_as(
            "SELECT source, original_path, thumb_path FROM assets WHERE work_id = ? AND kind = 'cover'",
        )
        .bind(work_id)
        .fetch_one(&pool)
        .await
        .expect("asset row");
        assert_eq!(source, "online");
        assert!(temp.path().join("assets").join(original_path).is_file());
        assert!(temp.path().join("assets").join(thumb_path).is_file());
    }
}
