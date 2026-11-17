mod bangumi;
mod hikarinagi;
mod http;
mod merge;
mod nextmoe;
mod steam;
mod store;
mod types;
mod vndb;

use std::collections::{HashMap, HashSet};
use std::path::Path;

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use serde_json::Value;
use sqlx::sqlite::SqliteConnection;
use sqlx::{Row, SqlitePool};
use tokio_util::sync::CancellationToken;

use crate::assets;
use crate::db;
use crate::oauth::OAuthService;

pub use http::MetadataHttp;
pub use merge::{
    adopt_claim, field_priority_states, merge_apply, merge_preview, reorder_field_priorities,
    reset_field_priority, set_field_priority_global,
};
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
const NEXTMOE_FIELDS: &[&str] = &[
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
const HIKARINAGI_FIELDS: &[&str] = &[
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
const STEAM_FIELDS: &[&str] = &[
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
pub(crate) trait MetadataProvider: Send + Sync {
    fn descriptor(&self) -> ProviderDescriptor;
    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>>;
    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        token: Option<&str>,
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
            oauth_provider: None,
        }
    }

    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        _token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>> {
        vndb::search(http, query, cancel).await
    }

    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        _token: Option<&str>,
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
            oauth_provider: None,
        }
    }

    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        _token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>> {
        bangumi::search(http, query, cancel).await
    }

    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        _token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<CandidateDetail> {
        bangumi::detail(http, source_id, cancel).await
    }

    fn parse_detail(&self, raw: &str) -> Result<CandidateDetail> {
        bangumi::parse_detail(raw)
    }
}

struct NextMoeProvider;

#[async_trait]
impl MetadataProvider for NextMoeProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "nextmoe",
            name: "Kungal / NextMoe",
            description: "六源对齐的标题、简介、厂商、标签和关联作品",
            fields: NEXTMOE_FIELDS,
            requires_auth: false,
            auth_kind: "none",
            oauth_provider: None,
        }
    }

    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        _token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>> {
        nextmoe::search(http, query, cancel).await
    }

    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        _token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<CandidateDetail> {
        nextmoe::detail(http, source_id, cancel).await
    }

    fn parse_detail(&self, raw: &str) -> Result<CandidateDetail> {
        nextmoe::parse_detail(raw)
    }
}

struct HikarinagiProvider;

#[async_trait]
impl MetadataProvider for HikarinagiProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "hikarinagi",
            name: "Hikarinagi",
            description: "Galgame 标题、简介、开发商、标签和封面（需要授权）",
            fields: HIKARINAGI_FIELDS,
            requires_auth: true,
            auth_kind: "oauth2",
            oauth_provider: Some("hikarinagi"),
        }
    }

    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>> {
        hikarinagi::search(http, query, token, cancel).await
    }

    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<CandidateDetail> {
        hikarinagi::detail(http, source_id, token, cancel).await
    }

    fn parse_detail(&self, raw: &str) -> Result<CandidateDetail> {
        hikarinagi::parse_detail(raw)
    }
}

struct SteamProvider;

#[async_trait]
impl MetadataProvider for SteamProvider {
    fn descriptor(&self) -> ProviderDescriptor {
        ProviderDescriptor {
            id: "steam",
            name: "Steam",
            description: "商店页、发行信息、类型标签和封面",
            fields: STEAM_FIELDS,
            requires_auth: false,
            auth_kind: "none",
            oauth_provider: None,
        }
    }

