use std::collections::HashMap;
use std::time::Duration;

use anyhow::{Context, Result};
use serde::Deserialize;
use tokio_util::sync::CancellationToken;
use url::Url;

use super::http::MetadataHttp;
use super::types::{CandidateDetail, CoverOption, RelatedWork, SearchCandidate};
use super::vndb::extract_year;

const PROVIDER_ID: &str = "nextmoe";
const API_BASE: &str = "https://api.nextmoe.dev/v2/catalog/works";

#[derive(Debug, Default, Deserialize)]
struct NextMoeList {
    #[serde(default)]
    items: Vec<NextMoeWork>,
}

#[derive(Debug, Default, Deserialize)]
struct NextMoeWork {
    #[serde(default)]
    id: String,
    #[serde(default)]
    medium: String,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    latin: Option<String>,
    #[serde(default)]
    localized: HashMap<String, NextMoeLocalized>,
    #[serde(default)]
    release_date: Option<String>,
    #[serde(default)]
    cover: Option<NextMoeCover>,
    #[serde(default)]
    titles: Vec<NextMoeTitle>,
    #[serde(default)]
    intros: Vec<NextMoeIntro>,
    #[serde(default)]
    companies: Vec<NextMoeCompany>,
    #[serde(default)]
    tags: Vec<NextMoeTag>,
    #[serde(default)]
    covers: Vec<NextMoeCover>,
    #[serde(default)]
    relations: Vec<NextMoeRelation>,
}

#[derive(Debug, Default, Deserialize)]
struct NextMoeLocalized {
    #[serde(default)]
    value: String,
}

