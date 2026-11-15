use std::collections::HashMap;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use reqwest::Client;
use serde_json::Value;
use sha2::{Digest, Sha256};
use url::Url;

use super::config::normalize_id;
use super::types::{AccountInfo, Callback, OAuthProviderConfig, TokenResponse};

pub async fn connect(
    http: &Client,
    provider_id: &str,
    config: &OAuthProviderConfig,
) -> Result<(TokenResponse, AccountInfo)> {
    let provider_id = normalize_id(provider_id);
    let pkce = provider_id != "bangumi";
    let state = uuid::Uuid::new_v4().simple().to_string();
    let verifier = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let (server, redirect_uri) = bind_callback_server(config)?;
    let authorize_url = build_authorize_url(
        provider_id,
        config,
        &redirect_uri,
        &state,
        pkce.then_some(challenge.as_str()),
    )?;

    webbrowser::open(&authorize_url).context("无法打开系统浏览器")?;

    let callback = tauri::async_runtime::spawn_blocking(move || {
        wait_for_callback(server, Duration::from_secs(300))
    })
    .await
    .context("授权回调任务失败")??;

    if callback.state.as_deref() != Some(state.as_str()) {
        bail!("OAuth state 校验失败，已拒绝这次授权");
    }
    let tokens = exchange(
        http,
        provider_id,
        config,
        &callback.code,
        &redirect_uri,
        pkce.then_some(verifier.as_str()),
    )
    .await?;
    let account = fetch_account(http, provider_id, &tokens).await;
    Ok((tokens, account))
}

fn bind_callback_server(config: &OAuthProviderConfig) -> Result<(tiny_http::Server, String)> {
    let redirect = Url::parse(&config.redirect_uri).context("OAuth redirectUri 无效")?;
    if redirect.scheme() != "http" || redirect.host_str() != Some("127.0.0.1") {
        bail!("OAuth 回调必须是 http://127.0.0.1 环回地址");
    }
    let port = redirect.port().unwrap_or(0);
    let bind = format!("127.0.0.1:{port}");
    let server = tiny_http::Server::http(&bind)
        .map_err(|error| anyhow!("无法监听 OAuth 回调 {bind}：{error}"))?;
    let actual_port = server
        .server_addr()
        .to_ip()
        .context("OAuth 回调没有绑定到 IP 地址")?
        .port();
    let redirect_uri = if port == 0 {
        format!("http://127.0.0.1:{actual_port}{}", redirect.path())
    } else {
        config.redirect_uri.clone()
    };
    Ok((server, redirect_uri))
}

fn build_authorize_url(
    provider_id: &str,
    config: &OAuthProviderConfig,
    redirect_uri: &str,
    state: &str,
    challenge: Option<&str>,
) -> Result<String> {
    let base = match provider_id {
        "bangumi" => "https://bgm.tv/oauth/authorize",
        "nextmoe" => "https://account.nextmoe.com/api/v1/oauth/authorize",
        "hikarinagi" => "https://id.hikarinagi.org/oidc/auth",
        _ => bail!("未知的 OAuth 来源"),
    };
    let mut url = Url::parse(base)?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("client_id", &config.client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("state", state);
        if provider_id != "bangumi" && !config.scopes.is_empty() {
            query.append_pair("scope", &config.scopes.join(" "));
        }
        if let Some(challenge) = challenge {
            query
                .append_pair("code_challenge", challenge)
                .append_pair("code_challenge_method", "S256");
        }
    }
    Ok(url.to_string())
}

fn wait_for_callback(server: tiny_http::Server, timeout: Duration) -> Result<Callback> {
    let deadline = Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            bail!("OAuth 授权超时");
        }
        let request = server
            .recv_timeout(remaining)
            .map_err(|error| anyhow!("等待 OAuth 回调失败：{error}"))?
            .context("OAuth 回调服务器已关闭")?;
        let request_url = request.url().to_string();
        let query = request_url
            .split_once('?')
            .map(|(_, query)| query)
            .unwrap_or_default();
        let params = url::form_urlencoded::parse(query.as_bytes())
            .into_owned()
            .collect::<HashMap<String, String>>();
        let html = if params.contains_key("error") {
            "授权失败，可以关闭此页面并回到 MiyuManager。"
        } else {
            "授权完成，可以关闭此页面并回到 MiyuManager。"
        };
        let response = tiny_http::Response::from_string(format!(
            "<!doctype html><meta charset=\"utf-8\"><title>MiyuManager</title><body style=\"font-family:sans-serif;padding:40px\">{html}</body>"
        ))
        .with_header(
            tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8")
                .expect("static header"),
        );
        let _ = request.respond(response);

        if let Some(error) = params.get("error") {
            let description = params
                .get("error_description")
                .map(String::as_str)
                .unwrap_or("授权服务器拒绝了请求");
            bail!("OAuth 授权失败：{error}（{description}）");
        }
        if let Some(code) = params.get("code") {
            return Ok(Callback {
                code: code.clone(),
                state: params.get("state").cloned(),
            });
        }
    }
}

