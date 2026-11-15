mod config;
mod crypto;
mod flow;
mod store;
mod types;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, bail};
use reqwest::Client;
use sqlx::SqlitePool;
use tokio::sync::Mutex;

pub use types::{OAuthConfigInfo, OAuthStatus};

use config::{normalize_id, provider_def, provider_defs};

pub struct OAuthService {
    data_dir: PathBuf,
    http: Client,
    connecting: Mutex<HashSet<String>>,
    app_tokens: Mutex<HashMap<String, CachedAppToken>>,
}

#[derive(Debug, Clone)]
struct CachedAppToken {
    access_token: String,
    expires_at: i64,
}

impl OAuthService {
    pub fn new(data_dir: &Path) -> Result<Self> {
        let mut builder = Client::builder()
            .user_agent("MiyuManager/0.1 (OAuth desktop client)")
            .http1_only()
            .timeout(std::time::Duration::from_secs(30))
            .connect_timeout(std::time::Duration::from_secs(10));
        if let Some(proxy) = crate::net::system_proxy() {
            builder = builder.proxy(reqwest::Proxy::all(proxy).context("OAuth 代理配置无效")?);
        }
        let http = builder.build().context("无法创建 OAuth HTTP 客户端")?;
        Ok(Self {
            data_dir: data_dir.to_path_buf(),
            http,
            connecting: Mutex::new(HashSet::new()),
            app_tokens: Mutex::new(HashMap::new()),
        })
    }

    fn current_config(&self) -> config::OAuthConfig {
        config::OAuthConfig::load(&self.data_dir)
    }

    pub fn has_usable_credentials(&self, provider_id: &str) -> bool {
        let provider_id = normalize_id(provider_id);
        self.current_config()
            .provider(provider_id)
            .is_some_and(|provider| provider.client_secret.is_some())
    }

    pub async fn access_token(&self, pool: &SqlitePool, provider_id: &str) -> Result<String> {
        let provider_id = normalize_id(provider_id);
        let definition = provider_def(provider_id).context("未知的 OAuth 来源")?;
        let config = self.current_config();
        let provider = config.provider(provider_id).with_context(|| {
            format!(
                "{} 还没有 OAuth 配置，请先导入 providers.json",
                definition.name
            )
        })?;

        if let Some(stored) = store::load_tokens(pool, provider_id).await? {
            if stored.expires_at > now_unix() + 90 {
                let token = decrypt_token(&stored.access_token_enc)?;
                if !token.trim().is_empty() {
                    return Ok(token);
                }
            }
            if let Some(refresh_encrypted) = stored.refresh_token_enc.as_deref() {
                let refresh_token = decrypt_token(refresh_encrypted)?;
                match flow::refresh_access_token(&self.http, provider_id, provider, &refresh_token)
                    .await
                {
                    Ok(tokens) => {
                        store::update_tokens(pool, provider_id, &tokens, &provider.scopes).await?;
                        return Ok(tokens.access_token);
                    }
                    Err(error) if provider.client_secret.is_none() => {
                        return Err(error.context(format!(
                            "{} 登录已失效，请在设置 → 账号连接中重新登录",
                            definition.name
                        )));
                    }
                    Err(_) => {}
                }
            }
        }

        if provider.client_secret.is_some()
            && let Some(token) = self.app_access_token(provider_id, provider).await?
        {
            return Ok(token);
        }

        bail!(
            "{} 还没有可用的访问令牌。请先在设置 → 账号连接中登录。",
            definition.name
        )
    }

    async fn app_access_token(
        &self,
        provider_id: &str,
        provider: &types::OAuthProviderConfig,
    ) -> Result<Option<String>> {
        if provider.client_secret.is_none() {
            return Ok(None);
        }
        let now = now_unix();
        {
            let cache = self.app_tokens.lock().await;
            if let Some(cached) = cache.get(provider_id)
                && cached.expires_at > now + 60
            {
                return Ok(Some(cached.access_token.clone()));
            }
        }
        let tokens = flow::client_credentials_token(&self.http, provider_id, provider)
            .await
            .context("应用凭据换取令牌失败")?;
        let access_token = tokens.access_token.clone();
        let expires_at = now + tokens.expires_in_seconds().saturating_sub(60);
        self.app_tokens.lock().await.insert(
            provider_id.to_string(),
            CachedAppToken {
                access_token: access_token.clone(),
                expires_at,
            },
        );
        Ok(Some(access_token))
    }