#[derive(Debug, Default, Deserialize)]
struct NextMoeCover {
    #[serde(default)]
    url: String,
    #[serde(default)]
    width: Option<i64>,
    #[serde(default)]
    height: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
struct NextMoeTitle {
    #[serde(default)]
    title: String,
    #[serde(default)]
    title_kind: String,
    #[serde(default)]
    is_machine: bool,
}

#[derive(Debug, Default, Deserialize)]
struct NextMoeIntro {
    #[serde(default)]
    lang: String,
    #[serde(default)]
    value: String,
    #[serde(default)]
    is_machine: bool,
}

#[derive(Debug, Default, Deserialize)]
struct NextMoeCompany {
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    attribution_role: String,
}

#[derive(Debug, Default, Deserialize)]
struct NextMoeTag {
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    tier: Option<String>,
    #[serde(default)]
    tag_kind: Option<String>,
    #[serde(default)]
    spoiler: Option<String>,
    #[serde(default)]
    is_sexual: bool,
    #[serde(default)]
    work_count: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
struct NextMoeRelation {
    #[serde(default)]
    relation_type: String,
    #[serde(default)]
    phrase: String,
    #[serde(default)]
    work: Option<NextMoeWork>,
}

pub async fn search(
    http: &MetadataHttp,
    query: &str,
    cancel: &CancellationToken,
) -> Result<Vec<SearchCandidate>> {
    let response = http
        .get_json(
            PROVIDER_ID,
            &search_url(query)?,
            Duration::from_millis(500),
            None,
            cancel,
        )
        .await?;
    parse_search(&response.body)
}

fn search_url(query: &str) -> Result<String> {
    let mut url = Url::parse(API_BASE).context("Kungal Catalog 地址无效")?;
    url.query_pairs_mut()
        .append_pair("q", query.trim())
        .append_pair("include", "titles,intros,covers,companies")
        .append_pair("limit", "20")
        .append_pair("nsfw", "true");
    Ok(url.to_string())
}

pub fn parse_search(raw: &str) -> Result<Vec<SearchCandidate>> {
    let parsed: NextMoeList = serde_json::from_str(raw).context("Kungal 搜索响应格式无法识别")?;
    Ok(parsed
        .items
        .into_iter()
        .filter(|work| !work.id.trim().is_empty())
        .map(|work| {
            let title = preferred_title(&work);
            let original_title = original_title(&work, &title);
            let description = choose_intro(&work.intros);
            SearchCandidate {
                provider: PROVIDER_ID.to_string(),
                source_id: work.id.clone(),
                title,
                original_title,
                year: extract_year(work.release_date.as_deref()),
                developer: developer_name(&work.companies),
                cover_url: cover_url(&work),
                summary: truncate(&description, 180),
                score: None,
                priority: 0,
            }
        })
        .collect())
}

pub async fn detail(
    http: &MetadataHttp,
    source_id: &str,
    cancel: &CancellationToken,
) -> Result<CandidateDetail> {
    let url = format!("{API_BASE}/{source_id}?view=full&nsfw=true");
    let response = http
        .get_json(PROVIDER_ID, &url, Duration::from_millis(500), None, cancel)
        .await?;
    parse_detail(&response.body)
}

pub fn parse_detail(raw: &str) -> Result<CandidateDetail> {
    let work: NextMoeWork = serde_json::from_str(raw).context("Kungal 详情响应格式无法识别")?;
    if work.id.trim().is_empty() {
        anyhow::bail!("Kungal 详情为空");
    }
    Ok(map_detail(work, raw.to_string()))
}

fn map_detail(work: NextMoeWork, raw_json: String) -> CandidateDetail {
    let title = preferred_title(&work);
    let original_title = original_title(&work, &title);
    let mut aliases = Vec::new();
    for localized in work.localized.values() {
        for part in split_title(&localized.value) {
            push_unique(&mut aliases, &part);
        }
    }
    for entry in &work.titles {
        if entry.is_machine {
            continue;
        }
        if entry.title_kind == "alias" {
            push_unique(&mut aliases, &entry.title);
        }
        if !entry.title.trim().is_empty() && entry.title != title && entry.title != original_title {
            push_unique(&mut aliases, &entry.title);
        }
    }
    aliases.retain(|value| value != &title && value != &original_title);

    let mut tags = work
        .tags
        .iter()
        .filter(|tag| {
            tag.tag_kind.as_deref() == Some("content")
                && tag
                    .spoiler
                    .as_deref()
                    .is_none_or(|spoiler| spoiler == "none")
                && !tag.is_sexual
        })
        .collect::<Vec<_>>();
    tags.sort_by(|left, right| {
        tag_rank(left).cmp(&tag_rank(right)).then_with(|| {
            right
                .work_count
                .unwrap_or(0)
                .cmp(&left.work_count.unwrap_or(0))
        })
    });
    let mut tag_names = Vec::new();
    for tag in tags {
        if tag_names.len() >= 12 {
            break;
        }
        push_unique(&mut tag_names, &tag.display_name);
    }

    let related = work
        .relations
        .iter()
        .filter(|relation| {
            relation
                .work
                .as_ref()
                .is_some_and(|work| work.medium == "galgame" && !work.id.trim().is_empty())
        })
        .take(12)
        .filter_map(|relation| {
            let related_work = relation.work.as_ref()?;
            Some(RelatedWork {
                source_id: related_work.id.clone(),
                relation: if relation.phrase.trim().is_empty() {
                    relation.relation_type.clone()
                } else {
                    relation.phrase.clone()
                },
                title: preferred_title(related_work),
            })
        })
        .collect();

    CandidateDetail {
        provider: PROVIDER_ID.to_string(),
        source_id: work.id.clone(),
        title,
        original_title,
        aliases,
        description: choose_intro(&work.intros),
        release_date: normalize_date(work.release_date.as_deref()),
        year: extract_year(work.release_date.as_deref()),
        developer: developer_name(&work.companies),
        publisher: publisher_name(&work.companies),
        tags: tag_names,
        cover_url: cover_url(&work),
        covers: cover_options(&work),
        related,
        raw_json,
    }
}

fn preferred_title(work: &NextMoeWork) -> String {
    for lang in ["zh-Hans", "zh-CN", "zh", "zh-Hant", "en"] {
        if let Some(value) = work.localized.get(lang)
            && let Some(title) = split_title(&value.value).into_iter().next()
        {
            return title;
        }
    }
    let display = work.display_name.trim();
    if !display.is_empty() {
        return display.to_string();
    }
    work.titles
        .iter()
        .find(|entry| !entry.title.trim().is_empty())
        .map(|entry| entry.title.trim().to_string())
        .unwrap_or_default()
}

fn original_title(work: &NextMoeWork, title: &str) -> String {
    let display = work.display_name.trim();
    if !display.is_empty() {
        return display.to_string();
    }
    if let Some(latin) = work
        .latin
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        return latin.to_string();
    }
    title.to_string()
}

fn split_title(value: &str) -> Vec<String> {
    value
        .replace('｜', "|")
        .split('|')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn choose_intro(intros: &[NextMoeIntro]) -> String {
    for lang in ["zh-Hans", "zh-CN", "zh", "zh-Hant", "en", "ja"] {
        let mut candidates = intros
            .iter()
            .filter(|intro| intro.lang == lang && !intro.value.trim().is_empty());
        if let Some(intro) = candidates.find(|intro| !intro.is_machine) {
            return intro.value.trim().to_string();
        }
        if let Some(intro) = intros
            .iter()
            .find(|intro| intro.lang == lang && !intro.value.trim().is_empty())
        {
            return intro.value.trim().to_string();
        }
    }
    intros
        .iter()
        .find(|intro| !intro.value.trim().is_empty())
        .map(|intro| intro.value.trim().to_string())
        .unwrap_or_default()
}

fn developer_name(companies: &[NextMoeCompany]) -> Option<String> {
    companies
        .iter()
        .find(|company| company.attribution_role == "developer")
        .map(|company| company.display_name.trim())
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            companies
                .iter()
                .find(|company| company.attribution_role == "publisher")
                .map(|company| company.display_name.trim())
                .filter(|name| !name.is_empty())
                .map(ToOwned::to_owned)
        })
}

fn publisher_name(companies: &[NextMoeCompany]) -> Option<String> {
    let mut names = Vec::new();
    for company in companies
        .iter()
        .filter(|company| company.attribution_role == "publisher")
    {
        push_unique(&mut names, &company.display_name);
        if names.len() >= 3 {
            break;
        }
    }
    if names.is_empty() {
        None
    } else {
        Some(names.join(" / "))
    }
}

