use std::collections::HashMap;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use reqwest::StatusCode;
use reqwest::header::{IF_NONE_MATCH, RETRY_AFTER};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

const MAX_JSON_BYTES: usize = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 16 * 1024 * 1024;

pub struct MetadataHttp {
    client: reqwest::Client,
    last_request: Mutex<HashMap<String, Instant>>,
}

#[derive(Debug)]
pub struct RawResponse {
    pub body: String,
}

impl MetadataHttp {
    pub fn new() -> Result<Self> {
        let mut builder = reqwest::Client::builder()
            .user_agent("MiyuManager/0.1 (local Galgame library manager)")
            .timeout(Duration::from_secs(18))
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::limited(5))
            .gzip(true);
        if let Some(proxy) = crate::net::system_proxy() {
            builder = builder.proxy(reqwest::Proxy::all(proxy).context("元数据代理配置无效")?);
        }
        let client = builder.build().context("无法创建元数据 HTTP 客户端")?;
        Ok(Self {
            client,
            last_request: Mutex::new(HashMap::new()),
        })
    }

    pub async fn get_json(
        &self,
        provider: &str,
        url: &str,
        min_interval: Duration,
        etag: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<RawResponse> {
        self.get_json_with_token(provider, url, min_interval, etag, None, cancel)
            .await
    }

    pub async fn get_json_with_token(
        &self,
        provider: &str,
        url: &str,
        min_interval: Duration,
        etag: Option<&str>,
        bearer: Option<&str>,
        cancel: &CancellationToken,
    ) -> Result<RawResponse> {
        let response = self
            .request(
                provider,
                url,
                min_interval,
                etag,
                bearer,
                cancel,
                RequestBody::None,
                MAX_JSON_BYTES,
            )
            .await?;
        Ok(RawResponse {
            body: String::from_utf8_lossy(&response.bytes).to_string(),
        })
    }

    pub async fn post_json(
        &self,
        provider: &str,
        url: &str,
        min_interval: Duration,
        body: &serde_json::Value,
        cancel: &CancellationToken,
    ) -> Result<RawResponse> {
        let response = self
            .request(
                provider,
                url,
                min_interval,
                None,
                None,
                cancel,
                RequestBody::Json(body),
                MAX_JSON_BYTES,
            )
            .await?;
        Ok(RawResponse {
            body: String::from_utf8_lossy(&response.bytes).to_string(),
        })
    }

    pub async fn download_image(
        &self,
        provider: &str,
        url: &str,
        cancel: &CancellationToken,
    ) -> Result<Vec<u8>> {
        let response = self
            .request(
                &format!("{provider}:image"),
                url,
                Duration::from_millis(250),
                None,
                None,
                cancel,
                RequestBody::None,
                MAX_IMAGE_BYTES,
            )
            .await?;
        Ok(response.bytes)
    }

    #[allow(clippy::too_many_arguments)]
    async fn request(
        &self,
        provider: &str,
        url: &str,
        min_interval: Duration,
        etag: Option<&str>,
        bearer: Option<&str>,
        cancel: &CancellationToken,
        body: RequestBody<'_>,
        max_bytes: usize,
    ) -> Result<RawBytes> {
        let mut last_error = None;
        for attempt in 0..3u32 {
            self.wait_for_slot(provider, min_interval).await;
            if cancel.is_cancelled() {
                bail!("已取消");
            }

            let mut request = self.client.request(
                match body {
                    RequestBody::None => reqwest::Method::GET,
                    RequestBody::Json(_) => reqwest::Method::POST,
                },
                url,
            );
            if let RequestBody::Json(payload) = &body {
                request = request.json(payload);
            }
            if let Some(etag) = etag {
                request = request.header(IF_NONE_MATCH, etag);
            }
            if let Some(token) = bearer {
                request = request.bearer_auth(token);
            }

            let result = tokio::select! {
                _ = cancel.cancelled() => bail!("已取消"),
                response = request.send() => response,
            };

            match result {
                Ok(response) => {
                    let status = response.status();
                    if status == StatusCode::NOT_MODIFIED {
                        return Ok(RawBytes { bytes: Vec::new() });
                    }
                    if status.is_success() {
                        if let Some(length) = response.content_length()
                            && length as usize > max_bytes
                        {
                            bail!("来源响应超过大小限制");
                        }
                        let bytes = tokio::select! {
                            _ = cancel.cancelled() => bail!("已取消"),
                            bytes = response.bytes() => bytes,
                        }
                        .context("读取来源响应失败")?;
                        if bytes.len() > max_bytes {
                            bail!("来源响应超过大小限制");
                        }
                        return Ok(RawBytes {
                            bytes: bytes.to_vec(),
                        });
                    }

                    let retryable =
                        status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error();
                    let wait = if status == StatusCode::TOO_MANY_REQUESTS {
                        response
                            .headers()
                            .get(RETRY_AFTER)
                            .and_then(|value| value.to_str().ok())
                            .and_then(|value| value.parse::<u64>().ok())
                            .map(Duration::from_secs)
                            .unwrap_or_else(|| Duration::from_secs(2 + u64::from(attempt)))
                    } else {
                        Duration::from_millis(500 * 2_u64.pow(attempt))
                    };
                    if retryable && attempt < 2 {
                        last_error = Some(format!("来源返回 HTTP {status}"));
                        tokio::time::sleep(wait.min(Duration::from_secs(8))).await;
                        continue;
                    }
                    bail!("来源返回 HTTP {status}");
                }
                Err(error) => {
                    if attempt < 2 {
                        last_error = Some(error.to_string());
                        tokio::time::sleep(Duration::from_millis(500 * 2_u64.pow(attempt))).await;
                        continue;
                    }
                    return Err(error).context("无法连接元数据来源");
                }
            }
        }
        bail!(
            "{}",
            last_error.unwrap_or_else(|| "元数据请求失败".to_string())
        )
    }

    async fn wait_for_slot(&self, provider: &str, min_interval: Duration) {
        loop {
            let mut slots = self.last_request.lock().await;
            let now = Instant::now();
            match slots.get(provider) {
                Some(last) if now.duration_since(*last) < min_interval => {
                    let wait = min_interval - now.duration_since(*last);
                    drop(slots);
                    tokio::time::sleep(wait).await;
                }
                _ => {
                    slots.insert(provider.to_string(), now);
                    return;
                }
            }
        }
    }
}

