use std::time::Duration;

use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::json;
use tokio_util::sync::CancellationToken;

use super::http::MetadataHttp;
use super::types::{CandidateDetail, CoverOption, RelatedWork, SearchCandidate};

const PROVIDER_ID: &str = "vndb";
const SEARCH_URL: &str = "https://api.vndb.org/kana/vn";
const SEARCH_FIELDS: &str = "id,title,alttitle,released,image.url,developers.name";
const DETAIL_FIELDS: &str = "id,title,alttitle,titles.lang,titles.title,titles.latin,titles.official,titles.main,aliases,description,released,image.url,developers.name,developers.id,tags.name,tags.rating,tags.spoiler,relations.id,relations.relation,relations.title";

#[derive(Debug, Deserialize)]
struct VndbSearchResponse {
    #[serde(default)]
    results: Vec<VndbVn>,
}

#[derive(Debug, Default, Deserialize)]
struct VndbVn {
    id: String,
    title: String,
    #[serde(default)]
    alttitle: Option<String>,
    #[serde(default)]
    released: Option<String>,
    #[serde(default)]
    image: Option<VndbImage>,
    #[serde(default)]
    developers: Vec<VndbName>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    tags: Vec<VndbTag>,
    #[serde(default)]
    titles: Vec<VndbTitle>,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    relations: Vec<VndbRelation>,
}

