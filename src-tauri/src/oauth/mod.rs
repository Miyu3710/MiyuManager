mod config;
mod crypto;
mod flow;
mod store;
mod types;

use std::collections::HashSet;
use std::path::Path;

use anyhow::{Context, Result, bail};
use reqwest::Client;
use sqlx::SqlitePool;
use tokio::sync::Mutex;

pub use types::OAuthStatus;

use config::{normalize_id, provider_def, provider_defs};

pub struct OAuthService {
    config: config::OAuthConfig,
    http: Client,
    connecting: Mutex<HashSet<String>>,
}

impl OAuthService {
    pub fn new(data_dir: &Path) -> Result<Self> {
        let config = config::OAuthConfig::load(data_dir);
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
            config,
            http,
            connecting: Mutex::new(HashSet::new()),
        })
    }

    pub async fn statuses(&self, pool: &SqlitePool) -> Result<Vec<OAuthStatus>> {
        let rows = store::list_accounts(pool).await?;
        let by_provider = rows
            .into_iter()
            .map(|row| (row.provider.clone(), row))
            .collect::<std::collections::HashMap<_, _>>();
        Ok(provider_defs()
            .iter()
            .map(|definition| {
                let account = by_provider.get(definition.id);
                let configured = self.config.provider(definition.id).is_some();
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
                        self.config
                            .provider(definition.id)
                            .map(|provider| provider.scopes.clone())
                            .unwrap_or_else(|| config::effective_scopes(definition.id, &[]))
                    }),
                    expires_at: account.and_then(|row| row.expires_at),
                    hint: if configured {
                        Some(definition.hint.to_string())
                    } else {
                        self.config.status_hint(definition.id)
                    },
                }
            })
            .collect())
    }

    pub async fn connect(&self, pool: &SqlitePool, provider_id: &str) -> Result<OAuthStatus> {
        let provider_id = normalize_id(provider_id);
        let definition = provider_def(provider_id).context("未知的 OAuth 来源")?;
        let config = self
            .config
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
}
