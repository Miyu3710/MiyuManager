use std::collections::HashMap;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

use super::http::MetadataHttp;
use super::types::{CandidateDetail, CoverOption, SearchCandidate};
use super::vndb::extract_year;

const PROVIDER_ID: &str = "steam";
const SEARCH_URL: &str = "https://store.steampowered.com/api/storesearch/";
const DETAIL_URL: &str = "https://store.steampowered.com/api/appdetails";
const COVER_BASE: &str = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

#[derive(Debug, Deserialize)]
struct SteamSearchResponse {
    #[serde(default)]
    items: Vec<SteamSearchItem>,
}

#[derive(Debug, Default, Deserialize)]
struct SteamSearchItem {
    #[serde(default)]
    id: i64,
    #[serde(default)]
    name: String,
    #[serde(rename = "type", default)]
    kind: Option<String>,
    #[serde(default)]
    tiny_image: Option<String>,
    #[serde(default)]
    platforms: Option<SteamPlatforms>,
}

#[derive(Debug, Default, Deserialize)]
struct SteamPlatforms {
    #[serde(default)]
    windows: bool,
}

#[derive(Debug, Deserialize)]
struct AppDetailsEnvelope {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    data: Option<SteamApp>,
}

#[derive(Debug, Default, Deserialize)]
struct SteamApp {
    #[serde(rename = "type", default)]
    kind: Option<String>,
    #[serde(default)]
    name: String,
    #[serde(default)]
    steam_appid: i64,
    #[serde(default)]
    short_description: String,
    #[serde(default)]
    detailed_description: String,
    #[serde(default)]
    about_the_game: String,
    #[serde(default)]
    header_image: String,
    #[serde(default)]
    capsule_image: String,
    #[serde(default)]
    developers: Vec<String>,
    #[serde(default)]
    publishers: Vec<String>,
    #[serde(default)]
    genres: Vec<SteamLabel>,
    #[serde(default)]
    categories: Vec<SteamLabel>,
    #[serde(default)]
    release_date: Option<SteamReleaseDate>,
}

#[derive(Debug, Default, Deserialize)]
struct SteamLabel {
    #[serde(default)]
    description: String,
}

#[derive(Debug, Default, Deserialize)]
struct SteamReleaseDate {
    #[serde(default)]
    date: String,
    #[serde(default)]
    coming_soon: bool,
}

pub async fn search(
    http: &MetadataHttp,
    query: &str,
    cancel: &CancellationToken,
) -> Result<Vec<SearchCandidate>> {
    let query = query.trim();
    if query.is_empty() {
        bail!("Steam 搜索词不能为空");
    }
    if let Some(app_id) = extract_app_id(query) {
        let detail = detail(http, &app_id.to_string(), cancel).await?;
        return Ok(vec![candidate_from_detail(&detail)]);
    }

    let encoded: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
    let url = format!("{SEARCH_URL}?term={encoded}&l=schinese&cc=CN");
    let response = http
        .get_json(PROVIDER_ID, &url, Duration::from_millis(1100), None, cancel)
        .await?;
    parse_search(&response.body)
}

pub fn parse_search(raw: &str) -> Result<Vec<SearchCandidate>> {
    let parsed: SteamSearchResponse =
        serde_json::from_str(raw).context("Steam 搜索响应格式无法识别")?;
    Ok(parsed
        .items
        .into_iter()
        .filter(|item| item.id > 0 && !item.name.trim().is_empty())
        .filter(|item| item.kind.as_deref().is_none_or(|kind| kind == "app"))
        .filter(|item| {
            item.platforms
                .as_ref()
                .is_none_or(|platforms| platforms.windows)
        })
        .filter(|item| !looks_like_addon(&item.name))
        .map(|item| SearchCandidate {
            provider: PROVIDER_ID.to_string(),
            source_id: item.id.to_string(),
            title: item.name.clone(),
            original_title: item.name,
            year: None,
            developer: None,
            cover_url: item.tiny_image,
            summary: String::new(),
            score: None,
            priority: 0,
        })
        .collect())
}

pub async fn detail(
    http: &MetadataHttp,
    source_id: &str,
    cancel: &CancellationToken,
) -> Result<CandidateDetail> {
    let app_id = normalize_app_id(source_id)?;
    let url = format!("{DETAIL_URL}?appids={app_id}&l=schinese&cc=CN");
    let response = http
        .get_json(PROVIDER_ID, &url, Duration::from_millis(1100), None, cancel)
        .await?;
    parse_detail(&response.body).with_context(|| format!("Steam 没有返回 {app_id}"))
}

pub fn parse_detail(raw: &str) -> Result<CandidateDetail> {
    let parsed: HashMap<String, AppDetailsEnvelope> =
        serde_json::from_str(raw).context("Steam 详情响应格式无法识别")?;
    let envelope = parsed
        .into_values()
        .find(|entry| entry.success)
        .context("Steam 详情为空")?;
    let app = envelope.data.context("Steam 详情为空")?;
    if app.kind.as_deref() != Some("game") {
        bail!("Steam 条目不是游戏");
    }
    Ok(map_detail(app, raw.to_string()))
}

