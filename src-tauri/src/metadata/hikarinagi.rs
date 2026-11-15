use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use serde_json::Value;
use tokio_util::sync::CancellationToken;
use url::Url;

use super::http::MetadataHttp;
use super::types::{CandidateDetail, CoverOption, SearchCandidate};
use super::vndb::extract_year;

const PROVIDER_ID: &str = "hikarinagi";
const API_BASE: &str = "https://api.hikarinagi.org/v3";

pub async fn search(
    http: &MetadataHttp,
    query: &str,
    token: Option<&str>,
    cancel: &CancellationToken,
) -> Result<Vec<SearchCandidate>> {
    let token = require_token(token)?;
    let response = http
        .get_json_with_token(
            PROVIDER_ID,
            &search_url(query)?,
            Duration::from_millis(350),
            None,
            Some(token),
            cancel,
        )
        .await
        .map_err(map_request_error)?;
    parse_search(&response.body)
}

fn search_url(query: &str) -> Result<String> {
    let mut url = Url::parse(&format!("{API_BASE}/search")).context("Hikarinagi 地址无效")?;
    url.query_pairs_mut()
        .append_pair("q", query.trim())
        .append_pair("types", "galgame")
        .append_pair("page", "1")
        .append_pair("page_size", "20");
    Ok(url.to_string())
}

pub fn parse_search(raw: &str) -> Result<Vec<SearchCandidate>> {
    let payload = payload(raw)?;
    let items = payload
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut results = Vec::new();
    for item in items {
        if text(&item, "type") != "galgame" {
            continue;
        }
        let Some(source_id) = id_text(item.get("id").unwrap_or(&Value::Null)) else {
            continue;
        };
        let title = text(&item, "title");
        if title.is_empty() {
            continue;
        }
        let date = text(&item, "subtitle");
        results.push(SearchCandidate {
            provider: PROVIDER_ID.to_string(),
            source_id,
            title: title.clone(),
            original_title: title,
            year: extract_year(Some(&date)),
            developer: non_empty(text(&item, "developer")),
            cover_url: item
                .get("cover")
                .and_then(|cover| cover.get("url"))
                .and_then(Value::as_str)
                .and_then(normalize_url),
            summary: String::new(),
            score: None,
            priority: 0,
        });
    }
    Ok(results)
}

pub async fn detail(
    http: &MetadataHttp,
    source_id: &str,
    token: Option<&str>,
    cancel: &CancellationToken,
) -> Result<CandidateDetail> {
    let token = require_token(token)?;
    let response = http
        .get_json_with_token(
            PROVIDER_ID,
            &format!("{API_BASE}/galgames/{source_id}"),
            Duration::from_millis(350),
            None,
            Some(token),
            cancel,
        )
        .await
        .map_err(map_request_error)?;
    let mut work: Value =
        serde_json::from_str(&response.body).context("Hikarinagi 详情响应格式无法识别")?;
    if work.get("data").is_some() {
        work = work.get("data").cloned().unwrap_or(Value::Null);
    }
    if id_text(work.get("id").unwrap_or(&Value::Null)).is_none() {
        anyhow::bail!("Hikarinagi 详情为空");
    }

    let producers = http
        .get_json_with_token(
            PROVIDER_ID,
            &format!("{API_BASE}/galgames/{source_id}/producers"),
            Duration::from_millis(350),
            None,
            Some(token),
            cancel,
        )
        .await
        .ok()
        .and_then(|response| payload(&response.body).ok())
        .unwrap_or(Value::Null);
    if let Some(object) = work.as_object_mut() {
        object.insert("_producers".to_string(), producers);
    }
    let raw_json = serde_json::to_string(&work)?;
    parse_detail(&raw_json)
}

pub fn parse_detail(raw: &str) -> Result<CandidateDetail> {
    let work = payload(raw)?;
    let source_id =
        id_text(work.get("id").unwrap_or(&Value::Null)).context("Hikarinagi 详情缺少 id")?;
    let origin_title = text(&work, "origin_title");
    let translated_title = text(&work, "trans_title");
    let title = if translated_title.is_empty() {
        origin_title.clone()
    } else {
        translated_title
    };
    if title.is_empty() {
        anyhow::bail!("Hikarinagi 详情缺少标题");
    }

    let mut aliases = Vec::new();
    for alias in string_array(work.get("aliases")) {
        push_unique(&mut aliases, &alias);
    }
    aliases.retain(|alias| alias != &title && alias != &origin_title);

    let description = ["trans_intro", "origin_intro", "en_intro"]
        .iter()
        .map(|key| text(&work, key))
        .find(|value| !value.is_empty())
        .unwrap_or_default();

    let mut tags = Vec::new();
    if let Some(items) = work.get("tags").and_then(Value::as_array) {
        for tag in items {
            if tags.len() >= 16 {
                break;
            }
            push_unique(&mut tags, &text(tag, "name"));
        }
    }

    let producers = work
        .get("_producers")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let developer = {
        let value = text(&work, "developer");
        if value.is_empty() {
            producer_names(&producers, "DEVELOPER")
        } else {
            Some(value)
        }
    };
    let publisher = producer_names(&producers, "PUBLISHER");

    let covers = cover_options(&work);
    let cover_url = covers.first().map(|cover| cover.url.clone());
    let release_date = normalize_date(&text(&work, "release_date"));

    let original_title = if origin_title.is_empty() {
        let english = text(&work, "en_title");
        if english.is_empty() {
            title.clone()
        } else {
            english
        }
    } else {
        origin_title
    };

    Ok(CandidateDetail {
        provider: PROVIDER_ID.to_string(),
        source_id,
        title,
        original_title,
        aliases,
        description,
        release_date: release_date.clone(),
        year: extract_year(release_date.as_deref()),
        developer,
        publisher,
        tags,
        cover_url,
        covers,
        related: Vec::new(),
        raw_json: raw.to_string(),
    })
}