    async fn search(
        &self,
        http: &MetadataHttp,
        query: &str,
        _token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<Vec<SearchCandidate>> {
        steam::search(http, query, cancel).await
    }

    async fn detail(
        &self,
        http: &MetadataHttp,
        source_id: &str,
        _token: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<CandidateDetail> {
        steam::detail(http, source_id, cancel).await
    }

    fn parse_detail(&self, raw: &str) -> Result<CandidateDetail> {
        steam::parse_detail(raw)
    }
}

fn all_providers() -> Vec<Box<dyn MetadataProvider>> {
    vec![
        Box::new(VndbProvider),
        Box::new(BangumiProvider),
        Box::new(NextMoeProvider),
        Box::new(HikarinagiProvider),
        Box::new(SteamProvider),
    ]
}

pub(crate) fn provider_by_id(id: &str) -> Option<Box<dyn MetadataProvider>> {
    all_providers()
        .into_iter()
        .find(|provider| provider.descriptor().id == id)
}

pub(crate) fn descriptors() -> Vec<ProviderDescriptor> {
    all_providers()
        .into_iter()
        .map(|provider| provider.descriptor())
        .collect()
}

pub async fn list_providers(pool: &SqlitePool, oauth: &OAuthService) -> Result<Vec<ProviderInfo>> {
    let descriptors = descriptors();
    store::ensure_providers(pool, &descriptors).await?;
    let rows = store::list_providers(pool).await?;
    let accounts = sqlx::query("SELECT provider, account_name FROM oauth_accounts")
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("provider"),
                row.get::<Option<String>, _>("account_name"),
            )
        })
        .collect::<HashMap<_, _>>();
    Ok(rows
        .into_iter()
        .map(|row| {
            let descriptor = descriptors.iter().find(|item| item.id == row.id);
            let oauth_id = descriptor.and_then(|item| item.oauth_provider);
            let has_account = oauth_id.is_some_and(|id| accounts.contains_key(id));
            let connected = descriptor.is_none_or(|item| !item.requires_auth)
                || oauth_id.is_some_and(|id| oauth.has_usable_credentials(id))
                || has_account;
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
                connected,
                account_name: oauth_id.and_then(|id| accounts.get(id).cloned().flatten()),
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
    oauth: &OAuthService,
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
    let providers = list_providers(pool, oauth).await?;
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
        let token = if provider.descriptor().requires_auth {
            match oauth.access_token(pool, &provider_info.id).await {
                Ok(token) => Some(token),
                Err(error) => {
                    errors.push(ProviderFailure {
                        provider: provider_info.id.clone(),
                        provider_name: provider_info.name.clone(),
                        message: error.to_string(),
                    });
                    progress(&provider_info.id, &provider_info.name, index + 1, total);
                    continue;
                }
            }
        } else {
            None
        };
        let provider_results = provider.search(http, query, token.as_deref(), cancel).await;
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

pub(crate) async fn candidate_detail(
    pool: &SqlitePool,
    http: &MetadataHttp,
    oauth: &OAuthService,
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
    let token = if provider.descriptor().requires_auth {
        Some(oauth.access_token(pool, provider_id).await?)
    } else {
        None
    };
    let detail = provider
        .detail(http, source_id, token.as_deref(), cancel)
        .await?;
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
        "nextmoe" | "hikarinagi" => {
            !source_id.is_empty()
                && source_id
                    .chars()
                    .all(|character| character.is_ascii_digit())
        }
        "steam" => steam::normalize_app_id(source_id).is_ok(),
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
    oauth: &OAuthService,
    work_id: i64,
    provider_id: &str,
    source_id: &str,
    cancel: &CancellationToken,
) -> Result<MetadataPreview> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    let candidates = candidate_detail(pool, http, oauth, provider_id, source_id, cancel).await?;
    let values = store::load_work_field_values(pool, work_id).await?;
    let mut claims = store::load_claims(pool, work_id).await?;
    let priorities = merge::effective_priorities(pool, oauth).await?;
    merge::apply_claim_priorities(&mut claims, &priorities);
    let providers = list_providers(pool, oauth).await?;
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
        let existing: Vec<ClaimPreview> = field_claims
            .iter()
            .map(|claim| ClaimPreview {
                source: claim.source.clone(),
                source_id: claim.source_id.clone(),
                value: claim.value.clone(),
                priority: claim.priority,
            })
            .collect();
        let best_existing_priority = field_claims
            .iter()
            .filter(|claim| !is_empty_value(&claim.value))
            .map(|claim| claim.priority)
            .min();
        let field_priority = priorities
            .get(*field)
            .and_then(|entries| entries.get(provider_id))
            .copied()
            .unwrap_or(provider.priority);
        let current_empty = is_empty_value(&current);
        let same_as_current = same_value(&candidate, &current);
        let default_selected = current_empty
            && !same_as_current
            && best_existing_priority.is_none_or(|priority| field_priority <= priority);
        fields.push(PreviewField {
            field: field.to_string(),
            label: label.to_string(),
            current,
            candidate,
            source: provider_id.to_string(),
            source_id: source_id.to_string(),
            default_selected,
            priority: field_priority,
            existing,
        });
    }
    let mut cover_options = candidates
        .covers
        .iter()
        .enumerate()
        .map(|(index, option)| PreviewCover {
            current_source: values.cover_source.clone(),
            candidate_url: option.url.clone(),
            kind: option.kind.clone(),
            default_selected: values.cover_source.is_none() && index == 0,
        })
        .collect::<Vec<_>>();
    if cover_options.is_empty()
        && let Some(url) = candidates.cover_url.as_ref()
    {
        cover_options.push(PreviewCover {
            current_source: values.cover_source.clone(),
            candidate_url: url.clone(),
            kind: "cover".to_string(),
            default_selected: values.cover_source.is_none(),
        });
    }
    let cover = cover_options.first().cloned();
    Ok(MetadataPreview {
        work_id,
        provider: provider_id.to_string(),
        provider_name: provider.name.clone(),
        source_id: source_id.to_string(),
        candidate: candidates,
        fields,
        cover,
        cover_options,
    })
}

pub async fn import(
    pool: &SqlitePool,
    data_dir: &Path,
    http: &MetadataHttp,
    oauth: &OAuthService,
    request: MetadataImportRequest,
    cancel: &CancellationToken,
) -> Result<MetadataImportResult> {
    if !db::work_exists(pool, request.work_id).await? {
        bail!("作品不存在");
    }
    let detail = candidate_detail(
        pool,
        http,
        oauth,
        &request.provider,
        &request.source_id,
        cancel,
    )
    .await?;
    let cover_url = if request.selected_cover {
        if let Some(url) = request
            .cover_url
            .as_deref()
            .filter(|url| !url.trim().is_empty())
        {
            if !detail.covers.iter().any(|cover| cover.url == url)
                && detail.cover_url.as_deref() != Some(url)
            {
                bail!("所选封面不属于该来源");
            }
            Some(url.to_string())
        } else {
            detail.cover_url.clone()
        }
    } else {
        None
    };
    let cover_bytes = if let Some(url) = cover_url.as_deref() {
        Some(http.download_image(&request.provider, url, cancel).await?)
    } else {
        None
    };

    let work_id = request.work_id;
    let result = apply_import(
        pool,
        data_dir,
        request,
        &detail,
        cover_bytes,
        cover_url.as_deref(),
    )
    .await?;
    let _ = merge::sync_source_links(pool, http, oauth, work_id, cancel).await;
    Ok(result)
}

async fn apply_import(
    pool: &SqlitePool,
    data_dir: &Path,
    request: MetadataImportRequest,
    detail: &CandidateDetail,
    cover_bytes: Option<Vec<u8>>,
    cover_url: Option<&str>,
) -> Result<MetadataImportResult> {
    let mut applied = Vec::new();
    let mut selected_fields: Vec<String> = request.selected_fields.into_iter().collect();
    selected_fields.sort();
    selected_fields.dedup();
    let mut tx = pool.begin().await?;
    for field in &selected_fields {
        if field == "cover" {
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
        )
        .await?;
        applied.push(field.clone());
    }
    store::upsert_source_link(
        &mut tx,
        request.work_id,
        &request.provider,
        &request.source_id,
        &detail.title,
    )
    .await?;
    store::touch_work(&mut tx, request.work_id).await?;
    tx.commit().await?;

    let mut cover_applied = false;
    if let Some(bytes) = cover_bytes
        && let Some(url) = cover_url
    {
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
        )
        .await?;
        cover_applied = true;
    }

    Ok(MetadataImportResult {
        applied,
        cover_applied,
    })
}

