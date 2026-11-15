use std::collections::{HashMap, HashSet};
use std::path::Path;

use anyhow::{Context, Result, bail};
use serde_json::Value;
use sqlx::SqlitePool;
use tokio_util::sync::CancellationToken;

use crate::assets;
use crate::db;
use crate::oauth::OAuthService;

use super::store::{self, ClaimRow, WorkFieldValues};
use super::types::*;
use super::{
    FIELD_LABELS, candidate_detail, candidate_value, is_empty_value, list_providers, provider_by_id,
};

pub const PRIORITY_FIELDS: &[(&str, &str)] = &[
    ("title", "标题"),
    ("original_title", "原题"),
    ("aliases", "别名"),
    ("description", "简介"),
    ("year", "年份"),
    ("tags", "标签"),
    ("developer", "开发商"),
    ("publisher", "发行商"),
    ("release_date", "发行日期"),
    ("cover", "封面"),
    ("related", "关联作品"),
];

const MATCH_MIN_SCORE: f64 = 0.35;
const AUTO_MATCH_SCORE: f64 = 0.6;

pub fn default_field_priority(field: &str, provider: &str, global_priority: i64) -> i64 {
    let preferred = match (field, provider) {
        ("title", "bangumi") => Some(10),
        ("title", "vndb") => Some(20),
        ("title", "nextmoe") => Some(25),
        ("title", "hikarinagi") => Some(27),
        ("title", "steam") => Some(30),
        ("original_title", "vndb") => Some(10),
        ("original_title", "bangumi") => Some(20),
        ("original_title", "nextmoe") => Some(25),
        ("original_title", "hikarinagi") => Some(27),
        ("original_title", "steam") => Some(30),
        ("aliases", "vndb") => Some(10),
        ("aliases", "bangumi") => Some(20),
        ("aliases", "nextmoe") => Some(25),
        ("aliases", "hikarinagi") => Some(27),
        ("aliases", "steam") => Some(30),
        ("description", "bangumi") => Some(10),
        ("description", "vndb") => Some(20),
        ("description", "nextmoe") => Some(25),
        ("description", "hikarinagi") => Some(27),
        ("description", "steam") => Some(30),
        ("year", "vndb") => Some(10),
        ("year", "bangumi") => Some(20),
        ("year", "nextmoe") => Some(25),
        ("year", "hikarinagi") => Some(27),
        ("year", "steam") => Some(30),
        ("tags", "vndb") => Some(10),
        ("tags", "bangumi") => Some(20),
        ("tags", "nextmoe") => Some(25),
        ("tags", "hikarinagi") => Some(27),
        ("tags", "steam") => Some(30),
        ("developer", "vndb") => Some(10),
        ("developer", "steam") => Some(20),
        ("developer", "nextmoe") => Some(25),
        ("developer", "bangumi") => Some(30),
        ("developer", "hikarinagi") => Some(35),
        ("publisher", "steam") => Some(10),
        ("publisher", "nextmoe") => Some(15),
        ("publisher", "vndb") => Some(20),
        ("publisher", "bangumi") => Some(30),
        ("publisher", "hikarinagi") => Some(35),
        ("release_date", "steam") => Some(10),
        ("release_date", "bangumi") => Some(20),
        ("release_date", "nextmoe") => Some(25),
        ("release_date", "vndb") => Some(30),
        ("release_date", "hikarinagi") => Some(35),
        ("related", "vndb") => Some(10),
        ("related", "nextmoe") => Some(20),
        ("cover", "vndb") => Some(10),
        ("cover", "bangumi") => Some(20),
        ("cover", "nextmoe") => Some(25),
        ("cover", "hikarinagi") => Some(27),
        ("cover", "steam") => Some(30),
        _ => None,
    };
    preferred.unwrap_or(1000 + global_priority)
}

