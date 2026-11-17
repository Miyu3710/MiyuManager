use serde_json::json;
use tauri::Runtime;
use tauri::plugin::{Builder, TauriPlugin};
use url::Url;

use crate::diagnostics;

pub fn navigation_guard<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("miyu-navigation-guard")
        .on_navigation(|webview, url| {
            let allowed = is_allowed_navigation(url);
            if !allowed {
                diagnostics::event(
                    "warn",
                    "navigation_blocked",
                    "已阻止 WebView 导航到应用外部地址",
                    json!({
                        "window": webview.label(),
                        "url": url.as_str(),
                    }),
                );
            }
            allowed
        })
        .build()
}

fn is_allowed_navigation(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") => true,
            Some("localhost") => url.port_or_known_default() == Some(1420),
            _ => false,
        },
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::is_allowed_navigation;
    use url::Url;

    #[test]
    fn allows_only_the_local_application_origins() {
        assert!(is_allowed_navigation(
            &Url::parse("http://tauri.localhost/index.html").expect("url")
        ));
        assert!(is_allowed_navigation(
            &Url::parse("http://localhost:1420/#/library").expect("url")
        ));
        assert!(!is_allowed_navigation(
            &Url::parse("https://example.com/").expect("url")
        ));
        assert!(!is_allowed_navigation(
            &Url::parse("http://localhost:9000/").expect("url")
        ));
    }
}