#[derive(Debug, Default, Deserialize)]
struct VndbImage {
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct VndbName {
    #[serde(default)]
    name: String,
}

#[derive(Debug, Default, Deserialize)]
struct VndbTag {
    #[serde(default)]
    name: String,
    #[serde(default)]
    rating: f64,
    #[serde(default)]
    spoiler: i64,
}

#[derive(Debug, Default, Deserialize)]
struct VndbTitle {
    #[serde(default)]
    lang: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    latin: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct VndbRelation {
    #[serde(default)]
    id: String,
    #[serde(default)]
    relation: String,
    #[serde(default)]
    title: String,
}

pub async fn search(
    http: &MetadataHttp,
    query: &str,
    cancel: &CancellationToken,
) -> Result<Vec<SearchCandidate>> {
    let payload = json!({
        "filters": ["search", "=", query],
        "fields": SEARCH_FIELDS,
        "results": 20,
        "page": 1
    });
    let response = http
        .post_json(
            PROVIDER_ID,
            SEARCH_URL,
            Duration::from_millis(1200),
            &payload,
            cancel,
        )
        .await?;
    parse_search(&response.body)
}

pub fn parse_search(raw: &str) -> Result<Vec<SearchCandidate>> {
    let parsed: VndbSearchResponse =
        serde_json::from_str(raw).context("VNDB 搜索响应格式无法识别")?;
    Ok(parsed
        .results
        .into_iter()
        .map(|vn| {
            let original_title = vn
                .alttitle
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(&vn.title)
                .to_string();
            SearchCandidate {
                provider: PROVIDER_ID.to_string(),
                source_id: vn.id,
                title: original_title.clone(),
                original_title,
                year: extract_year(vn.released.as_deref()),
                developer: vn.developers.first().map(|item| item.name.clone()),
                cover_url: vn.image.and_then(|image| image.url),
                summary: String::new(),
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
    let payload = json!({
        "filters": ["id", "=", source_id],
        "fields": DETAIL_FIELDS,
        "results": 1,
        "page": 1
    });
    let response = http
        .post_json(
            PROVIDER_ID,
            SEARCH_URL,
            Duration::from_millis(1200),
            &payload,
            cancel,
        )
        .await?;
    parse_detail(&response.body).with_context(|| format!("VNDB 没有返回 {source_id}"))
}

pub fn parse_detail(raw: &str) -> Result<CandidateDetail> {
    let parsed: VndbSearchResponse =
        serde_json::from_str(raw).context("VNDB 详情响应格式无法识别")?;
    let vn = parsed.results.into_iter().next().context("VNDB 详情为空")?;
    Ok(map_detail(vn, raw.to_string()))
}

fn map_detail(vn: VndbVn, raw_json: String) -> CandidateDetail {
    let original_title = vn
        .alttitle
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&vn.title)
        .to_string();
    let chinese = vn
        .titles
        .iter()
        .find(|title| {
            !title.title.trim().is_empty()
                && matches!(title.lang.as_str(), "zh-Hans" | "zh" | "zh-Hant" | "zh-CN")
        })
        .map(|title| title.title.clone());
    let title = chinese.clone().unwrap_or_else(|| original_title.clone());

    let mut aliases = Vec::new();
    for value in vn.aliases {
        push_unique(&mut aliases, value);
    }
    for entry in &vn.titles {
        if entry.title != title && entry.title != original_title {
            push_unique(&mut aliases, entry.title.clone());
        }
        if let Some(latin) = &entry.latin
            && latin != &title
            && latin != &original_title
        {
            push_unique(&mut aliases, latin.clone());
        }
    }

    let mut tags: Vec<VndbTag> = vn.tags.into_iter().filter(|tag| tag.spoiler == 0).collect();
    tags.sort_by(|left, right| right.rating.total_cmp(&left.rating));
    let tags = tags
        .into_iter()
        .map(|tag| tag.name)
        .filter(|name| !name.trim().is_empty())
        .take(12)
        .collect::<Vec<_>>();

    let related = vn
        .relations
        .into_iter()
        .take(12)
        .map(|relation| RelatedWork {
            source_id: relation.id,
            relation: relation.relation,
            title: relation.title,
        })
        .collect();

    let release_date = vn
        .released
        .as_deref()
        .filter(|value| value.len() == 10)
        .map(ToOwned::to_owned);
    let year = extract_year(vn.released.as_deref());
    let developer = vn.developers.first().map(|item| item.name.clone());
    let cover_url = vn.image.and_then(|image| image.url);
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
        source_id: vn.id,
        title,
        original_title,
        aliases,
        description: clean_bbcode(&vn.description.unwrap_or_default()),
        release_date,
        year,
        developer: developer.clone(),
        publisher: developer,
        tags,
        cover_url,
        covers,
        related,
        raw_json,
    }
}

fn push_unique(values: &mut Vec<String>, value: String) {
    let value = value.trim().to_string();
    if !value.is_empty()
        && !values
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&value))
    {
        values.push(value);
    }
}

pub fn extract_year(value: Option<&str>) -> Option<i64> {
    let value = value?;
    value.get(0..4)?.parse::<i64>().ok()
}

fn clean_bbcode(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(start) = rest.find('[') {
        result.push_str(&rest[..start]);
        let Some(end) = rest[start..].find(']') else {
            result.push_str(&rest[start..]);
            return result;
        };
        let tag = &rest[start + 1..start + end];
        let known = tag.starts_with("url")
            || tag.starts_with("/url")
            || matches!(
                tag,
                "b" | "/b"
                    | "i"
                    | "/i"
                    | "u"
                    | "/u"
                    | "s"
                    | "/s"
                    | "spoiler"
                    | "/spoiler"
                    | "quote"
                    | "/quote"
                    | "code"
                    | "/code"
            );
        if !known {
            result.push_str(&rest[start..=start + end]);
        }
        rest = &rest[start + end + 1..];
    }
    result.push_str(rest);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_vndb_detail_and_drops_spoiler_tags() {
        let raw = r#"
        {"results":[{
          "id":"v11469",
          "title":"Getsuei no Kusari -Sakuran Paranoia-",
          "alttitle":"月影の鎖 -錯乱パラノイア-",
          "released":"2013-04-18",
          "image":{"url":"https://t.vndb.org/cv/49/101149.jpg"},
          "developers":[{"name":"Takuyo Co., Ltd."}],
          "aliases":["Getsuei"],
          "description":"[b]description[/b] [url=https://example.com]link[/url]",
          "titles":[
            {"lang":"zh-Hans","title":"月影之锁"},
            {"lang":"ja","title":"月影の鎖 -錯乱パラノイア-"}
          ],
          "tags":[
            {"name":"乙女向","rating":2.4,"spoiler":0},
            {"name":"剧透","rating":2.0,"spoiler":1}
          ],
          "relations":[
            {"id":"v12928","relation":"Sequel","title":"FD","official":true}
          ]
        }]}
        "#;
        let detail = parse_detail(raw).expect("fixture");
        assert_eq!(detail.title, "月影之锁");
        assert_eq!(detail.original_title, "月影の鎖 -錯乱パラノイア-");
        assert_eq!(detail.year, Some(2013));
        assert_eq!(detail.release_date.as_deref(), Some("2013-04-18"));
        assert_eq!(detail.developer.as_deref(), Some("Takuyo Co., Ltd."));
        assert_eq!(detail.description, "description link");
        assert_eq!(detail.tags, vec!["乙女向"]);
        assert_eq!(detail.related.len(), 1);
        assert_eq!(detail.related[0].source_id, "v12928");
        assert!(detail.aliases.contains(&"Getsuei".to_string()));
    }

    #[test]
    fn parses_vndb_search_fixture() {
        let raw = r#"
        {"results":[{
          "id":"v11469",
          "title":"Getsuei no Kusari -Sakuran Paranoia-",
          "alttitle":"月影の鎖 -錯乱パラノイア-",
          "released":"2013-04-18",
          "image":{"url":"https://t.vndb.org/cv/49/101149.jpg"},
          "developers":[{"name":"Takuyo Co., Ltd."}]
        }]}
        "#;
        let results = parse_search(raw).expect("fixture");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_id, "v11469");
        assert_eq!(results[0].year, Some(2013));
    }
}