pub async fn field_priority_states(
    pool: &SqlitePool,
    oauth: &OAuthService,
) -> Result<Vec<FieldPriorityState>> {
    let providers = list_providers(pool, oauth).await?;
    let global = store::field_priority_global(pool).await?;
    let saved = store::load_field_priorities(pool).await?;
    let saved_map: HashMap<(String, String), i64> = saved
        .into_iter()
        .map(|row| ((row.field, row.provider), row.rank))
        .collect();
    let mut states = Vec::new();
    for (field, label) in PRIORITY_FIELDS {
        let mut entries: Vec<FieldPriorityProvider> = providers
            .iter()
            .filter(|provider| provider.fields.iter().any(|item| item == field))
            .map(|provider| FieldPriorityProvider {
                provider: provider.id.clone(),
                provider_name: provider.name.clone(),
                priority: if global {
                    provider.priority
                } else {
                    saved_map
                        .get(&(field.to_string(), provider.id.clone()))
                        .copied()
                        .unwrap_or_else(|| {
                            default_field_priority(field, &provider.id, provider.priority)
                        })
                },
                enabled: provider.enabled,
            })
            .collect();
        entries.sort_by(|left, right| {
            left.priority
                .cmp(&right.priority)
                .then_with(|| left.provider_name.cmp(&right.provider_name))
        });
        let custom = !global
            && entries
                .iter()
                .any(|entry| saved_map.contains_key(&(field.to_string(), entry.provider.clone())));
        states.push(FieldPriorityState {
            field: field.to_string(),
            label: label.to_string(),
            providers: entries,
            custom,
            global,
        });
    }
    Ok(states)
}

pub async fn reorder_field_priorities(
    pool: &SqlitePool,
    oauth: &OAuthService,
    field: &str,
    provider_ids: &[String],
) -> Result<()> {
    if store::field_priority_global(pool).await? {
        bail!("全局来源顺序已开启，请先关闭后再调整单个字段");
    }
    if !PRIORITY_FIELDS.iter().any(|(item, _)| *item == field) {
        bail!("未知的元数据字段：{field}");
    }
    let providers = list_providers(pool, oauth).await?;
    let supporting: Vec<String> = providers
        .iter()
        .filter(|provider| provider.fields.iter().any(|item| item == field))
        .map(|provider| provider.id.clone())
        .collect();
    if supporting.is_empty() {
        bail!("{field} 没有可用的来源");
    }
    for provider in provider_ids {
        if !supporting.iter().any(|item| item == provider) {
            bail!("来源 {provider} 不支持此字段");
        }
    }
    let unique: HashSet<&String> = provider_ids.iter().collect();
    if unique.len() != provider_ids.len() {
        bail!("字段来源顺序不能重复");
    }
    let mut ordered = provider_ids.to_vec();
    for provider in supporting {
        if !ordered.iter().any(|item| item == &provider) {
            ordered.push(provider);
        }
    }
    store::set_field_priorities(pool, field, &ordered).await
}

pub async fn reset_field_priority(pool: &SqlitePool, field: &str) -> Result<()> {
    if !PRIORITY_FIELDS.iter().any(|(item, _)| *item == field) {
        bail!("未知的元数据字段：{field}");
    }
    store::reset_field_priorities(pool, field).await
}

pub async fn set_field_priority_global(pool: &SqlitePool, enabled: bool) -> Result<()> {
    store::set_field_priority_global(pool, enabled).await
}

pub async fn effective_priorities(
    pool: &SqlitePool,
    oauth: &OAuthService,
) -> Result<HashMap<String, HashMap<String, i64>>> {
    let providers = list_providers(pool, oauth).await?;
    let global = store::field_priority_global(pool).await?;
    let saved = store::load_field_priorities(pool).await?;
    let saved_map: HashMap<(String, String), i64> = saved
        .into_iter()
        .map(|row| ((row.field, row.provider), row.rank))
        .collect();
    let mut result = HashMap::new();
    for (field, _) in PRIORITY_FIELDS {
        let mut entries = HashMap::new();
        for provider in &providers {
            if provider.fields.iter().any(|item| item == field) {
                entries.insert(
                    provider.id.clone(),
                    if global {
                        provider.priority
                    } else {
                        saved_map
                            .get(&(field.to_string(), provider.id.clone()))
                            .copied()
                            .unwrap_or_else(|| {
                                default_field_priority(field, &provider.id, provider.priority)
                            })
                    },
                );
            }
        }
        result.insert(field.to_string(), entries);
    }
    Ok(result)
}

