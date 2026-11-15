pub fn system_proxy() -> Option<String> {
    for key in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Ok(value) = std::env::var(key) {
            let value = value.trim();
            if !value.is_empty() {
                return normalize_proxy(value);
            }
        }
    }
    #[cfg(windows)]
    {
        if let Some(proxy) = windows_proxy() {
            return Some(proxy);
        }
    }
    None
}

pub fn proxy_for_mode(mode: &str, custom_url: &str) -> Option<String> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "direct" => None,
        "custom" => normalize_proxy(custom_url),
        _ => system_proxy(),
    }
}

fn normalize_proxy(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if value.contains("://") {
        Some(value.to_string())
    } else {
        Some(format!("http://{value}"))
    }
}

#[cfg(windows)]
fn windows_proxy() -> Option<String> {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;
    let enabled: u32 = key.get_value("ProxyEnable").ok()?;
    if enabled == 0 {
        return None;
    }
    let server: String = key.get_value("ProxyServer").ok()?;
    let server = server.trim();
    if server.is_empty() {
        return None;
    }
    let address = server
        .split(';')
        .find_map(|entry| {
            let (scheme, value) = entry.split_once('=')?;
            if scheme.eq_ignore_ascii_case("https") || scheme.eq_ignore_ascii_case("http") {
                Some(value.trim())
            } else {
                None
            }
        })
        .unwrap_or(server);
    normalize_proxy(address)
}
