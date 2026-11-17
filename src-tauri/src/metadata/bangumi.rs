use std::time::Duration;

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

use super::http::MetadataHttp;
use super::types::{CandidateDetail, CoverOption, SearchCandidate};
use super::vndb::extract_year;

const PROVIDER_ID: &str = "bangumi";
const SEARCH_URL: &str = "https://api.bgm.tv/v0/search/subjects?limit=20&offset=0";
const DETAIL_URL: &str = "https://api.bgm.tv/v0/subjects/";

#[derive(Debug, Deserialize)]
struct BgmSearchResponse {
    #[serde(default)]
    data: Vec<BgmSubject>,
}

#[derive(Debug, Default, Deserialize)]
struct BgmSubject {
    id: i64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    name_cn: String,
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    images: Option<BgmImages>,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    infobox: Vec<BgmInfo>,
    #[serde(default)]
    tags: Vec<BgmTag>,
    #[serde(default)]
    rating: Option<BgmRating>,
}

#[derive(Debug, Default, Deserialize)]
struct BgmImages {
    #[serde(default)]
    large: String,
    #[serde(default)]
    common: String,
    #[serde(default)]
    medium: String,
}

#[derive(Debug, Default, Deserialize)]
struct BgmInfo {
    #[serde(default)]
    key: String,
    #[serde(default)]
    value: Value,
}

#[derive(Debug, Default, Deserialize)]
struct BgmTag {
    #[serde(default)]
    name: String,
    #[serde(default)]
    count: i64,
}

#[derive(Debug, Default, Deserialize)]
struct BgmRating {
    #[serde(default)]
    score: f64,
}

pub async fn search(
    http: &MetadataHttp,
    query: &str,
    cancel: &CancellationToken,
) -> Result<Vec<SearchCandidate>> {
    let payload = json!({
        "keyword": query,
        "filter": { "type": [4] }
    });
    let response = http
        .post_json(
            PROVIDER_ID,
            SEARCH_URL,
            Duration::from_millis(700),
            &payload,
            cancel,
        )
        .await?;
    parse_search(&response.body)
}