pub fn apply_claim_priorities(
    claims: &mut [ClaimRow],
    priorities: &HashMap<String, HashMap<String, i64>>,
) {
    for claim in claims.iter_mut() {
        claim.priority = if claim.source == "manual" {
            0
        } else {
            priorities
                .get(&claim.field)
                .and_then(|fields| fields.get(&claim.source))
                .copied()
                .unwrap_or(claim.priority)
        };
    }
    claims.sort_by(|left, right| {
        left.field
            .cmp(&right.field)
            .then_with(|| left.priority.cmp(&right.priority))
            .then_with(|| right.fetched_at.cmp(&left.fetched_at))
    });
}

struct MatchedDetail {
    info: MergeMatch,
    detail: CandidateDetail,
}

async fn best_matches(
    pool: &SqlitePool,
    http: &super::MetadataHttp,
    oauth: &OAuthService,
    values: &WorkFieldValues,
    provider_filter: Option<&[String]>,
    cancel: &CancellationToken,
) -> Result<(Vec<MatchedDetail>, Vec<ProviderFailure>)> {
    let providers = list_providers(pool, oauth).await?;
    let enabled: Vec<ProviderInfo> = providers
        .into_iter()
        .filter(|provider| provider.enabled)
        .filter(|provider| {
            provider_filter.is_none_or(|filter| filter.is_empty() || filter.contains(&provider.id))
        })
        .collect();
    if enabled.is_empty() {
        bail!("没有启用的元数据来源");
    }
    let primary = if values.original_title.trim().is_empty() {
        values.title.trim().to_string()
    } else {
        values.original_title.trim().to_string()
    };
    let secondary = values.title.trim().to_string();
    let mut matched = Vec::new();
    let mut errors = Vec::new();
    for provider_info in enabled {
        if cancel.is_cancelled() {
            break;
        }
        let Some(provider) = provider_by_id(&provider_info.id) else {
            errors.push(ProviderFailure {
                provider: provider_info.id.clone(),
                provider_name: provider_info.name.clone(),
                message: "来源适配器未注册".to_string(),
            });
            continue;
        };
        let token = if provider_info.requires_auth {
            match oauth.access_token(pool, &provider_info.id).await {
                Ok(token) => Some(token),
                Err(error) => {
                    errors.push(ProviderFailure {
                        provider: provider_info.id.clone(),
                        provider_name: provider_info.name.clone(),
                        message: error.to_string(),
                    });
                    continue;
                }
            }
        } else {
            None
        };
        let mut candidates = match provider
            .search(http, &primary, token.as_deref(), cancel)
            .await
        {
            Ok(items) => items,
            Err(error) => {
                errors.push(ProviderFailure {
                    provider: provider_info.id.clone(),
                    provider_name: provider_info.name.clone(),
                    message: error.to_string(),
                });
                continue;
            }
        };
        if candidates.is_empty()
            && !secondary.is_empty()
            && secondary != primary
            && let Ok(items) = provider
                .search(http, &secondary, token.as_deref(), cancel)
                .await
        {
            candidates = items;
        }
        let best = candidates
            .into_iter()
            .map(|candidate| {
                let score = match_score(values, &candidate);
                (score, candidate)
            })
            .filter(|(score, _)| *score >= MATCH_MIN_SCORE)
            .max_by(|(left_score, left), (right_score, right)| {
                left_score
                    .total_cmp(right_score)
                    .then_with(|| right.source_id.cmp(&left.source_id))
            });
        let Some((score, candidate)) = best else {
            continue;
        };
        let detail = match candidate_detail(
            pool,
            http,
            oauth,
            &provider_info.id,
            &candidate.source_id,
            cancel,
        )
        .await
        {
            Ok(detail) => detail,
            Err(error) => {
                errors.push(ProviderFailure {
                    provider: provider_info.id.clone(),
                    provider_name: provider_info.name.clone(),
                    message: format!("{}（{}）", error, candidate.source_id),
                });
                continue;
            }
        };
        matched.push(MatchedDetail {
            info: MergeMatch {
                provider: provider_info.id.clone(),
                provider_name: provider_info.name.clone(),
                source_id: candidate.source_id,
                title: detail.title.clone(),
                original_title: detail.original_title.clone(),
                year: detail.year,
                score: round_score(score),
                priority: provider_info.priority,
            },
            detail,
        });
    }
    matched.sort_by_key(|left| left.info.priority);
    Ok((matched, errors))
}