async fn exchange(
    http: &Client,
    provider_id: &str,
    config: &OAuthProviderConfig,
    code: &str,
    redirect_uri: &str,
    verifier: Option<&str>,
) -> Result<TokenResponse> {
    let mut form = vec![
        ("grant_type", "authorization_code".to_string()),
        ("code", code.to_string()),
        ("redirect_uri", redirect_uri.to_string()),
    ];
    if provider_id != "hikarinagi" {
        form.push(("client_id", config.client_id.clone()));
    }
    if let Some(verifier) = verifier {
        form.push(("code_verifier", verifier.to_string()));
    }
    if provider_id == "bangumi" {
        let secret = config
            .client_secret
            .as_deref()
            .context("Bangumi 缺少 clientSecret")?;
        form.push(("client_secret", secret.to_string()));
    }
    token_request(http, provider_id, config, form).await
}

pub async fn refresh_access_token(
    http: &Client,
    provider_id: &str,
    config: &OAuthProviderConfig,
    refresh_token: &str,
) -> Result<TokenResponse> {
    let mut form = vec![
        ("grant_type", "refresh_token".to_string()),
        ("refresh_token", refresh_token.to_string()),
    ];
    if provider_id != "hikarinagi" {
        form.push(("client_id", config.client_id.clone()));
    }
    if provider_id == "bangumi" {
        let secret = config
            .client_secret
            .as_deref()
            .context("Bangumi 缺少 clientSecret")?;
        form.push(("client_secret", secret.to_string()));
    }
    token_request(http, provider_id, config, form).await
}

pub async fn client_credentials_token(
    http: &Client,
    provider_id: &str,
    config: &OAuthProviderConfig,
) -> Result<TokenResponse> {
    if provider_id != "hikarinagi" {
        bail!("只有 Hikarinagi 支持应用级令牌");
    }
    config
        .client_secret
        .as_deref()
        .context("Hikarinagi 应用凭据缺少 clientSecret")?;
    let form = vec![
        ("grant_type", "client_credentials".to_string()),
        ("scope", "catalog:read".to_string()),
    ];
    token_request(http, provider_id, config, form).await
}