pub fn parse_search(raw: &str) -> Result<Vec<SearchCandidate>> {
    let parsed: BgmSearchResponse =
        serde_json::from_str(raw).context("Bangumi 搜索响应格式无法识别")?;
    Ok(parsed
        .data
        .into_iter()
        .map(|subject| {
            let title = display_title(&subject);
            SearchCandidate {
                provider: PROVIDER_ID.to_string(),
                source_id: subject.id.to_string(),
                title,
                original_title: subject.name.clone(),
                year: extract_year(subject.date.as_deref()),
                developer: info_text(&subject.infobox, &["开发", "开发商"]),
                cover_url: cover_url(&subject.images),
                summary: truncate(&subject.summary, 180),
                score: subject.rating.map(|rating| rating.score),
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
    let url = format!("{DETAIL_URL}{source_id}");
    let response = http
        .get_json(PROVIDER_ID, &url, Duration::from_millis(700), None, cancel)
        .await?;
    parse_detail(&response.body)
}

pub async fn score(
    http: &MetadataHttp,
    source_id: &str,
    cancel: &CancellationToken,
) -> Result<Option<f64>> {
    let url = format!("{DETAIL_URL}{source_id}");
    let response = http
        .get_json(PROVIDER_ID, &url, Duration::from_millis(700), None, cancel)
        .await?;
    parse_score(&response.body)
}

pub fn parse_score(raw: &str) -> Result<Option<f64>> {
    let subject: BgmSubject = serde_json::from_str(raw).context("Bangumi 详情响应格式无法识别")?;
    Ok(subject
        .rating
        .map(|rating| rating.score)
        .filter(|score| *score > 0.0))
}

pub fn parse_detail(raw: &str) -> Result<CandidateDetail> {
    let subject: BgmSubject = serde_json::from_str(raw).context("Bangumi 详情响应格式无法识别")?;
    Ok(map_detail(subject, raw.to_string()))
}

fn map_detail(subject: BgmSubject, raw_json: String) -> CandidateDetail {
    let title = display_title(&subject);
    let original_title = subject.name.clone();
    let mut aliases = Vec::new();
    for key in ["别名", "中文名", "英文名", "日文名"] {
        if let Some(value) = info_text(&subject.infobox, &[key]) {
            for entry in value.split(['/', '、', ';', '；']) {
                push_unique(&mut aliases, entry);
            }
        }
    }
    if subject.name_cn != title {
        push_unique(&mut aliases, &subject.name_cn);
    }
    if subject.name != title {
        push_unique(&mut aliases, &subject.name);
    }

    let mut tags = subject.tags;
    tags.sort_by_key(|tag| std::cmp::Reverse(tag.count));
    let tags = tags
        .into_iter()
        .map(|tag| tag.name)
        .filter(|name| !name.trim().is_empty())
        .take(12)
        .collect::<Vec<_>>();

    let cover_url = cover_url(&subject.images);
    let covers = cover_url
        .iter()
        .map(|url| CoverOption {
            url: url.clone(),
            kind: "cover".to_string(),
            width: None,
            height: None,
        })
        .collect();

    CandidateDetail {
        provider: PROVIDER_ID.to_string(),
        source_id: subject.id.to_string(),
        title,
        original_title,
        aliases,
        description: subject.summary,
        release_date: subject
            .date
            .as_deref()
            .filter(|value| value.len() == 10)
            .map(ToOwned::to_owned),
        year: extract_year(subject.date.as_deref()),
        developer: info_text(&subject.infobox, &["开发", "开发商"]),
        publisher: info_text(&subject.infobox, &["发行", "发行商"]),
        tags,
        cover_url,
        covers,
        related: Vec::new(),
        raw_json,
    }
}

fn display_title(subject: &BgmSubject) -> String {
    if subject.name_cn.trim().is_empty() {
        subject.name.clone()
    } else {
        subject.name_cn.clone()
    }
}

fn cover_url(images: &Option<BgmImages>) -> Option<String> {
    let images = images.as_ref()?;
    for value in [&images.large, &images.common, &images.medium] {
        if !value.trim().is_empty() {
            return Some(value.clone());
        }
    }
    None
}

fn info_text(infobox: &[BgmInfo], keys: &[&str]) -> Option<String> {
    for info in infobox {
        if keys.iter().any(|key| info.key.eq_ignore_ascii_case(key)) {
            let value = info_value(&info.value);
            if !value.is_empty() {
                return Some(value);
            }
        }
    }
    None
}

fn info_value(value: &Value) -> String {
    match value {
        Value::String(value) => value.trim().to_string(),
        Value::Array(values) => values
            .iter()
            .map(info_value)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(" / "),
        Value::Object(map) => map
            .get("v")
            .map(info_value)
            .filter(|value| !value.is_empty())
            .unwrap_or_default(),
        Value::Number(number) => number.to_string(),
        _ => String::new(),
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
    fn maps_bangumi_infobox_objects_and_arrays() {
        assert_eq!(info_value(&json!({"v": "PC"})), "PC");
        assert_eq!(info_value(&json!([{"v": "PC"}, "PSP"])), "PC / PSP");
    }

    #[test]
    fn parses_search_fixture() {
        let body = r#"
        {"data":[{"id":50756,"name":"月影の鎖 - 錯乱パラノイア -","name_cn":"月影之锁 错乱偏执狂","date":"2013-04-18","images":{"large":"https://lain.bgm.tv/pic/cover/l/c2/38/50756_0Akzl.jpg"},"summary":"summary","infobox":[{"key":"开发","value":"TAKUYO"}],"tags":[{"name":"乙女向","count":70}],"rating":{"score":7.1}}]}
        "#;
        let parsed: BgmSearchResponse = serde_json::from_str(body).expect("fixture");
        let subject = parsed.data.into_iter().next().expect("subject");
        assert_eq!(display_title(&subject), "月影之锁 错乱偏执狂");
        assert_eq!(extract_year(subject.date.as_deref()), Some(2013));
        assert_eq!(
            info_text(&subject.infobox, &["开发"]).as_deref(),
            Some("TAKUYO")
        );
    }

    #[test]
    fn parses_source_score_and_ignores_zero() {
        assert_eq!(
            parse_score(r#"{"id":402654,"rating":{"score":7.1}}"#).expect("score"),
            Some(7.1)
        );
        assert_eq!(
            parse_score(r#"{"id":402654,"rating":{"score":0}}"#).expect("zero"),
            None
        );
        assert_eq!(parse_score(r#"{"id":402654}"#).expect("missing"), None);
    }

    #[tokio::test]
    #[ignore = "live Bangumi score API"]
    async fn live_fetches_source_score() {
        let http = MetadataHttp::new().expect("http client");
        let score = score(&http, "402654", &CancellationToken::new())
            .await
            .expect("source score");
        assert!(score.is_some_and(|value| value > 0.0));
    }
}