pub async fn merge_preview(
    pool: &SqlitePool,
    http: &super::MetadataHttp,
    oauth: &OAuthService,
    work_id: i64,
    provider_filter: Option<&[String]>,
    cancel: &CancellationToken,
) -> Result<MergePreview> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    let values = store::load_work_field_values(pool, work_id).await?;
    let mut claims = store::load_claims(pool, work_id).await?;
    let priorities = effective_priorities(pool, oauth).await?;
    apply_claim_priorities(&mut claims, &priorities);
    let (matched, errors) =
        best_matches(pool, http, oauth, &values, provider_filter, cancel).await?;
    let fields = build_merge_fields(&values, &claims, &matched, &priorities);
    let cover_locked = claims
        .iter()
        .any(|claim| claim.field == "cover" && claim.locked);
    let default_cover = values.cover_source.is_none() && !cover_locked;
    let covers = build_merge_covers(&matched, &priorities, default_cover);
    Ok(MergePreview {
        work_id,
        title: values.title.clone(),
        query: if values.original_title.trim().is_empty() {
            values.title.clone()
        } else {
            values.original_title.clone()
        },
        matched: matched.iter().map(|item| item.info.clone()).collect(),
        errors,
        fields,
        covers,
    })
}

fn build_merge_fields(
    values: &WorkFieldValues,
    claims: &[ClaimRow],
    matched: &[MatchedDetail],
    priorities: &HashMap<String, HashMap<String, i64>>,
) -> Vec<MergeFieldState> {
    let mut fields = Vec::new();
    for (field, label) in FIELD_LABELS {
        let current = values.current(field);
        let field_claims: Vec<&ClaimRow> = claims
            .iter()
            .filter(|claim| claim.field == *field)
            .collect();
        let locked_claim = field_claims.iter().find(|claim| claim.locked);
        let locked = locked_claim.is_some();
        let mut candidates: Vec<MergeFieldCandidate> = matched
            .iter()
            .filter_map(|item| {
                let value = candidate_value(&item.detail, field)?;
                if is_empty_value(&value) {
                    return None;
                }
                Some(MergeFieldCandidate {
                    provider: item.info.provider.clone(),
                    provider_name: item.info.provider_name.clone(),
                    source_id: item.info.source_id.clone(),
                    value,
                    priority: priorities
                        .get(*field)
                        .and_then(|entries| entries.get(&item.info.provider))
                        .copied()
                        .unwrap_or(item.info.priority),
                })
            })
            .collect();
        candidates.sort_by_key(|left| left.priority);
        if candidates.is_empty() {
            continue;
        }
        let best_confidence = matched
            .iter()
            .filter(|item| item.info.provider == candidates[0].provider)
            .map(|item| item.info.score)
            .fold(0.0_f64, f64::max);
        let distinct: HashSet<String> = candidates
            .iter()
            .map(|candidate| serde_json::to_string(&candidate.value).unwrap_or_default())
            .collect();
        let differs_from_current = !is_empty_value(&current)
            && candidates
                .iter()
                .any(|candidate| candidate.value != current);
        let default_selected =
            is_empty_value(&current) && !locked && best_confidence >= AUTO_MATCH_SCORE;
        fields.push(MergeFieldState {
            field: field.to_string(),
            label: label.to_string(),
            current,
            locked,
            lock_source: locked_claim.map(|claim| claim.source.clone()),
            candidates,
            default_selected,
            conflict: distinct.len() > 1 || differs_from_current,
        });
    }
    fields
}

