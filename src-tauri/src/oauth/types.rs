use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct OAuthProviderConfig {
    pub client_id: String,
    pub client_secret: Option<String>,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct OAuthProviderDef {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub auth_kind: &'static str,
    pub hint: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub auth_kind: String,
    pub configured: bool,
    pub connected: bool,
    pub account_name: Option<String>,
    pub account_id: Option<String>,
    pub scopes: Vec<String>,
    pub expires_at: Option<i64>,
    pub hint: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OAuthAccountRow {
    pub provider: String,
    pub account_name: Option<String>,
    pub account_id: Option<String>,
    pub scopes: Vec<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct AccountInfo {
    pub name: Option<String>,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<Value>,
    #[serde(default)]
    pub id_token: Option<String>,
    #[serde(default)]
    pub user_id: Option<Value>,
}

impl TokenResponse {
    pub fn expires_in_seconds(&self) -> i64 {
        self.expires_in
            .as_ref()
            .and_then(|value| {
                value
                    .as_i64()
                    .or_else(|| value.as_str().and_then(|text| text.parse::<i64>().ok()))
            })
            .filter(|value| *value > 0)
            .unwrap_or(3600)
    }
}

#[derive(Debug, Clone)]
pub struct Callback {
    pub code: String,
    pub state: Option<String>,
}