pub async fn bangumi_source_id(pool: &SqlitePool, work_id: i64) -> Result<Option<String>> {
    let links = store::load_source_links(pool, work_id).await?;
    if let Some(link) = links
        .into_iter()
        .find(|link| link.provider == "bangumi" && !link.source_id.trim().is_empty())
    {
        return Ok(Some(link.source_id));
    }
    let claims = store::load_claims(pool, work_id).await?;
    Ok(claims
        .into_iter()
        .find(|claim| claim.source == "bangumi" && !claim.source_id.trim().is_empty())
        .map(|claim| claim.source_id))
}

pub async fn save_source_links(
    pool: &SqlitePool,
    work_id: i64,
    links: Vec<SourceLinkInput>,
) -> Result<Vec<WorkSourceLink>> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    store::ensure_providers(pool, &descriptors()).await?;
    let known_providers: HashSet<String> = sqlx::query_scalar("SELECT id FROM metadata_providers")
        .fetch_all(pool)
        .await?
        .into_iter()
        .collect();
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for link in links {
        let provider = link.provider.trim().to_ascii_lowercase();
        if !known_providers.contains(&provider) {
            bail!("未知来源：{provider}");
        }
        if !seen.insert(provider.clone()) {
            bail!("来源重复：{provider}");
        }
        let source_id = link.source_id.trim();
        if source_id.chars().count() > 256 {
            bail!("{provider} 来源编号过长");
        }
        if source_id.contains('\0') {
            bail!("{provider} 来源编号包含无效字符");
        }
        let title = link.title.trim();
        if title.chars().count() > 200 {
            bail!("{provider} 来源标题过长");
        }
        normalized.push((provider, source_id.to_string(), title.to_string()));
    }

    let mut tx = pool.begin().await?;
    for (provider, source_id, title) in normalized {
        if source_id.is_empty() {
            sqlx::query("DELETE FROM work_source_links WHERE work_id = ? AND provider = ?")
                .bind(work_id)
                .bind(provider)
                .execute(&mut *tx)
                .await?;
        } else {
            store::upsert_source_link(&mut tx, work_id, &provider, &source_id, &title).await?;
        }
    }
    tx.commit().await?;
    store::load_source_links(pool, work_id).await
}