fn map_detail(app: SteamApp, raw_json: String) -> CandidateDetail {
    let app_id = app.steam_appid;
    let release_date = app
        .release_date
        .as_ref()
        .filter(|date| !date.coming_soon)
        .and_then(|date| parse_release_date(&date.date));
    let year = release_date
        .as_deref()
        .and_then(|value| extract_year(Some(value)));

    let detailed = clean_html(&app.detailed_description);
    let about = clean_html(&app.about_the_game);
    let short = clean_html(&app.short_description);
    let description = if detailed.chars().count() >= 40 {
        detailed
    } else if about.chars().count() >= 40 {
        about
    } else if !short.is_empty() {
        short
    } else {
        about
    };

    let mut tags = Vec::new();
    for label in app.genres.into_iter().chain(app.categories) {
        push_unique(&mut tags, &label.description);
        if tags.len() >= 12 {
            break;
        }
    }

    let mut covers = Vec::new();
    if app_id > 0 {
        covers.push(CoverOption {
            url: format!("{COVER_BASE}/{app_id}/library_600x900.jpg"),
            kind: "cover".to_string(),
            width: Some(600),
            height: Some(900),
        });
    }
    if !app.header_image.trim().is_empty() {
        covers.push(CoverOption {
            url: app.header_image.clone(),
            kind: "header".to_string(),
            width: Some(460),
            height: Some(215),
        });
    }
    if !app.capsule_image.trim().is_empty() {
        covers.push(CoverOption {
            url: app.capsule_image.clone(),
            kind: "capsule".to_string(),
            width: Some(231),
            height: Some(87),
        });
    }
    dedupe_covers(&mut covers);
    let cover_url = covers.first().map(|cover| cover.url.clone());

    CandidateDetail {
        provider: PROVIDER_ID.to_string(),
        source_id: app_id.to_string(),
        title: app.name.clone(),
        original_title: app.name,
        aliases: Vec::new(),
        description,
        release_date,
        year,
        developer: app.developers.first().cloned(),
        publisher: app.publishers.first().cloned(),
        tags,
        cover_url,
        covers,
        related: Vec::new(),
        raw_json,
    }
}

fn candidate_from_detail(detail: &CandidateDetail) -> SearchCandidate {
    SearchCandidate {
        provider: PROVIDER_ID.to_string(),
        source_id: detail.source_id.clone(),
        title: detail.title.clone(),
        original_title: detail.original_title.clone(),
        year: detail.year,
        developer: detail.developer.clone(),
        cover_url: detail.cover_url.clone(),
        summary: detail.description.chars().take(180).collect(),
        score: None,
        priority: 0,
    }
}

pub fn extract_app_id(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if !trimmed.is_empty() && trimmed.chars().all(|character| character.is_ascii_digit()) {
        return trimmed.parse().ok();
    }
    if let Ok(url) = url::Url::parse(trimmed) {
        let segments: Vec<&str> = url
            .path_segments()?
            .filter(|item| !item.is_empty())
            .collect();
        for (index, segment) in segments.iter().enumerate() {
            if segment.eq_ignore_ascii_case("app")
                && let Some(next) = segments.get(index + 1)
                && next.chars().all(|character| character.is_ascii_digit())
            {
                return next.parse().ok();
            }
        }
    }
    None
}

pub fn normalize_app_id(value: &str) -> Result<i64> {
    extract_app_id(value).context("Steam AppID 或商店链接无效")
}