fn require_token(token: Option<&str>) -> Result<&str> {
    token
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .context("Hikarinagi 需要授权。请先在设置 → 账号连接中登录，或配置应用 clientSecret。")
}

fn map_request_error(error: anyhow::Error) -> anyhow::Error {
    let message = error.to_string();
    if message.contains("401") || message.contains("403") {
        anyhow!("Hikarinagi 授权已失效或权限不足，请重新连接账号，或确认应用拥有 catalog:read。")
    } else {
        error
    }
}

fn payload(raw: &str) -> Result<Value> {
    let value: Value = serde_json::from_str(raw).context("Hikarinagi 响应格式无法识别")?;
    Ok(value.get("data").cloned().unwrap_or(value))
}

fn id_text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => non_empty(value.trim().to_string()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string()
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn producer_names(producers: &[Value], role: &str) -> Option<String> {
    let mut names = Vec::new();
    for producer in producers {
        if text(producer, "role") != role {
            continue;
        }
        let Some(entity) = producer.get("producer") else {
            continue;
        };
        let name = {
            let translated = text(entity, "trans_name");
            if translated.is_empty() {
                text(entity, "name")
            } else {
                translated
            }
        };
        push_unique(&mut names, &name);
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

fn normalize_url(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if value.starts_with("https://") || value.starts_with("http://") {
        Some(value.to_string())
    } else if value.starts_with('/') {
        Some(format!("https://www.hikarinagi.org{value}"))
    } else {
        Some(format!("https://www.hikarinagi.org/{value}"))
    }
}

fn cover_options(work: &Value) -> Vec<CoverOption> {
    let mut options = Vec::new();
    if let Some(covers) = work.get("covers").and_then(Value::as_array) {
        for cover in covers {
            let Some(url) = cover
                .get("url")
                .and_then(Value::as_str)
                .and_then(normalize_url)
            else {
                continue;
            };
            if options.iter().any(|option: &CoverOption| option.url == url) {
                continue;
            }
            options.push(CoverOption {
                url,
                kind: "cover".to_string(),
                width: cover.get("width").and_then(Value::as_i64),
                height: cover.get("height").and_then(Value::as_i64),
            });
        }
    }
    options
}

fn normalize_date(value: &str) -> Option<String> {
    let value = value.trim().split('T').next()?.trim();
    if value.len() == 10 {
        Some(value.to_string())
    } else {
        None
    }
}

fn non_empty(value: String) -> Option<String> {
    if value.is_empty() { None } else { Some(value) }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_search_fixture() {
        let body = r#"
        {
          "items": [{
            "id": 42,
            "type": "galgame",
            "title": "CLANNAD",
            "subtitle": "2004-04-28",
            "developer": "Key",
            "cover": {"url": "/images/clannad.webp"}
          }],
          "meta": {"page": 1, "page_size": 20, "total_items": 1, "total_pages": 1}
        }
        "#;
        let items = parse_search(body).expect("search");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].source_id, "42");
        assert_eq!(items[0].title, "CLANNAD");
        assert_eq!(items[0].year, Some(2004));
        assert_eq!(items[0].developer.as_deref(), Some("Key"));
        assert_eq!(
            items[0].cover_url.as_deref(),
            Some("https://www.hikarinagi.org/images/clannad.webp")
        );
    }

    #[test]
    fn maps_detail_and_publisher() {
        let body = r#"
        {
          "id": 42,
          "origin_title": "クラナド",
          "trans_title": "CLANNAD",
          "origin_intro": "原文简介",
          "trans_intro": "中文简介",
          "en_intro": "English intro",
          "aliases": ["CLANNAD", "团子大家族"],
          "developer": "Key",
          "release_date": "2004-04-28T00:00:00.000Z",
          "tags": [{"name": "家族"}, {"name": "恋爱"}],
          "covers": [{"url": "https://img.example/clannad.webp"}],
          "_producers": [
            {"role": "PUBLISHER", "producer": {"name": "Visual Arts"}},
            {"role": "DEVELOPER", "producer": {"name": "Key"}}
          ]
        }
        "#;
        let detail = parse_detail(body).expect("detail");
        assert_eq!(detail.source_id, "42");
        assert_eq!(detail.title, "CLANNAD");
        assert_eq!(detail.original_title, "クラナド");
        assert_eq!(detail.description, "中文简介");
        assert_eq!(detail.aliases, vec!["团子大家族"]);
        assert_eq!(detail.developer.as_deref(), Some("Key"));
        assert_eq!(detail.publisher.as_deref(), Some("Visual Arts"));
        assert_eq!(detail.tags, vec!["家族", "恋爱"]);
        assert_eq!(detail.release_date.as_deref(), Some("2004-04-28"));
    }
}