#[derive(Clone, Copy)]
enum RequestBody<'a> {
    None,
    Json(&'a serde_json::Value),
}

struct RawBytes {
    bytes: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn retries_rate_limited_response_and_succeeds() {
        let server = tiny_http::Server::http("127.0.0.1:0").expect("server");
        let address = match server.server_addr() {
            tiny_http::ListenAddr::IP(address) => address,
        };
        let port = address.port();
        let handle = std::thread::spawn(move || {
            for index in 0..2 {
                let request = server.recv().expect("request");
                if index == 0 {
                    let retry_after = tiny_http::Header::from_bytes(&b"Retry-After"[..], &b"0"[..])
                        .expect("header");
                    request
                        .respond(
                            tiny_http::Response::from_string("rate limited")
                                .with_status_code(tiny_http::StatusCode(429))
                                .with_header(retry_after),
                        )
                        .expect("429 response");
                } else {
                    request
                        .respond(tiny_http::Response::from_string(r#"{"ok":true}"#))
                        .expect("200 response");
                }
            }
        });
        let http = MetadataHttp::new().expect("client");
        let response = http
            .get_json(
                "test",
                &format!("http://127.0.0.1:{port}/"),
                Duration::from_millis(0),
                None,
                &CancellationToken::new(),
            )
            .await
            .expect("retried request");
        assert_eq!(response.body, r#"{"ok":true}"#);
        handle.join().expect("server thread");
    }
}
