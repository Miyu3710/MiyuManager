use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tokio_util::sync::CancellationToken;
use url::Url;

use crate::metadata::MetadataHttp;

const PREFERENCES_KEY: &str = "app.preferences";

pub const WRAPPER_LOCALE_EMULATOR: &str = "locale-emulator";
pub const WRAPPER_MAGPIE: &str = "magpie";
const WRAPPER_IDS: [&str; 2] = [WRAPPER_LOCALE_EMULATOR, WRAPPER_MAGPIE];

pub fn is_known_wrapper(id: &str) -> bool {
    WRAPPER_IDS.contains(&id)
}

pub fn wrapper_label(id: &str) -> &'static str {
    match id {
        WRAPPER_LOCALE_EMULATOR => "Locale Emulator",
        WRAPPER_MAGPIE => "Magpie",
        _ => "包装器",
    }
}

fn default_wrapper_args(id: &str) -> Vec<String> {
    if id == WRAPPER_MAGPIE {
        vec!["-t".to_string()]
    } else {
        Vec::new()
    }
}

fn default_wrappers() -> Vec<WrapperConfig> {
    WRAPPER_IDS
        .iter()
        .map(|id| WrapperConfig {
            id: (*id).to_string(),
            path: String::new(),
            args: default_wrapper_args(id),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrapperConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    #[serde(default = "default_proxy_mode")]
    pub proxy_mode: String,
    #[serde(default)]
    pub proxy_url: String,
    #[serde(default)]
    pub default_monitor: Option<i64>,
    #[serde(default)]
    pub launch_fullscreen: bool,
    #[serde(default)]
    pub wrappers: Vec<WrapperConfig>,
    #[serde(default)]
    pub wrapper_path: String,
    #[serde(default)]
    pub wrapper_args: Vec<String>,
    #[serde(default)]
    pub update_manifest_url: String,
    #[serde(default)]
    pub onboarding_completed: bool,
}

fn default_proxy_mode() -> String {
    "system".to_string()
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            proxy_mode: default_proxy_mode(),
            proxy_url: String::new(),
            default_monitor: None,
            launch_fullscreen: false,
            wrappers: default_wrappers(),
            wrapper_path: String::new(),
            wrapper_args: Vec::new(),
            update_manifest_url: String::new(),
            onboarding_completed: false,
        }
    }
}

impl AppPreferences {
    pub fn validate(&mut self) -> Result<()> {
        self.proxy_mode = self.proxy_mode.trim().to_ascii_lowercase();
        if !matches!(self.proxy_mode.as_str(), "system" | "direct" | "custom") {
            bail!("网络代理模式无效");
        }
        self.proxy_url = self.proxy_url.trim().to_string();
        if self.proxy_mode == "custom" {
            if self.proxy_url.is_empty() {
                bail!("自定义代理需要填写地址");
            }
            validate_http_url(&self.proxy_url, "代理地址")?;
        }
        self.normalize_wrappers()?;
        self.update_manifest_url = self.update_manifest_url.trim().to_string();
        if !self.update_manifest_url.is_empty() {
            validate_http_url(&self.update_manifest_url, "更新清单地址")?;
        }
        Ok(())
    }

    fn normalize_wrappers(&mut self) -> Result<()> {
        let legacy_path = self.wrapper_path.trim().to_string();
        let legacy_args = self.wrapper_args.clone();
        let mut normalized: Vec<WrapperConfig> = Vec::new();
        for mut wrapper in self.wrappers.clone() {
            let id = wrapper.id.trim().to_ascii_lowercase();
            if !is_known_wrapper(&id) || normalized.iter().any(|entry| entry.id == id) {
                continue;
            }
            wrapper.id = id;
            wrapper.path = wrapper.path.trim().to_string();
            if wrapper.path.chars().count() > 4096 {
                bail!("{} 路径过长", wrapper_label(&wrapper.id));
            }
            if wrapper.path.contains('\0') {
                bail!("{} 路径不能包含 NUL 字符", wrapper_label(&wrapper.id));
            }
            wrapper.args.retain(|value| !value.trim().is_empty());
            if wrapper.args.len() > 64 {
                bail!("{} 参数过多", wrapper_label(&wrapper.id));
            }
            for arg in &wrapper.args {
                if arg.contains('\0') {
                    bail!("{} 参数不能包含 NUL 字符", wrapper_label(&wrapper.id));
                }
                if arg.chars().count() > 8192 {
                    bail!(
                        "{} 单个参数不能超过 8192 个字符",
                        wrapper_label(&wrapper.id)
                    );
                }
            }
            normalized.push(wrapper);
        }
        if normalized.is_empty() && !legacy_path.is_empty() {
            let mut args = legacy_args;
            args.retain(|value| !value.trim().is_empty());
            normalized.push(WrapperConfig {
                id: WRAPPER_LOCALE_EMULATOR.to_string(),
                path: legacy_path,
                args,
            });
        }
        for id in WRAPPER_IDS {
            if normalized.iter().any(|entry| entry.id == id) {
                continue;
            }
            normalized.push(WrapperConfig {
                id: id.to_string(),
                path: String::new(),
                args: default_wrapper_args(id),
            });
        }
        normalized.sort_by_key(|entry| {
            WRAPPER_IDS
                .iter()
                .position(|id| *id == entry.id)
                .unwrap_or(WRAPPER_IDS.len())
        });
        self.wrappers = normalized;
        let locale = self
            .wrappers
            .iter()
            .find(|wrapper| wrapper.id == WRAPPER_LOCALE_EMULATOR);
        self.wrapper_path = locale
            .map(|wrapper| wrapper.path.clone())
            .unwrap_or_default();
        self.wrapper_args = locale
            .map(|wrapper| wrapper.args.clone())
            .unwrap_or_default();
        Ok(())
    }