    pub fn config_info(&self) -> OAuthConfigInfo {
        let config = self.current_config();
        let mut provider_ids = config.providers.keys().cloned().collect::<Vec<_>>();
        provider_ids.sort();
        OAuthConfigInfo {
            path: config.path.as_ref().map(|path| path.display().to_string()),
            error: config.error.clone(),
            checked_paths: config
                .checked_paths
                .iter()
                .map(|path| path.display().to_string())
                .collect(),
            data_dir: self.data_dir.display().to_string(),
            provider_ids,
        }
    }

    pub fn install_config(&self, source: &Path) -> Result<OAuthConfigInfo> {
        config::validate_file(source)?;
        let directory = self.data_dir.join("oauth");
        std::fs::create_dir_all(&directory)
            .with_context(|| format!("无法创建 OAuth 配置目录 {}", directory.display()))?;
        let destination = directory.join("providers.json");
        let same_file = match (
            std::fs::canonicalize(source),
            std::fs::canonicalize(&destination),
        ) {
            (Ok(source), Ok(destination)) => source == destination,
            _ => false,
        };
        if !same_file {
            let bytes =
                std::fs::read(source).with_context(|| format!("无法读取 {}", source.display()))?;
            let temporary = directory.join("providers.json.tmp");
            std::fs::write(&temporary, bytes)
                .with_context(|| format!("无法写入 {}", temporary.display()))?;
            if destination.exists() {
                std::fs::remove_file(&destination)
                    .with_context(|| format!("无法替换 {}", destination.display()))?;
            }
            std::fs::rename(&temporary, &destination)
                .with_context(|| format!("无法保存 {}", destination.display()))?;
        }
        let info = self.config_info();
        if info.error.is_some() || info.provider_ids.is_empty() {
            bail!("OAuth 配置已保存，但重新读取失败");
        }
        Ok(info)
    }

    pub async fn statuses(&self, pool: &SqlitePool) -> Result<Vec<OAuthStatus>> {
        let config = self.current_config();
        let rows = store::list_accounts(pool).await?;
        let by_provider = rows
            .into_iter()
            .map(|row| (row.provider.clone(), row))
            .collect::<std::collections::HashMap<_, _>>();
        Ok(provider_defs()
            .iter()
            .map(|definition| {
                let account = by_provider.get(definition.id);
                let configured = config.provider(definition.id).is_some();
                OAuthStatus {
                    id: definition.id.to_string(),
                    name: definition.name.to_string(),
                    description: definition.description.to_string(),
                    auth_kind: definition.auth_kind.to_string(),
                    configured,
                    connected: account.is_some(),
                    account_name: account.and_then(|row| row.account_name.clone()),
                    account_id: account.and_then(|row| row.account_id.clone()),
                    scopes: account.map(|row| row.scopes.clone()).unwrap_or_else(|| {
                        config
                            .provider(definition.id)
                            .map(|provider| provider.scopes.clone())
                            .unwrap_or_else(|| config::effective_scopes(definition.id, &[]))
                    }),
                    expires_at: account.and_then(|row| row.expires_at),
                    hint: if configured {
                        Some(definition.hint.to_string())
                    } else {
                        config.status_hint(definition.id)
                    },
                }
            })
            .collect())
    }

