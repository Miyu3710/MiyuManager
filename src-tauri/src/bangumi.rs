use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sqlx::SqlitePool;
use tauri::State;
use tokio_util::sync::CancellationToken;

use crate::commands::AppState;
use crate::db;
use crate::metadata::{self, MetadataHttp};
use crate::oauth::OAuthService;
use crate::preferences;

const PROVIDER_ID: &str = "bangumi";
// The public v0 API does not expose subject interest comments; this is the
// endpoint used by Bangumi's own comments page and may change independently.
const COMMENTS_URL: &str = "https://next.bgm.tv/p1/subjects/";
const COLLECTION_URL: &str = "https://api.bgm.tv/v0/users/-/collections/";
const SUBJECT_URL: &str = "https://bgm.tv/subject/";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BangumiComment {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub nickname: String,
    pub avatar_url: String,
    pub collection_type: i32,
    pub rate: i32,
    pub comment: String,
    pub updated_at: i64,
    pub is_own: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BangumiCommentPage {
    pub subject_id: String,
    pub total: i64,
    pub comments: Vec<BangumiComment>,
    pub collection_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BangumiSyncOutcome {
    pub status: String,
    pub message: String,
    pub collection_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CommentsResponse {
    #[serde(default)]
    data: Vec<CommentItem>,
    #[serde(default)]
    total: i64,
}

#[derive(Debug, Deserialize)]
struct CommentItem {
    id: i64,
    user: CommentUser,
    #[serde(default, rename = "type")]
    collection_type: i32,
    #[serde(default)]
    rate: i32,
    #[serde(default)]
    comment: String,
    #[serde(default, rename = "updatedAt")]
    updated_at: i64,
}

#[derive(Debug, Deserialize)]
struct CommentUser {
    id: i64,
    #[serde(default)]
    username: String,
    #[serde(default)]
    nickname: String,
    #[serde(default)]
    avatar: CommentAvatar,
}

#[derive(Debug, Default, Deserialize)]
struct CommentAvatar {
    #[serde(default)]
    small: String,
    #[serde(default)]
    medium: String,
    #[serde(default)]
    large: String,
}

fn normalized_subject_id(subject_id: &str) -> Result<String> {
    let id: i64 = subject_id.trim().parse().context("Bangumi 条目 ID 无效")?;
    if id <= 0 {
        bail!("Bangumi 条目 ID 无效");
    }
    Ok(id.to_string())
}

fn avatar_url(avatar: &CommentAvatar) -> String {
    for value in [&avatar.medium, &avatar.small, &avatar.large] {
        if !value.trim().is_empty() {
            return value.clone();
        }
    }
    String::new()
}

pub fn parse_comments(
    raw: &str,
    subject_id: &str,
    own_id: Option<i64>,
) -> Result<BangumiCommentPage> {
    let parsed: CommentsResponse =
        serde_json::from_str(raw).context("Bangumi 吐槽响应格式无法识别")?;
    let comments = parsed
        .data
        .into_iter()
        .filter(|item| !item.comment.trim().is_empty())
        .map(|item| {
            let username = item.user.username;
            let nickname = if item.user.nickname.trim().is_empty() {
                username.clone()
            } else {
                item.user.nickname
            };
            BangumiComment {
                id: item.id,
                user_id: item.user.id,
                username,
                nickname,
                avatar_url: avatar_url(&item.user.avatar),
                collection_type: item.collection_type,
                rate: item.rate,
                comment: item.comment,
                updated_at: item.updated_at,
                is_own: own_id == Some(item.user.id),
            }
        })
        .collect::<Vec<_>>();
    Ok(BangumiCommentPage {
        subject_id: subject_id.to_string(),
        total: parsed.total.max(comments.len() as i64),
        comments,
        collection_url: format!("{SUBJECT_URL}{subject_id}/comments"),
    })
}

async fn own_account_id(oauth: &OAuthService, pool: &SqlitePool) -> Option<i64> {
    oauth
        .statuses(pool)
        .await
        .ok()
        .and_then(|statuses| statuses.into_iter().find(|status| status.id == PROVIDER_ID))
        .and_then(|status| status.account_id)
        .and_then(|id| id.parse::<i64>().ok())
}

async fn connected_token(oauth: &OAuthService, pool: &SqlitePool) -> Result<String> {
    let connected = oauth
        .statuses(pool)
        .await?
        .into_iter()
        .any(|status| status.id == PROVIDER_ID && status.connected);
    if !connected {
        bail!("请先在设置 → 账号与同步中连接 Bangumi");
    }
    oauth
        .access_token(pool, PROVIDER_ID)
        .await
        .map_err(|error| anyhow!("Bangumi 授权已失效，请重新登录：{error}"))
}

pub async fn subject_comments(
    http: &MetadataHttp,
    oauth: &OAuthService,
    pool: &SqlitePool,
    subject_id: &str,
    limit: u32,
    offset: u32,
    cancel: &CancellationToken,
) -> Result<BangumiCommentPage> {
    let subject_id = normalized_subject_id(subject_id)?;
    let token = oauth.access_token(pool, PROVIDER_ID).await.ok();
    let url = format!(
        "{COMMENTS_URL}{subject_id}/comments?limit={}&offset={}",
        limit.clamp(1, 50),
        offset
    );
    let mut own_id = None;
    let response = if let Some(token) = token.as_deref() {
        match http
            .get_json_with_token(
                PROVIDER_ID,
                &url,
                Duration::from_millis(700),
                None,
                Some(token),
                cancel,
            )
            .await
        {
            Ok(response) => {
                own_id = own_account_id(oauth, pool).await;
                response
            }
            Err(_) => {
                http.get_json_with_token(
                    PROVIDER_ID,
                    &url,
                    Duration::from_millis(700),
                    None,
                    None,
                    cancel,
                )
                .await?
            }
        }
    } else {
        http.get_json_with_token(
            PROVIDER_ID,
            &url,
            Duration::from_millis(700),
            None,
            None,
            cancel,
        )
        .await?
    };
    parse_comments(&response.body, &subject_id, own_id)
}

fn collection_type_for_status(status: &str) -> Option<i32> {
    match status {
        "queued" => Some(1),
        "finished" => Some(2),
        "playing" => Some(3),
        "paused" => Some(4),
        "dropped" => Some(5),
        _ => None,
    }
}

fn progress_payload(status: &str, rating: Option<f64>) -> Value {
    // Local favorite is a MiyuManager-only filter and never becomes Bangumi collection state.
    let mut payload = Map::new();
    if let Some(collection_type) = collection_type_for_status(status) {
        payload.insert("type".to_string(), json!(collection_type));
    }
    if let Some(rating) = rating {
        payload.insert(
            "rate".to_string(),
            json!(rating.round().clamp(0.0, 10.0) as i64),
        );
    }
    Value::Object(payload)
}

fn friendly_write_error(error: anyhow::Error) -> anyhow::Error {
    let text = error.to_string();
    if text.contains("HTTP 401") || text.contains("HTTP 403") {
        anyhow!("Bangumi 授权缺少收藏写入权限，请在设置 → 账号与同步中重新登录 Bangumi")
    } else if text.contains("HTTP 400") || text.contains("HTTP 404") {
        anyhow!("Bangumi 没有接受这次写入；请确认来源编号有效，并已授权收藏写入")
    } else {
        error
    }
}

async fn post_collection(
    http: &MetadataHttp,
    token: &str,
    subject_id: &str,
    payload: &Value,
    cancel: &CancellationToken,
) -> Result<()> {
    let url = format!("{COLLECTION_URL}{subject_id}");
    http.post_json_with_token(
        PROVIDER_ID,
        &url,
        Duration::from_millis(700),
        payload,
        Some(token),
        cancel,
    )
    .await
    .map_err(friendly_write_error)?;
    Ok(())
}

fn skipped(message: impl Into<String>) -> BangumiSyncOutcome {
    BangumiSyncOutcome {
        status: "skipped".to_string(),
        message: message.into(),
        collection_url: None,
    }
}

fn synced(message: impl Into<String>, subject_id: &str) -> BangumiSyncOutcome {
    BangumiSyncOutcome {
        status: "synced".to_string(),
        message: message.into(),
        collection_url: Some(format!("{SUBJECT_URL}{subject_id}")),
    }
}

pub async fn sync_progress_if_enabled(
    http: &MetadataHttp,
    oauth: &OAuthService,
    pool: &SqlitePool,
    work_id: i64,
    cancel: &CancellationToken,
) -> Result<BangumiSyncOutcome> {
    let preferences = preferences::load(pool).await?;
    if !preferences.bangumi_progress_sync {
        return Ok(skipped("未启用 Bangumi 游玩状态同步"));
    }
    let Some(subject_id) = metadata::bangumi_source_id(pool, work_id).await? else {
        return Ok(skipped("作品还没有关联 Bangumi 条目"));
    };
    let Some(detail) = db::get_library_item(pool, work_id).await? else {
        bail!("作品不存在");
    };
    let payload = progress_payload(&detail.item.status, detail.item.rating);
    if payload.as_object().is_some_and(Map::is_empty) {
        return Ok(skipped("没有可同步的游玩状态或评分"));
    }
    let token = connected_token(oauth, pool).await?;
    post_collection(http, &token, &subject_id, &payload, cancel).await?;
    Ok(synced("游玩状态与评分已同步到 Bangumi", &subject_id))
}

pub async fn sync_comment(
    http: &MetadataHttp,
    oauth: &OAuthService,
    pool: &SqlitePool,
    work_id: i64,
    cancel: &CancellationToken,
) -> Result<BangumiSyncOutcome> {
    let Some(detail) = db::get_library_item(pool, work_id).await? else {
        bail!("作品不存在");
    };
    let comment = detail.notes.trim().to_string();
    if comment.is_empty() {
        bail!("评价内容为空，无法同步到 Bangumi");
    }
    if comment.chars().count() > 380 {
        bail!("Bangumi 吐槽最多 380 个字符，请缩短后再同步");
    }
    let Some(subject_id) = metadata::bangumi_source_id(pool, work_id).await? else {
        bail!("作品还没有关联 Bangumi 条目，无法同步评价");
    };
    let token = connected_token(oauth, pool).await?;
    post_collection(
        http,
        &token,
        &subject_id,
        &json!({ "comment": comment }),
        cancel,
    )
    .await?;
    Ok(synced("评价已同步到 Bangumi 吐槽", &subject_id))
}

#[tauri::command]
pub async fn bangumi_comments(
    state: State<'_, AppState>,
    subject_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<BangumiCommentPage, String> {
    let http = state.http();
    subject_comments(
        &http,
        &state.oauth,
        &state.pool,
        &subject_id,
        limit.unwrap_or(20),
        offset.unwrap_or(0),
        &CancellationToken::new(),
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn bangumi_sync_progress(
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<BangumiSyncOutcome, String> {
    let http = state.http();
    sync_progress_if_enabled(
        &http,
        &state.oauth,
        &state.pool,
        work_id,
        &CancellationToken::new(),
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn bangumi_sync_comment(
    state: State<'_, AppState>,
    work_id: i64,
) -> Result<BangumiSyncOutcome, String> {
    let http = state.http();
    sync_comment(
        &http,
        &state.oauth,
        &state.pool,
        work_id,
        &CancellationToken::new(),
    )
    .await
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_comments_and_marks_the_current_user() {
        let raw = r#"
        {
          "data": [
            {
              "id": 1,
              "user": {
                "id": 42,
                "username": "miyu",
                "nickname": "Miyu",
                "avatar": {"small": "s.jpg", "medium": "m.jpg", "large": "l.jpg"}
              },
              "type": 2,
              "rate": 8,
              "comment": "美术和配乐很稳",
              "updatedAt": 1760000000
            },
            {
              "id": 2,
              "user": {"id": 7, "username": "other", "nickname": "", "avatar": {}},
              "type": 3,
              "rate": 0,
              "comment": "正在推",
              "updatedAt": 1760000001
            },
            {
              "id": 3,
              "user": {"id": 8, "username": "empty", "nickname": "", "avatar": {}},
              "type": 2,
              "rate": 0,
              "comment": "   ",
              "updatedAt": 1760000002
            }
          ],
          "total": 12
        }"#;
        let page = parse_comments(raw, "402654", Some(42)).expect("comments");
        assert_eq!(page.total, 12);
        assert_eq!(page.comments.len(), 2);
        assert!(page.comments[0].is_own);
        assert_eq!(page.comments[0].avatar_url, "m.jpg");
        assert_eq!(page.comments[1].nickname, "other");
        assert!(!page.comments[1].is_own);
    }

    #[test]
    fn maps_local_status_and_rating_to_collection_payload() {
        assert_eq!(collection_type_for_status("queued"), Some(1));
        assert_eq!(collection_type_for_status("finished"), Some(2));
        assert_eq!(collection_type_for_status("playing"), Some(3));
        assert_eq!(collection_type_for_status("paused"), Some(4));
        assert_eq!(collection_type_for_status("unclassified"), None);
        assert_eq!(
            progress_payload("finished", Some(8.5)),
            json!({"type": 2, "rate": 9})
        );
        assert!(
            progress_payload("playing", Some(9.0))
                .get("favorite")
                .is_none()
        );
        assert_eq!(progress_payload("unclassified", None), json!({}));
    }

    #[tokio::test]
    #[ignore = "live Bangumi comment API"]
    async fn live_fetches_public_comments() {
        let http = MetadataHttp::new().expect("http client");
        let url = format!("{COMMENTS_URL}402654/comments?limit=2&offset=0");
        let response = http
            .get_json(
                PROVIDER_ID,
                &url,
                Duration::from_millis(100),
                None,
                &CancellationToken::new(),
            )
            .await
            .expect("comments response");
        let page = parse_comments(&response.body, "402654", None).expect("parsed comments");
        assert!(page.total > 0);
        assert!(!page.comments.is_empty());
        assert!(!page.comments[0].nickname.is_empty());
    }
}