fn build_merge_covers(
    matched: &[MatchedDetail],
    priorities: &HashMap<String, HashMap<String, i64>>,
    default_cover: bool,
) -> Vec<MergeCoverCandidate> {
    let mut covers = Vec::new();
    let mut seen = HashSet::new();
    for item in matched {
        let priority = priorities
            .get("cover")
            .and_then(|entries| entries.get(&item.info.provider))
            .copied()
            .unwrap_or(item.info.priority);
        let mut options: Vec<CoverOption> = if item.detail.covers.is_empty() {
            item.detail
                .cover_url
                .iter()
                .map(|url| CoverOption {
                    url: url.clone(),
                    kind: "cover".to_string(),
                    width: None,
                    height: None,
                })
                .collect()
        } else {
            item.detail.covers.clone()
        };
        options.sort_by(|left, right| {
            let left_portrait = left
                .height
                .zip(left.width)
                .is_some_and(|(height, width)| height >= width);
            let right_portrait = right
                .height
                .zip(right.width)
                .is_some_and(|(height, width)| height >= width);
            right_portrait
                .cmp(&left_portrait)
                .then_with(|| cover_area(right).cmp(&cover_area(left)))
        });
        let mut provider_count = 0;
        for cover in options {
            if provider_count >= 4 || covers.len() >= 12 {
                break;
            }
            if !seen.insert(cover.url.clone()) {
                continue;
            }
            provider_count += 1;
            covers.push(MergeCoverCandidate {
                provider: item.info.provider.clone(),
                provider_name: item.info.provider_name.clone(),
                source_id: item.info.source_id.clone(),
                url: cover.url,
                kind: cover.kind,
                priority,
                default_selected: default_cover && covers.is_empty(),
            });
        }
    }
    covers.sort_by_key(|left| left.priority);
    covers
}

fn cover_area(cover: &CoverOption) -> i64 {
    cover
        .width
        .unwrap_or(0)
        .saturating_mul(cover.height.unwrap_or(0))
}

pub async fn merge_apply(
    pool: &SqlitePool,
    data_dir: &Path,
    http: &super::MetadataHttp,
    oauth: &OAuthService,
    request: MergeApplyRequest,
    cancel: &CancellationToken,
) -> Result<MergeApplyResult> {
    if !db::work_exists(pool, request.work_id).await? {
        bail!("作品不存在");
    }
    let claims = store::load_claims(pool, request.work_id).await?;
    let values = store::load_work_field_values(pool, request.work_id).await?;
    let locked_fields: HashSet<String> = claims
        .iter()
        .filter(|claim| claim.locked)
        .map(|claim| claim.field.clone())
        .collect();
    let mut applied = Vec::new();
    let mut skipped_locked = Vec::new();
    let mut skipped_non_empty = Vec::new();
    let mut errors = Vec::new();
    let mut details: HashMap<(String, String), CandidateDetail> = HashMap::new();
    let mut selected_fields = HashSet::new();

    for selection in &request.selections {
        if !selected_fields.insert(selection.field.clone()) {
            errors.push(format!("字段 {} 重复选择", selection.field));
            continue;
        }
        if !FIELD_LABELS
            .iter()
            .any(|(field, _)| *field == selection.field)
        {
            errors.push(format!("未知的元数据字段：{}", selection.field));
            continue;
        }
        if locked_fields.contains(&selection.field) {
            skipped_locked.push(selection.field.clone());
            continue;
        }
        if request.only_if_empty && !is_empty_value(&values.current(&selection.field)) {
            skipped_non_empty.push(selection.field.clone());
            continue;
        }
        let key = (selection.provider.clone(), selection.source_id.clone());
        if !details.contains_key(&key) {
            match candidate_detail(
                pool,
                http,
                oauth,
                &selection.provider,
                &selection.source_id,
                cancel,
            )
            .await
            {
                Ok(detail) => {
                    details.insert(key.clone(), detail);
                }
                Err(error) => {
                    errors.push(format!("{}：{}", selection.provider, error));
                    continue;
                }
            }
        }
        let detail = &details[&key];
        let Some(value) = candidate_value(detail, &selection.field) else {
            continue;
        };
        if is_empty_value(&value) {
            continue;
        }
        let mut tx = pool.begin().await?;
        let result: Result<()> = async {
            store::apply_field(&mut tx, request.work_id, &selection.field, &value).await?;
            store::upsert_claim(
                &mut tx,
                request.work_id,
                &selection.field,
                &selection.provider,
                &selection.source_id,
                &value,
                Some(0.9),
                false,
            )
            .await?;
            store::touch_work(&mut tx, request.work_id).await?;
            tx.commit().await?;
            Ok(())
        }
        .await;
        match result {
            Ok(()) => applied.push(selection.field.clone()),
            Err(error) => errors.push(format!("{}：{}", selection.field, error)),
        }
    }

    let mut cover_applied = false;
    if let Some(selection) = &request.cover {
        if locked_fields.contains("cover") {
            skipped_locked.push("cover".to_string());
        } else if request.only_if_empty && values.cover_source.is_some() {
            skipped_non_empty.push("cover".to_string());
        } else {
            let key = (selection.provider.clone(), selection.source_id.clone());
            if !details.contains_key(&key) {
                match candidate_detail(
                    pool,
                    http,
                    oauth,
                    &selection.provider,
                    &selection.source_id,
                    cancel,
                )
                .await
                {
                    Ok(detail) => {
                        details.insert(key.clone(), detail);
                    }
                    Err(error) => {
                        errors.push(format!("{}：{}", selection.provider, error));
                    }
                }
            }
            if let Some(detail) = details.get(&key) {
                let mut requested_url = selection.url.clone();
                if let Some(candidate) = requested_url.as_deref()
                    && !detail.covers.iter().any(|cover| cover.url == candidate)
                    && detail.cover_url.as_deref() != Some(candidate)
                {
                    errors.push("所选封面不属于该来源".to_string());
                    requested_url = None;
                }
                let url = requested_url.as_deref().or(detail.cover_url.as_deref());
                if let Some(url) = url {
                    match http.download_image(&selection.provider, url, cancel).await {
                        Ok(bytes) => {
                            if let Err(error) = assets::set_cover_bytes(
                                pool,
                                data_dir,
                                request.work_id,
                                &bytes,
                                url,
                                "online",
                            )
                            .await
                            {
                                errors.push(format!("封面：{error}"));
                            } else {
                                let mut connection = pool.acquire().await?;
                                let _ = store::upsert_claim(
                                    &mut connection,
                                    request.work_id,
                                    "cover",
                                    &selection.provider,
                                    &selection.source_id,
                                    &Value::String(url.to_string()),
                                    Some(0.9),
                                    false,
                                )
                                .await;
                                cover_applied = true;
                            }
                        }
                        Err(error) => errors.push(format!("封面：{error}")),
                    }
                }
            }
        }
    }

    Ok(MergeApplyResult {
        applied,
        skipped_locked,
        skipped_non_empty,
        cover_applied,
        errors,
    })
}