    pub async fn connect(&self, pool: &SqlitePool, provider_id: &str) -> Result<OAuthStatus> {
        let provider_id = normalize_id(provider_id);
        let definition = provider_def(provider_id).context("未知的 OAuth 来源")?;
        let config = self.current_config();
        let config = config
            .provider(provider_id)
            .with_context(|| format!("{} 还没有配置 OAuth 应用凭证", definition.name))?;
        {
            let mut connecting = self.connecting.lock().await;
            if !connecting.insert(provider_id.to_string()) {
                bail!("{} 正在进行授权", definition.name);
            }
        }
        let result = flow::connect(&self.http, provider_id, config).await;
        self.connecting.lock().await.remove(provider_id);
        let (tokens, account) = result?;
        store::save_account(pool, provider_id, &tokens, &account, &config.scopes).await?;
        self.statuses(pool)
            .await?
            .into_iter()
            .find(|status| status.id == provider_id)
            .context("OAuth 状态读取失败")
    }

    pub async fn disconnect(&self, pool: &SqlitePool, provider_id: &str) -> Result<()> {
        let provider_id = normalize_id(provider_id);
        if provider_def(provider_id).is_none() {
            bail!("未知的 OAuth 来源");
        }
        store::delete_account(pool, provider_id).await
    }
}

fn decrypt_token(data: &[u8]) -> Result<String> {
    let bytes = crypto::unprotect(data)?;
    String::from_utf8(bytes).context("OAuth 令牌不是有效文本")
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "opens the system browser and waits for manual OAuth consent"]
    async fn live_nextmoe_login_persists_account() {
        let config_path = std::path::Path::new("../tmp/oauth/providers.json");
        assert!(config_path.is_file(), "run this test from src-tauri");
        unsafe {
            std::env::set_var("MIYU_OAUTH_CONFIG", config_path);
        }
        let pool = crate::db::open_memory_pool().await.expect("pool");
        let service = OAuthService::new(std::path::Path::new("..")).expect("oauth service");
        let status = service
            .connect(&pool, "nextmoe")
            .await
            .expect("nextmoe login");
        assert!(status.connected);
        let rows = store::list_accounts(&pool).await.expect("accounts");
        assert_eq!(rows.len(), 1);
    }

    #[tokio::test]
    #[ignore = "opens the system browser and waits for manual OAuth consent"]
    async fn live_hikarinagi_login_persists_account() {
        let config_path = std::path::Path::new("../tmp/oauth/providers.json");
        assert!(config_path.is_file(), "run this test from src-tauri");
        unsafe {
            std::env::set_var("MIYU_OAUTH_CONFIG", config_path);
        }
        let pool = crate::db::open_memory_pool().await.expect("pool");
        let service = OAuthService::new(std::path::Path::new("..")).expect("oauth service");
        let status = service
            .connect(&pool, "hikarinagi")
            .await
            .expect("hikarinagi login");
        assert!(status.connected);
        let rows = store::list_accounts(&pool).await.expect("accounts");
        assert_eq!(rows.len(), 1);
    }

    #[tokio::test]
    #[ignore = "opens the system browser and waits for manual OAuth consent"]
    async fn live_bangumi_login_persists_account() {
        let config_path = std::path::Path::new("../tmp/oauth/providers.json");
        assert!(config_path.is_file(), "run this test from src-tauri");
        unsafe {
            std::env::set_var("MIYU_OAUTH_CONFIG", config_path);
        }
        let pool = crate::db::open_memory_pool().await.expect("pool");
        let service = OAuthService::new(std::path::Path::new("..")).expect("oauth service");
        let status = service
            .connect(&pool, "bangumi")
            .await
            .expect("bangumi login");
        assert!(status.connected);
        let rows = store::list_accounts(&pool).await.expect("accounts");
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn installs_config_and_reloads_it_immediately() {
        let temp = tempfile::TempDir::new().expect("temp dir");
        let source = temp.path().join("selected.json");
        std::fs::write(
            &source,
            r#"{
                "bangumi": {
                    "clientId": "test-client",
                    "clientSecret": "test-secret",
                    "redirectUri": "http://127.0.0.1:39123/callback"
                }
            }"#,
        )
        .expect("source config");
        let service = OAuthService::new(temp.path()).expect("oauth service");

        let info = service.install_config(&source).expect("install config");

        assert!(info.error.is_none());
        assert_eq!(info.provider_ids, vec!["bangumi".to_string()]);
        assert!(temp.path().join("oauth").join("providers.json").is_file());
    }
}