fn looks_like_addon(name: &str) -> bool {
    let lower = name.to_lowercase();
    [
        "soundtrack",
        "original soundtrack",
        "ost",
        "artbook",
        "art book",
        "manga",
        "album",
        "season pass",
        "expansion pack",
        "dlc",
        "demo",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn parse_release_date(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() == 10
        && trimmed.as_bytes().get(4) == Some(&b'-')
        && trimmed.as_bytes().get(7) == Some(&b'-')
        && trimmed
            .chars()
            .enumerate()
            .all(|(index, character)| matches!(index, 4 | 7) || character.is_ascii_digit())
    {
        return Some(trimmed.to_string());
    }

    let numbers: Vec<i64> = trimmed
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect();
    if numbers.len() >= 3 {
        let (year, month, day) = if numbers[0] > 31 {
            (numbers[0], numbers[1], numbers[2])
        } else {
            (numbers[2], numbers[1], numbers[0])
        };
        if (1900..=2100).contains(&year) && (1..=12).contains(&month) && (1..=31).contains(&day) {
            return Some(format!("{year:04}-{month:02}-{day:02}"));
        }
    }

    let lower = trimmed.to_lowercase();
    let month = [
        ("jan", 1),
        ("feb", 2),
        ("mar", 3),
        ("apr", 4),
        ("may", 5),
        ("jun", 6),
        ("jul", 7),
        ("aug", 8),
        ("sep", 9),
        ("oct", 10),
        ("nov", 11),
        ("dec", 12),
    ]
    .into_iter()
    .find(|(name, _)| lower.contains(name))
    .map(|(_, value)| value)?;
    let year = numbers
        .iter()
        .copied()
        .find(|value| (1900..=2100).contains(value))?;
    let day = numbers
        .iter()
        .copied()
        .find(|value| (1..=31).contains(value))?;
    Some(format!("{year:04}-{month:02}-{day:02}"))
}

fn clean_html(value: &str) -> String {
    let mut text = String::with_capacity(value.len());
    let mut in_tag = false;
    let mut tag = String::new();
    for character in value.chars() {
        match character {
            '<' => {
                in_tag = true;
                tag.clear();
            }
            '>' if in_tag => {
                in_tag = false;
                let tag_lower = tag.to_lowercase();
                if tag_lower.starts_with("br")
                    || tag_lower.starts_with("/p")
                    || tag_lower.starts_with("/li")
                    || tag_lower.starts_with("/div")
                {
                    text.push('\n');
                }
            }
            _ if in_tag => tag.push(character),
            _ => text.push(character),
        }
    }
    let text = text
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    text.split_whitespace().collect::<Vec<_>>().join(" ")
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

fn dedupe_covers(covers: &mut Vec<CoverOption>) {
    let mut seen = std::collections::HashSet::new();
    covers.retain(|cover| seen.insert(cover.url.clone()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_app_id_from_common_forms() {
        assert_eq!(extract_app_id("324160"), Some(324160));
        assert_eq!(
            extract_app_id("https://store.steampowered.com/app/324160/CLANNAD/"),
            Some(324160)
        );
        assert_eq!(
            extract_app_id("https://store.steampowered.com/agecheck/app/324160/"),
            Some(324160)
        );
        assert_eq!(extract_app_id("CLANNAD"), None);
    }

    #[test]
    fn parses_steam_search_and_skips_addons() {
        let raw = r#"
        {"items":[
          {"type":"app","id":324160,"name":"CLANNAD","tiny_image":"https://example.com/cover.jpg","platforms":{"windows":true}},
          {"type":"app","id":416930,"name":"CLANNAD - Original Soundtrack","platforms":{"windows":true}},
          {"type":"app","id":519110,"name":"CLANNAD - Anthology Manga","platforms":{"windows":true}}
        ]}
        "#;
        let results = parse_search(raw).expect("fixture");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, "324160");
    }

    #[test]
    fn parses_steam_detail_with_chinese_date_and_portrait_cover() {
        let raw = r#"
        {"324160":{"success":true,"data":{
          "type":"game","name":"CLANNAD","steam_appid":324160,
          "short_description":"小镇与家族的故事",
          "detailed_description":"<span class=\"bb_img_ctn\"><img src=\"x.jpg\"></span>",
          "about_the_game":"",
          "header_image":"https://example.com/header.jpg",
          "capsule_image":"https://example.com/capsule.jpg",
          "developers":["VisualArts/Key"],"publishers":["Sekai Project"],
          "genres":[{"description":"冒险"},{"description":"休闲"}],
          "categories":[{"description":"单人"}],
          "release_date":{"coming_soon":false,"date":"2015 年 11 月 23 日"}
        }}}
        "#;
        let detail = parse_detail(raw).expect("fixture");
        assert_eq!(detail.source_id, "324160");
        assert_eq!(detail.release_date.as_deref(), Some("2015-11-23"));
        assert_eq!(detail.year, Some(2015));
        assert_eq!(detail.developer.as_deref(), Some("VisualArts/Key"));
        assert_eq!(detail.tags, vec!["冒险", "休闲", "单人"]);
        assert_eq!(detail.description, "小镇与家族的故事");
        assert!(detail.covers.iter().any(|cover| cover.kind == "cover"));
        assert!(detail.covers.iter().any(|cover| cover.kind == "header"));
    }

    #[test]
    fn parses_english_and_chinese_release_dates() {
        assert_eq!(
            parse_release_date("23 Nov, 2015").as_deref(),
            Some("2015-11-23")
        );
        assert_eq!(
            parse_release_date("2015 年 11 月 23 日").as_deref(),
            Some("2015-11-23")
        );
        assert_eq!(
            parse_release_date("2013-04-18").as_deref(),
            Some("2013-04-18")
        );
    }

    #[tokio::test]
    #[ignore = "requires network access to the Steam Store"]
    async fn live_steam_search_and_appdetails() {
        let http = MetadataHttp::new().expect("http");
        let cancel = CancellationToken::new();
        let results = search(&http, "CLANNAD", &cancel).await.expect("search");
        assert!(
            results
                .iter()
                .any(|candidate| candidate.source_id == "324160")
        );
        let detail = detail(
            &http,
            "https://store.steampowered.com/app/324160/CLANNAD/",
            &cancel,
        )
        .await
        .expect("detail");
        assert_eq!(detail.source_id, "324160");
        assert!(detail.cover_url.is_some());
        assert!(!detail.description.is_empty());
    }
}