pub async fn adopt_claim(
    pool: &SqlitePool,
    data_dir: &Path,
    http: &super::MetadataHttp,
    oauth: &OAuthService,
    work_id: i64,
    claim_id: i64,
    cancel: &CancellationToken,
) -> Result<MergeApplyResult> {
    if !db::work_exists(pool, work_id).await? {
        bail!("作品不存在");
    }
    let claims = store::load_claims(pool, work_id).await?;
    let claim = claims
        .iter()
        .find(|claim| claim.id == claim_id)
        .context("来源记录不存在")?;
    if claim.field == "related" {
        bail!("关联作品不能直接采用为本地字段");
    }
    let selection = MergeSelection {
        field: claim.field.clone(),
        provider: claim.source.clone(),
        source_id: claim.source_id.clone(),
        url: if claim.field == "cover" {
            claim.value.as_str().map(ToOwned::to_owned)
        } else {
            None
        },
    };
    let request = MergeApplyRequest {
        work_id,
        selections: if claim.field == "cover" {
            Vec::new()
        } else {
            vec![selection.clone()]
        },
        cover: if claim.field == "cover" {
            Some(selection)
        } else {
            None
        },
        only_if_empty: false,
    };
    merge_apply(pool, data_dir, http, oauth, request, cancel).await
}

pub fn match_score(values: &WorkFieldValues, candidate: &SearchCandidate) -> f64 {
    let mut titles: Vec<&str> = vec![&values.title, &values.original_title];
    titles.extend(values.aliases.iter().map(String::as_str));
    let mut best = 0.0_f64;
    for query in titles {
        if query.trim().is_empty() {
            continue;
        }
        best = best.max(title_similarity(query, &candidate.title));
        best = best.max(title_similarity(query, &candidate.original_title));
    }
    if let (Some(left), Some(right)) = (values.year, candidate.year)
        && best > 0.0
    {
        best += if left == right { 0.02 } else { -0.02 };
    }
    best.clamp(0.0, 1.0)
}