pub async fn work_state(
    pool: &SqlitePool,
    oauth: &OAuthService,
    work_id: i64,
) -> Result<MetadataWorkState> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    let values = store::load_work_field_values(pool, work_id).await?;
    let mut claims = store::load_claims(pool, work_id).await?;
    let source_links = store::load_source_links(pool, work_id).await?;
    let priorities = merge::effective_priorities(pool, oauth).await?;
    merge::apply_claim_priorities(&mut claims, &priorities);
    let providers = list_providers(pool, oauth).await?;
    let mut fields = Vec::new();
    for (field, label) in FIELD_LABELS {
        let current = values.current(field);
        let field_claims = claims
            .iter()
            .filter(|claim| claim.field == *field)
            .collect::<Vec<_>>();
        let source_claim = field_claims
            .iter()
            .find(|claim| same_value(&claim.value, &current))
            .copied();
        let preferred_claim_id = field_claims
            .iter()
            .filter(|claim| !is_empty_value(&claim.value))
            .min_by_key(|claim| claim.priority)
            .map(|claim| claim.id);
        fields.push(MetadataFieldState {
            field: field.to_string(),
            label: label.to_string(),
            current,
            source: source_claim.map(|claim| claim.source.clone()),
            source_id: source_claim.map(|claim| claim.source_id.clone()),
            conflict: has_conflicting_claims(&field_claims),
            preferred_claim_id,
            current_claim_id: source_claim.map(|claim| claim.id),
            claims: field_claims
                .iter()
                .map(|claim| claim_record(claim))
                .collect(),
        });
    }
    let cover_rows = claims
        .iter()
        .filter(|claim| claim.field == "cover")
        .collect::<Vec<_>>();
    let cover_source_claim = values.cover_source.as_deref().and_then(|source| {
        cover_rows
            .iter()
            .find(|claim| claim.value.as_str() == Some(source))
            .copied()
    });
    let cover_preferred_claim_id = cover_rows
        .iter()
        .filter(|claim| !is_empty_value(&claim.value))
        .min_by_key(|claim| claim.priority)
        .map(|claim| claim.id);
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
        source_id: cover_source_claim.map(|claim| claim.source_id.clone()),
        conflict: has_conflicting_claims(&cover_rows),
        preferred_claim_id: cover_preferred_claim_id,
        current_claim_id: cover_source_claim.map(|claim| claim.id),
        claims: cover_claims,
    });
    if claims.iter().any(|claim| claim.field == "related") {
        let related_claims = claims
            .iter()
            .filter(|claim| claim.field == "related")
            .collect::<Vec<_>>();
        fields.push(MetadataFieldState {
            field: "related".to_string(),
            label: "关联作品".to_string(),
            current: Value::Null,
            source: None,
            source_id: None,
            conflict: has_conflicting_claims(&related_claims),
            preferred_claim_id: related_claims
                .iter()
                .filter(|claim| !is_empty_value(&claim.value))
                .min_by_key(|claim| claim.priority)
                .map(|claim| claim.id),
            current_claim_id: None,
            claims: related_claims
                .iter()
                .map(|claim| claim_record(claim))
                .collect(),
        });
    }
    Ok(MetadataWorkState {
        work_id,
        providers,
        fields,
        source_links,
    })
}

