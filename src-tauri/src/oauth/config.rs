use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use serde_json::Value;

use super::types::{OAuthProviderConfig, OAuthProviderDef};

const PROVIDER_DEFS: [OAuthProviderDef; 3] = [
    OAuthProviderDef {
        id: "bangumi",
        name: "Bangumi",
        description: "Bangumi 账号、收藏与评分",
        auth_kind: "oauth2",
        hint: "需要 Bangumi 应用凭证和 client_secret",
    },
    OAuthProviderDef {
        id: "nextmoe",
        name: "Kungal / NextMoe",
        description: "Kungal / NextMoe 账号与用户数据",
        auth_kind: "oauth2_pkce",
        hint: "public client + PKCE，不需要 client_secret",
    },
    OAuthProviderDef {
        id: "hikarinagi",
        name: "Hikarinagi",
        description: "Hikarinagi 账号、收藏与状态",
        auth_kind: "oauth2_pkce",
        hint: "public client + PKCE，需要 openid/profile/offline_access",
    },
];

#[derive(Debug, Clone, Default)]
pub struct OAuthConfig {
    pub providers: HashMap<String, OAuthProviderConfig>,
    pub error: Option<String>,
}

impl OAuthConfig {
    pub fn load(data_dir: &Path) -> Self {
        let mut candidates = Vec::new();
        if let Some(path) = std::env::var_os("MIYU_OAUTH_CONFIG") {
            candidates.push(PathBuf::from(path));
        }
        candidates.push(data_dir.join("oauth").join("providers.json"));
        if let Ok(cwd) = std::env::current_dir() {
            candidates.push(cwd.join("tmp").join("oauth").join("providers.json"));
        }

        for path in candidates {
            if !path.is_file() {
                continue;
            }
            return match parse_config(&path) {
                Ok(providers) => OAuthConfig {
                    providers,
                    error: None,
                },
                Err(error) => OAuthConfig {
                    providers: HashMap::new(),
                    error: Some(format!("OAuth 配置无法读取：{error}")),
                },
            };
        }

        OAuthConfig {
            providers: HashMap::new(),
            error: Some(
                "没有找到 OAuth 配置。请把 providers.json 放到数据目录 oauth/ 下，或设置 MIYU_OAUTH_CONFIG。"
                    .to_string(),
            ),
        }
    }

    pub fn provider(&self, id: &str) -> Option<&OAuthProviderConfig> {
        self.providers.get(normalize_id(id))
    }

    pub fn status_hint(&self, id: &str) -> Option<String> {
        if self.provider(id).is_some() {
            return None;
        }
        self.error.clone()
    }
}

pub fn provider_defs() -> &'static [OAuthProviderDef] {
    &PROVIDER_DEFS
}

pub fn provider_def(id: &str) -> Option<&'static OAuthProviderDef> {
    let id = normalize_id(id);
    PROVIDER_DEFS.iter().find(|provider| provider.id == id)
}

pub fn normalize_id(id: &str) -> &str {
    match id {
        "kungal" => "nextmoe",
        other => other,
    }
}

pub fn effective_scopes(id: &str, configured: &[String]) -> Vec<String> {
    let id = normalize_id(id);
    let mut scopes = configured
        .iter()
        .map(|scope| scope.trim().to_string())
        .filter(|scope| !scope.is_empty())
        .collect::<Vec<_>>();
    let required: &[&str] = match id {
        "nextmoe" => &["openid", "profile", "catalog:read"],
        "hikarinagi" => &[
            "openid",
            "profile",
            "offline_access",
            "catalog:read",
            "user:read",
        ],
        _ => &[],
    };
    for scope in required {
        if !scopes.iter().any(|value| value == scope) {
            scopes.push((*scope).to_string());
        }
    }
    scopes
}

fn parse_config(path: &Path) -> Result<HashMap<String, OAuthProviderConfig>> {
    let raw =
        std::fs::read_to_string(path).with_context(|| format!("无法读取 {}", path.display()))?;
    let root: Value = serde_json::from_str(&raw).context("providers.json 不是有效 JSON")?;
    let object = root.as_object().context("providers.json 顶层必须是对象")?;
    let mut providers = HashMap::new();
    for (key, value) in object {
        let id = normalize_id(key).to_string();
        if provider_def(&id).is_none() {
            continue;
        }
        let client_id = value
            .get("clientId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .with_context(|| format!("{id} 缺少 clientId"))?;
        let redirect_uri = value
            .get("redirectUri")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .with_context(|| format!("{id} 缺少 redirectUri"))?;
        let client_secret = value
            .get("clientSecret")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        if id == "bangumi" && client_secret.is_none() {
            bail!("Bangumi 需要 clientSecret");
        }
        let configured_scopes = value
            .get("scopes")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        providers.insert(
            id.clone(),
            OAuthProviderConfig {
                client_id: client_id.to_string(),
                client_secret,
                redirect_uri: redirect_uri.to_string(),
                scopes: effective_scopes(&id, &configured_scopes),
            },
        );
    }
    Ok(providers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_required_pkce_scopes() {
        let scopes = effective_scopes("hikarinagi", &["catalog:read".to_string()]);
        assert!(scopes.contains(&"openid".to_string()));
        assert!(scopes.contains(&"offline_access".to_string()));
    }

    #[test]
    fn maps_kungal_to_nextmoe() {
        assert_eq!(normalize_id("kungal"), "nextmoe");
    }
}