fn cover_url(work: &NextMoeWork) -> Option<String> {
    work.cover
        .as_ref()
        .map(|cover| cover.url.trim())
        .filter(|url| !url.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            work.covers
                .iter()
                .map(|cover| cover.url.trim())
                .find(|url| !url.is_empty())
                .map(ToOwned::to_owned)
        })
}

fn cover_options(work: &NextMoeWork) -> Vec<CoverOption> {
    let mut options = Vec::new();
    for cover in work.cover.iter().chain(work.covers.iter()) {
        let url = cover.url.trim();
        if url.is_empty() || options.iter().any(|option: &CoverOption| option.url == url) {
            continue;
        }
        options.push(CoverOption {
            url: url.to_string(),
            kind: "cover".to_string(),
            width: cover.width,
            height: cover.height,
        });
    }
    options
}

fn normalize_date(value: Option<&str>) -> Option<String> {
    let date = value?.trim().split('T').next()?.trim();
    if date.len() == 10 {
        Some(date.to_string())
    } else {
        None
    }
}

fn tag_rank(tag: &NextMoeTag) -> i64 {
    match tag.tier.as_deref() {
        Some("core") => 0,
        Some("longtail") => 1,
        _ => 2,
    }
}

fn push_unique(values: &mut Vec<String>, value: &str) {
    let value = value.trim();
    if !value.is_empty()
        && !values
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(value))
    {
        values.push(value.to_string());
    }
}

fn truncate(value: &str, limit: usize) -> String {
    let cleaned = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.chars().count() <= limit {
        return cleaned;
    }
    let mut result = cleaned.chars().take(limit).collect::<String>();
    result.push('…');
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_search_fixture() {
        let body = r#"
        {
          "object": "list",
          "items": [{
            "object": "work",
            "id": "86",
            "medium": "galgame",
            "display_name": "クラナド",
            "localized": {"zh-Hans": {"value": "CLANNAD | 克兰纳德"}},
            "release_date": "2004-04-28",
            "cover": {"url": "https://image.example/clannad.webp"},
            "titles": [{"lang": "zh-Hans", "title": "CLANNAD | 克兰纳德", "title_kind": "official", "is_machine": false}],
            "intros": [{"lang": "zh-Hans", "value": "季节是春天，故事从学园日常开始。", "is_machine": false}],
            "companies": [{"display_name": "Key", "attribution_role": "developer"}]
          }]
        }
        "#;
        let items = parse_search(body).expect("search");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].source_id, "86");
        assert_eq!(items[0].title, "CLANNAD");
        assert_eq!(items[0].original_title, "クラナド");
        assert_eq!(items[0].year, Some(2004));
        assert_eq!(items[0].developer.as_deref(), Some("Key"));
    }

    #[test]
    fn maps_detail_with_companies_tags_and_relations() {
        let body = r#"
        {
          "object": "work",
          "id": "86",
          "medium": "galgame",
          "display_name": "クラナド",
          "localized": {"zh-Hans": {"value": "CLANNAD | 克兰纳德"}},
          "release_date": "2004-04-28",
          "cover": {"url": "https://image.example/clannad.webp"},
          "titles": [
            {"lang": "zh-Hans", "title": "CLANNAD | 克兰纳德", "title_kind": "official", "is_machine": false},
            {"lang": "", "title": "团子大家族", "title_kind": "alias", "is_machine": false}
          ],
          "intros": [
            {"lang": "en", "value": "English intro", "is_machine": false},
            {"lang": "zh-Hans", "value": "中文简介", "is_machine": true}
          ],
          "companies": [
            {"display_name": "Key", "attribution_role": "developer"},
            {"display_name": "Limited Run Games", "attribution_role": "publisher"}
          ],
          "tags": [
            {"display_name": "家族", "tier": "core", "tag_kind": "content", "spoiler": "none", "is_sexual": false, "work_count": 32},
            {"display_name": "恋爱", "tier": "core", "tag_kind": "content", "spoiler": "none", "is_sexual": false, "work_count": 366},
            {"display_name": "ADV", "tier": "hidden", "tag_kind": "meta", "spoiler": "none", "is_sexual": false, "work_count": 1263}
          ],
          "relations": [{
            "relation_type": "shares_character",
            "phrase": "角色出演",
            "work": {"id": "215115", "medium": "galgame", "display_name": "ai sp@ce", "localized": {}}
          }]
        }
        "#;
        let detail = parse_detail(body).expect("detail");
        assert_eq!(detail.title, "CLANNAD");
        assert_eq!(detail.original_title, "クラナド");
        assert!(detail.aliases.contains(&"克兰纳德".to_string()));
        assert!(detail.aliases.contains(&"团子大家族".to_string()));
        assert_eq!(detail.description, "中文简介");
        assert_eq!(detail.developer.as_deref(), Some("Key"));
        assert_eq!(detail.publisher.as_deref(), Some("Limited Run Games"));
        assert_eq!(detail.tags, vec!["恋爱", "家族"]);
        assert_eq!(detail.related[0].source_id, "215115");
        assert_eq!(detail.related[0].relation, "角色出演");
    }
}