pub async fn record_manual_claim(
    connection: &mut SqliteConnection,
    work_id: i64,
    field: &str,
    value: &Value,
) -> Result<()> {
    store::upsert_claim(connection, work_id, field, "manual", "", value, None).await
}

fn has_conflicting_claims(claims: &[&store::ClaimRow]) -> bool {
    let mut values = Vec::new();
    for claim in claims {
        if is_empty_value(&claim.value)
            || values
                .iter()
                .any(|value: &&Value| same_value(value, &claim.value))
        {
            continue;
        }
        values.push(&claim.value);
    }
    values.len() > 1
}

fn claim_record(claim: &store::ClaimRow) -> MetadataClaimRecord {
    MetadataClaimRecord {
        id: claim.id,
        field: claim.field.clone(),
        source: claim.source.clone(),
        source_id: claim.source_id.clone(),
        value: claim.value.clone(),
        confidence: claim.confidence,
        fetched_at: claim.fetched_at.clone(),
        provider_name: claim.provider_name.clone(),
        priority: claim.priority,
    }
}

pub(crate) fn candidate_value(detail: &CandidateDetail, field: &str) -> Option<Value> {
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

pub(crate) fn is_empty_value(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(value) => value.trim().is_empty(),
        Value::Array(values) => values.is_empty(),
        _ => false,
    }
}