fn title_similarity(left: &str, right: &str) -> f64 {
    let left = normalize_title(left);
    let right = normalize_title(right);
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    if left == right {
        return 1.0;
    }
    let shorter = left.chars().count().min(right.chars().count());
    if shorter >= 3 && (left.contains(&right) || right.contains(&left)) {
        return 0.9;
    }
    let left_grams = bigrams(&left);
    let right_grams = bigrams(&right);
    if left_grams.is_empty() || right_grams.is_empty() {
        return 0.0;
    }
    let intersection = left_grams.intersection(&right_grams).count();
    let union = left_grams.union(&right_grams).count();
    intersection as f64 / union as f64
}

fn normalize_title(value: &str) -> String {
    value
        .chars()
        .flat_map(|character| character.to_lowercase())
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn bigrams(value: &str) -> HashSet<String> {
    let characters: Vec<char> = value.chars().collect();
    if characters.len() < 2 {
        return characters
            .into_iter()
            .map(|character| character.to_string())
            .collect();
    }
    characters
        .windows(2)
        .map(|window| window.iter().collect())
        .collect()
}

fn round_score(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_memory_pool;
    use sqlx::SqlitePool;

    async fn seed_work(pool: &SqlitePool, title: &str) -> i64 {
        let work_id = sqlx::query("INSERT INTO works (canonical_title) VALUES (?)")
            .bind(title)
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
                     'C:\\Games', ?)",
        )
        .bind(release_id)
        .bind(title)
        .execute(pool)
        .await
        .expect("copy");
        work_id
    }

    #[tokio::test]
    async fn field_priorities_include_new_providers_and_can_be_reordered() {
        let pool = open_memory_pool().await.expect("pool");
        let dir = tempfile::TempDir::new().expect("dir");
        let oauth = OAuthService::new(dir.path()).expect("oauth");
        list_providers(&pool, &oauth).await.expect("providers");
        let states = field_priority_states(&pool, &oauth).await.expect("states");
        let title = states
            .iter()
            .find(|state| state.field == "title")
            .expect("title");
        assert_eq!(title.providers[0].provider, "bangumi");
        let order: Vec<String> = title
            .providers
            .iter()
            .map(|item| item.provider.clone())
            .collect();
        let mut reversed = order.clone();
        reversed.reverse();
        reorder_field_priorities(&pool, &oauth, "title", &reversed)
            .await
            .expect("reorder");
        let states = field_priority_states(&pool, &oauth).await.expect("states");
        let title = states
            .iter()
            .find(|state| state.field == "title")
            .expect("title");
        assert_eq!(title.providers[0].provider, reversed[0]);
        assert!(title.custom);
        assert!(!title.global);
        set_field_priority_global(&pool, true)
            .await
            .expect("global mode");
        let states = field_priority_states(&pool, &oauth).await.expect("states");
        let title = states
            .iter()
            .find(|state| state.field == "title")
            .expect("title");
        assert!(title.global);
        assert_eq!(title.providers[0].provider, "vndb");
        assert!(
            reorder_field_priorities(&pool, &oauth, "title", &["bangumi".to_string()])
                .await
                .is_err()
        );
        set_field_priority_global(&pool, false)
            .await
            .expect("field mode");
        reset_field_priority(&pool, "title").await.expect("reset");
        let states = field_priority_states(&pool, &oauth).await.expect("states");
        let title = states
            .iter()
            .find(|state| state.field == "title")
            .expect("title");
        assert_eq!(title.providers[0].provider, "bangumi");
    }

    #[test]
    fn scores_exact_and_fuzzy_titles() {
        let values = WorkFieldValues {
            title: "月影之锁".to_string(),
            original_title: "月影の鎖 -錯乱パラノイア-".to_string(),
            ..Default::default()
        };
        let exact = SearchCandidate {
            provider: "vndb".to_string(),
            source_id: "v1".to_string(),
            title: "月影之锁".to_string(),
            original_title: "月影の鎖 -錯乱パラノイア-".to_string(),
            year: None,
            developer: None,
            cover_url: None,
            summary: String::new(),
            score: None,
            priority: 0,
        };
        assert!(match_score(&values, &exact) > 0.95);
        let unrelated = SearchCandidate {
            title: "CLANNAD".to_string(),
            original_title: "CLANNAD".to_string(),
            ..exact
        };
        assert!(match_score(&values, &unrelated) < 0.35);
    }

    #[tokio::test]
    async fn merge_apply_skips_locked_fields_and_records_claims() {
        let pool = open_memory_pool().await.expect("pool");
        let work_id = seed_work(&pool, "测试作品").await;
        let dir = tempfile::TempDir::new().expect("dir");
        let oauth = OAuthService::new(dir.path()).expect("oauth");
        list_providers(&pool, &oauth).await.expect("providers");
        let raw = r#"{"results":[{"id":"v1","title":"Test Work","alttitle":"テスト作品","released":"2020-01-02","developers":[{"name":"开发商"}],"description":"简介","aliases":["Test"],"tags":[{"name":"标签","rating":2.0,"spoiler":0}],"titles":[],"relations":[]}]}"#;
        store::cache_put(&pool, "vndb", "detail:vndb:v1", "v1", "detail", raw, 60)
            .await
            .expect("cache");
        store::set_field_lock(
            &pool,
            work_id,
            "description",
            true,
            Value::String("锁定简介".to_string()),
        )
        .await
        .expect("lock");
        let result = merge_apply(
            &pool,
            Path::new("C:\\tmp"),
            &super::super::MetadataHttp::new().expect("http"),
            &oauth,
            MergeApplyRequest {
                work_id,
                selections: vec![
                    MergeSelection {
                        field: "title".to_string(),
                        provider: "vndb".to_string(),
                        source_id: "v1".to_string(),
                        url: None,
                    },
                    MergeSelection {
                        field: "description".to_string(),
                        provider: "vndb".to_string(),
                        source_id: "v1".to_string(),
                        url: None,
                    },
                ],
                cover: None,
                only_if_empty: false,
            },
            &CancellationToken::new(),
        )
        .await
        .expect("apply");
        assert_eq!(result.applied, vec!["title"]);
        assert_eq!(result.skipped_locked, vec!["description"]);
        let values = store::load_work_field_values(&pool, work_id)
            .await
            .expect("values");
        assert_eq!(values.title, "テスト作品");
        assert_eq!(values.description, "");
        let claims = store::load_claims(&pool, work_id).await.expect("claims");
        assert!(
            claims
                .iter()
                .any(|claim| claim.field == "title" && claim.source == "vndb")
        );
    }

    #[tokio::test]
    async fn merge_apply_only_if_empty_preserves_existing_values() {
        let pool = open_memory_pool().await.expect("pool");
        let work_id = seed_work(&pool, "测试作品").await;
        sqlx::query("UPDATE works SET release_year = 1999 WHERE id = ?")
            .bind(work_id)
            .execute(&pool)
            .await
            .expect("year");
        let dir = tempfile::TempDir::new().expect("dir");
        let oauth = OAuthService::new(dir.path()).expect("oauth");
        list_providers(&pool, &oauth).await.expect("providers");
        let raw = r#"{"results":[{"id":"v1","title":"Test Work","alttitle":"テスト作品","released":"2020-01-02","developers":[{"name":"开发商"}],"description":"简介","aliases":[],"tags":[],"titles":[],"relations":[]}]}"#;
        store::cache_put(&pool, "vndb", "detail:vndb:v1", "v1", "detail", raw, 60)
            .await
            .expect("cache");
        let result = merge_apply(
            &pool,
            Path::new("C:\\tmp"),
            &super::super::MetadataHttp::new().expect("http"),
            &oauth,
            MergeApplyRequest {
                work_id,
                selections: vec![MergeSelection {
                    field: "year".to_string(),
                    provider: "vndb".to_string(),
                    source_id: "v1".to_string(),
                    url: None,
                }],
                cover: None,
                only_if_empty: true,
            },
            &CancellationToken::new(),
        )
        .await
        .expect("apply");
        assert_eq!(result.skipped_non_empty, vec!["year"]);
        let values = store::load_work_field_values(&pool, work_id)
            .await
            .expect("values");
        assert_eq!(values.year, Some(1999));
    }
}