    pub fn effective_proxy(&self) -> Option<String> {
        crate::net::proxy_for_mode(&self.proxy_mode, &self.proxy_url)
    }
}

fn validate_http_url(value: &str, label: &str) -> Result<()> {
    let parsed = Url::parse(value).with_context(|| format!("{label}不是有效 URL"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        bail!("{label}只支持 http 或 https");
    }
    Ok(())
}

pub async fn load(pool: &SqlitePool) -> Result<AppPreferences> {
    let raw: Option<String> = sqlx::query_scalar("SELECT value_json FROM settings WHERE key = ?")
        .bind(PREFERENCES_KEY)
        .fetch_optional(pool)
        .await?;
    let Some(raw) = raw else {
        return Ok(AppPreferences::default());
    };
    match serde_json::from_str::<AppPreferences>(&raw) {
        Ok(mut preferences) => {
            if preferences.validate().is_err() {
                preferences.proxy_mode = "system".to_string();
                preferences.proxy_url.clear();
            }
            Ok(preferences)
        }
        Err(_) => Ok(AppPreferences::default()),
    }
}

pub async fn save(pool: &SqlitePool, preferences: &AppPreferences) -> Result<()> {
    let json = serde_json::to_string(preferences).context("无法序列化应用设置")?;
    sqlx::query(
        "INSERT INTO settings (key, value_json) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(PREFERENCES_KEY)
    .bind(json)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_onboarding_completed(pool: &SqlitePool) -> Result<AppPreferences> {
    let mut preferences = load(pool).await?;
    preferences.onboarding_completed = true;
    save(pool, &preferences).await?;
    Ok(preferences)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub current_version: String,
    pub configured: bool,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub notes: Option<String>,
    pub url: Option<String>,
    pub message: String,
}

pub async fn check_for_update(
    http: &MetadataHttp,
    manifest_url: &str,
    current_version: &str,
) -> UpdateCheck {
    let manifest_url = manifest_url.trim();
    if manifest_url.is_empty() {
        return UpdateCheck {
            current_version: current_version.to_string(),
            configured: false,
            latest_version: None,
            update_available: false,
            notes: None,
            url: None,
            message: "当前构建没有配置更新源；安装包与更新流程将在 C9 提供。".to_string(),
        };
    }

    let cancel = CancellationToken::new();
    let response = http
        .get_json(
            "update",
            manifest_url,
            std::time::Duration::from_secs(1),
            None,
            &cancel,
        )
        .await;
    let response = match response {
        Ok(value) => value,
        Err(error) => {
            return UpdateCheck {
                current_version: current_version.to_string(),
                configured: true,
                latest_version: None,
                update_available: false,
                notes: None,
                url: Some(manifest_url.to_string()),
                message: format!("无法读取更新清单：{error}"),
            };
        }
    };
    let value: serde_json::Value = match serde_json::from_str(&response.body) {
        Ok(value) => value,
        Err(_) => {
            return UpdateCheck {
                current_version: current_version.to_string(),
                configured: true,
                latest_version: None,
                update_available: false,
                notes: None,
                url: Some(manifest_url.to_string()),
                message: "更新清单不是有效的 JSON。".to_string(),
            };
        }
    };
    let latest = value
        .get("version")
        .or_else(|| value.get("tag_name"))
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();
    if latest.is_empty() {
        return UpdateCheck {
            current_version: current_version.to_string(),
            configured: true,
            latest_version: None,
            update_available: false,
            notes: None,
            url: Some(manifest_url.to_string()),
            message: "更新清单缺少 version 字段。".to_string(),
        };
    }
    let notes = value
        .get("notes")
        .or_else(|| value.get("body"))
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let url = value
        .get("url")
        .or_else(|| value.get("html_url"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .or_else(|| Some(manifest_url.to_string()));
    let update_available = version_is_newer(&latest, current_version);
    UpdateCheck {
        current_version: current_version.to_string(),
        configured: true,
        latest_version: Some(latest.clone()),
        update_available,
        notes,
        url,
        message: if update_available {
            format!("发现新版本 {latest}")
        } else {
            "当前已是最新版本".to_string()
        },
    }
}

fn version_is_newer(candidate: &str, current: &str) -> bool {
    let parse = |value: &str| {
        value
            .trim_start_matches('v')
            .split(['.', '-', '+'])
            .take(3)
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    let left = parse(candidate);
    let right = parse(current);
    for index in 0..left.len().max(right.len()) {
        let a = left.get(index).copied().unwrap_or(0);
        let b = right.get(index).copied().unwrap_or(0);
        if a != b {
            return a > b;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use crate::db;

    use super::version_is_newer;

    #[test]
    fn compares_numeric_versions() {
        assert!(version_is_newer("0.2.0", "0.1.9"));
        assert!(version_is_newer("v1.0.0", "0.99.0"));
        assert!(!version_is_newer("0.1.0", "0.1.0"));
        assert!(!version_is_newer("0.0.9", "0.1.0"));
    }

    #[tokio::test]
    async fn preferences_round_trip_and_validate_proxy() {
        let pool = db::open_memory_pool().await.expect("pool");
        let mut preferences = super::AppPreferences::default();
        preferences.proxy_mode = "custom".to_string();
        preferences.proxy_url = "http://127.0.0.1:7890".to_string();
        preferences.default_monitor = Some(1);
        let locale = preferences
            .wrappers
            .iter_mut()
            .find(|wrapper| wrapper.id == super::WRAPPER_LOCALE_EMULATOR)
            .expect("locale wrapper");
        locale.path = "C:\\Tools\\LEProc.exe".to_string();
        locale.args = vec!["--locale".to_string(), "ja".to_string()];
        preferences.validate().expect("validate");
        super::save(&pool, &preferences).await.expect("save");

        let loaded = super::load(&pool).await.expect("load");
        assert_eq!(loaded.proxy_mode, "custom");
        assert_eq!(loaded.default_monitor, Some(1));
        let locale = loaded
            .wrappers
            .iter()
            .find(|wrapper| wrapper.id == super::WRAPPER_LOCALE_EMULATOR)
            .expect("locale wrapper");
        assert_eq!(locale.path, "C:\\Tools\\LEProc.exe");
        assert_eq!(locale.args, vec!["--locale", "ja"]);
        assert!(
            loaded
                .wrappers
                .iter()
                .any(|wrapper| wrapper.id == super::WRAPPER_MAGPIE)
        );

        let mut invalid = super::AppPreferences::default();
        invalid.proxy_mode = "custom".to_string();
        invalid.proxy_url = "file:///tmp/proxy".to_string();
        assert!(invalid.validate().is_err());
    }

    #[tokio::test]
    async fn migrates_the_legacy_single_wrapper_setting() {
        let pool = db::open_memory_pool().await.expect("pool");
        let raw = r#"{
            "proxyMode":"system",
            "wrapperPath":"C:\\Tools\\LE\\LEProc.exe",
            "wrapperArgs":["-runas","{profile-guid}"]
        }"#;
        sqlx::query("INSERT INTO settings (key, value_json) VALUES (?, ?)")
            .bind(super::PREFERENCES_KEY)
            .bind(raw)
            .execute(&pool)
            .await
            .expect("legacy settings");

        let loaded = super::load(&pool).await.expect("load");
        let locale = loaded
            .wrappers
            .iter()
            .find(|wrapper| wrapper.id == super::WRAPPER_LOCALE_EMULATOR)
            .expect("locale wrapper");
        assert_eq!(locale.path, "C:\\Tools\\LE\\LEProc.exe");
        assert_eq!(locale.args, vec!["-runas", "{profile-guid}"]);
        assert_eq!(loaded.wrapper_path, "C:\\Tools\\LE\\LEProc.exe");
        assert_eq!(loaded.wrapper_args, vec!["-runas", "{profile-guid}"]);
    }
}