pub(crate) fn same_value(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::String(left), Value::String(right)) => left.trim() == right.trim(),
        _ => left == right,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_memory_pool;
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
        let temp = TempDir::new().expect("temp");
        let oauth = OAuthService::new(temp.path()).expect("oauth");
        let providers = list_providers(&pool, &oauth).await.expect("providers");
        assert_eq!(providers.len(), 5);
        assert_eq!(providers[0].id, "vndb");
        assert_eq!(providers[1].id, "bangumi");
        assert!(
            reorder_providers(&pool, &["vndb".to_string(), "vndb".to_string()])
                .await
                .is_err()
        );

        reorder_providers(
            &pool,
            &[
                "bangumi".to_string(),
                "vndb".to_string(),
                "nextmoe".to_string(),
                "hikarinagi".to_string(),
                "steam".to_string(),
            ],
        )
        .await
        .expect("reorder");
        set_provider_enabled(&pool, "vndb", false)
            .await
            .expect("disable");
        let providers = list_providers(&pool, &oauth)
            .await
            .expect("providers again");
        assert_eq!(providers[0].id, "bangumi");
        assert_eq!(providers[1].id, "vndb");
        assert!(!providers[1].enabled);
    }

    #[tokio::test]
    async fn source_links_can_be_edited_and_cleared() {
        let pool = open_memory_pool().await.expect("pool");
        let work_id = seed_work(&pool).await;
        let saved = save_source_links(
            &pool,
            work_id,
            vec![
                SourceLinkInput {
                    provider: "bangumi".to_string(),
                    source_id: "50756".to_string(),
                    title: "测试作品".to_string(),
                },
                SourceLinkInput {
                    provider: "steam".to_string(),
                    source_id: "324160".to_string(),
                    title: "测试作品".to_string(),
                },
            ],
        )
        .await
        .expect("save links");
        assert_eq!(saved.len(), 2);
        assert_eq!(
            bangumi_source_id(&pool, work_id).await.expect("bangumi id"),
            Some("50756".to_string())
        );

        let cleared = save_source_links(
            &pool,
            work_id,
            vec![
                SourceLinkInput {
                    provider: "bangumi".to_string(),
                    source_id: String::new(),
                    title: String::new(),
                },
                SourceLinkInput {
                    provider: "steam".to_string(),
                    source_id: "324160".to_string(),
                    title: "Steam".to_string(),
                },
            ],
        )
        .await
        .expect("clear bangumi link");
        assert_eq!(cleared.len(), 1);
        assert_eq!(cleared[0].provider, "steam");
        assert_eq!(
            bangumi_source_id(&pool, work_id).await.expect("bangumi id"),
            None
        );
        assert!(
            save_source_links(
                &pool,
                work_id,
                vec![SourceLinkInput {
                    provider: "unknown".to_string(),
                    source_id: "1".to_string(),
                    title: String::new(),
                }],
            )
            .await
            .is_err()
        );
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

        let nextmoe_results = nextmoe::search(&http, "CLANNAD", &cancel)
            .await
            .expect("kungal search");
        assert!(!nextmoe_results.is_empty());
        let nextmoe_detail = nextmoe::detail(&http, &nextmoe_results[0].source_id, &cancel)
            .await
            .expect("kungal detail");
        assert!(!nextmoe_detail.title.is_empty());
        assert!(nextmoe_detail.developer.is_some() || !nextmoe_detail.tags.is_empty());
    }

    #[tokio::test]
    #[ignore = "requires network access to VNDB and Bangumi"]
    async fn live_search_priority_and_cover_import() {
        let pool = open_memory_pool().await.expect("pool");
        let work_id = seed_work(&pool).await;
        let http = MetadataHttp::new().expect("http");
        let temp = TempDir::new().expect("temp");
        let oauth = OAuthService::new(temp.path()).expect("oauth");
        let cancel = CancellationToken::new();
        let outcome = search_all(&pool, &http, &oauth, "月影", None, &cancel, |_, _, _, _| {})
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
        let result = apply_import(
            &pool,
            temp.path(),
            MetadataImportRequest {
                work_id,
                provider: "bangumi".to_string(),
                source_id: candidate.source_id.clone(),
                selected_fields: Vec::new(),
                selected_cover: true,
                cover_url: Some(cover_url.clone()),
            },
            &detail,
            Some(cover_bytes),
            Some(&cover_url),
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