async fn token_request(
    http: &Client,
    provider_id: &str,
    config: &OAuthProviderConfig,
    mut form: Vec<(&'static str, String)>,
) -> Result<TokenResponse> {
    let token_url = match provider_id {
        "bangumi" => "https://bgm.tv/oauth/access_token",
        "nextmoe" => "https://account.nextmoe.com/api/v1/oauth/token",
        "hikarinagi" => "https://id.hikarinagi.org/oidc/token",
        _ => bail!("未知的 OAuth 来源"),
    };
    let mut request = http.post(token_url);
    if provider_id == "hikarinagi" {
        if let Some(secret) = config.client_secret.as_deref() {
            request = request.basic_auth(&config.client_id, Some(secret));
        } else {
            form.push(("client_id", config.client_id.clone()));
        }
    }
    let response = request
        .form(&form)
        .send()
        .await
        .context("无法请求 OAuth token")?;
    let status = response.status();
    let body = response.text().await.context("无法读取 OAuth token 响应")?;
    if !status.is_success() {
        let value = serde_json::from_str::<Value>(&body).unwrap_or(Value::Null);
        let error = value
            .get("error_description")
            .or_else(|| value.get("error"))
            .and_then(Value::as_str)
            .unwrap_or("token 请求被拒绝");
        if provider_id == "hikarinagi" {
            bail!(
                "Hikarinagi 令牌请求失败：{error}。请确认应用类型、clientSecret 和 catalog:read 权限。"
            );
        }
        bail!("OAuth token 请求失败：{error}");
    }
    let tokens: TokenResponse =
        serde_json::from_str(&body).context("OAuth token 响应格式无法识别")?;
    if tokens.access_token.trim().is_empty() {
        bail!("OAuth token 响应缺少 access_token");
    }
    Ok(tokens)
}

async fn fetch_account(http: &Client, provider_id: &str, tokens: &TokenResponse) -> AccountInfo {
    let mut account = match provider_id {
        "nextmoe" => jwt_claims(&tokens.access_token).and_then(|value| account_from_value(&value)),
        "hikarinagi" => tokens
            .id_token
            .as_deref()
            .and_then(jwt_claims)
            .and_then(|value| account_from_value(&value))
            .or_else(|| {
                jwt_claims(&tokens.access_token).and_then(|value| account_from_value(&value))
            }),
        _ => None,
    }
    .unwrap_or(AccountInfo {
        name: None,
        id: None,
    });

    if account.name.is_none() {
        let url = match provider_id {
            "bangumi" => "https://api.bgm.tv/v0/me",
            "nextmoe" => "https://api.nextmoe.dev/v2/me/profile",
            "hikarinagi" => "https://id.hikarinagi.org/oidc/me",
            _ => return account,
        };
        if let Ok(response) = http
            .get(url)
            .bearer_auth(&tokens.access_token)
            .header("User-Agent", "MiyuManager/0.1 (OAuth account)")
            .timeout(Duration::from_secs(8))
            .send()
            .await
            && response.status().is_success()
            && let Ok(value) = response.json::<Value>().await
            && let Some(fetched) = account_from_value(&value)
        {
            account = fetched;
        }
    }
    if account.id.is_none() {
        account.id = tokens
            .user_id
            .as_ref()
            .map(|value| match value {
                Value::String(value) => value.clone(),
                Value::Number(value) => value.to_string(),
                _ => String::new(),
            })
            .filter(|value| !value.is_empty());
    }
    account
}

fn jwt_claims(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn account_from_value(value: &Value) -> Option<AccountInfo> {
    let candidates = [
        value,
        value.get("data").unwrap_or(value),
        value.get("user").unwrap_or(value),
        value.get("profile").unwrap_or(value),
    ];
    for candidate in candidates {
        let name = [
            "preferred_username",
            "nickname",
            "display_name",
            "name",
            "username",
        ]
        .iter()
        .find_map(|key| candidate.get(key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
        let id = ["id", "uid", "sub", "user_id"].iter().find_map(|key| {
            candidate.get(key).and_then(|value| match value {
                Value::String(value) => Some(value.clone()),
                Value::Number(value) => Some(value.to_string()),
                _ => None,
            })
        });
        if name.is_some() || id.is_some() {
            return Some(AccountInfo { name, id });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nextmoe_config() -> OAuthProviderConfig {
        OAuthProviderConfig {
            client_id: "test-client".to_string(),
            client_secret: None,
            redirect_uri: "http://127.0.0.1/callback".to_string(),
            scopes: vec![
                "openid".to_string(),
                "profile".to_string(),
                "catalog:read".to_string(),
            ],
        }
    }

    #[test]
    fn builds_pkce_authorize_url_without_secret() {
        let url = build_authorize_url(
            "nextmoe",
            &nextmoe_config(),
            "http://127.0.0.1:40000/callback",
            "state-1",
            Some("challenge-1"),
        )
        .expect("url");
        assert!(url.starts_with("https://account.nextmoe.com/api/v1/oauth/authorize?"));
        assert!(url.contains("code_challenge=challenge-1"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("scope=openid+profile+catalog%3Aread"));
        assert!(!url.contains("client_secret"));
    }

    #[test]
    fn decodes_id_token_claims() {
        let payload = URL_SAFE_NO_PAD.encode(
            serde_json::to_vec(&serde_json::json!({
                "sub": "user-1",
                "preferred_username": "miyu"
            }))
            .expect("json"),
        );
        let token = format!("header.{payload}.signature");
        let claims = jwt_claims(&token).expect("claims");
        let account = account_from_value(&claims).expect("account");
        assert_eq!(account.name.as_deref(), Some("miyu"));
        assert_eq!(account.id.as_deref(), Some("user-1"));
    }

    #[test]
    fn reads_bangumi_me_shape() {
        let account = account_from_value(&serde_json::json!({
            "id": 42,
            "username": "miyu",
            "nickname": "Miyu"
        }))
        .expect("account");
        assert_eq!(account.name.as_deref(), Some("Miyu"));
        assert_eq!(account.id.as_deref(), Some("42"));
    }

    #[tokio::test]
    #[ignore = "requires network access to NextMoe OAuth"]
    async fn live_exchange_rejects_invalid_code_quickly() {
        let http = Client::builder()
            .user_agent("MiyuManager/0.1 (OAuth test)")
            .timeout(Duration::from_secs(10))
            .build()
            .expect("client");
        let config = nextmoe_config();
        let verifier = "a".repeat(64);
        let start = Instant::now();
        let result = exchange(
            &http,
            "nextmoe",
            &config,
            "invalid-code",
            "http://127.0.0.1/callback",
            Some(&verifier),
        )
        .await;
        assert!(result.is_err());
        assert!(start.elapsed() < Duration::from_secs(10));
    }

    #[tokio::test]
    #[ignore = "requires network access to Bangumi OAuth"]
    async fn live_bangumi_exchange_rejects_invalid_code() {
        let config_path = std::path::Path::new("../tmp/oauth/providers.json");
        assert!(config_path.is_file(), "run this test from src-tauri");
        unsafe {
            std::env::set_var("MIYU_OAUTH_CONFIG", config_path);
        }
        let config = super::super::config::OAuthConfig::load(std::path::Path::new(".."));
        let provider = config.provider("bangumi").expect("bangumi config");
        let http = Client::builder()
            .user_agent("MiyuManager/0.1 (OAuth test)")
            .http1_only()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("client");
        let result = exchange(
            &http,
            "bangumi",
            provider,
            "invalid-code",
            &provider.redirect_uri,
            None,
        )
        .await;
        assert!(result.is_err());
    }
}
