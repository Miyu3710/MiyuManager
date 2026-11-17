use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use serde_json::Value;

use crate::launcher::process;

const MAGPIE_PROCESS: &str = "Magpie.exe";
const PROFILE_PREFIX: &str = "MiyuManager · ";

pub fn sync_auto_scale(
    magpie_exe: &Path,
    magpie_args: &[String],
    game_exe: &Path,
    class_name: &str,
    title: &str,
) -> Result<()> {
    #[cfg(not(windows))]
    bail!("Magpie 自动缩放仅支持 Windows");

    if !magpie_exe.is_file() {
        bail!("Magpie 不存在：{}", magpie_exe.display());
    }
    let game_exe = normalize_local_path(&game_exe.to_string_lossy());
    let class_name = normalize_class_name(class_name);
    let config_path = ensure_config_path(magpie_exe, magpie_args)?;

    let config = read_config(&config_path)?;
    if profile_satisfied(&config, &game_exe, &class_name) {
        if magpie_pids(magpie_exe).is_empty() {
            start_magpie(magpie_exe, magpie_args)?;
        }
        return Ok(());
    }

    if !magpie_pids(magpie_exe).is_empty() {
        stop_magpie(magpie_exe)?;
    }
    let mut config = read_config(&config_path)?;
    upsert_profile(&mut config, &game_exe, &class_name, title)?;
    write_config(&config_path, &config)?;
    start_magpie(magpie_exe, magpie_args)?;
    Ok(())
}

pub fn launch_tray(magpie_exe: &Path, magpie_args: &[String]) -> Result<()> {
    start_magpie(magpie_exe, magpie_args)
}

fn ensure_config_path(magpie_exe: &Path, magpie_args: &[String]) -> Result<PathBuf> {
    if let Some(path) = find_config_path(magpie_exe) {
        return Ok(path);
    }

    start_magpie(magpie_exe, magpie_args)?;
    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if find_config_path(magpie_exe).is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    stop_magpie(magpie_exe).ok();
    find_config_path(magpie_exe).context("Magpie 没有生成配置文件")
}

fn find_config_path(magpie_exe: &Path) -> Option<PathBuf> {
    if let Some(parent) = magpie_exe.parent() {
        // Magpie portable mode uses <exe>\config\config.json, not the versioned
        // directory used by the non-portable LocalAppData layout.
        let portable = parent.join("config").join("config.json");
        if portable.is_file() {
            return Some(portable);
        }
    }
    let local = std::env::var_os("LOCALAPPDATA")?;
    find_versioned_config(&PathBuf::from(local).join("Magpie").join("config"))
}

fn find_versioned_config(root: &Path) -> Option<PathBuf> {
    let mut versions = fs::read_dir(root)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let version = name.strip_prefix('v')?.parse::<u32>().ok()?;
            Some((version, entry.path()))
        })
        .collect::<Vec<_>>();
    versions.sort_by_key(|(version, _)| std::cmp::Reverse(*version));
    versions.into_iter().find_map(|(_, directory)| {
        let path = directory.join("config.json");
        path.is_file().then_some(path)
    })
}

fn read_config(path: &Path) -> Result<Value> {
    let text = fs::read_to_string(path)
        .with_context(|| format!("无法读取 Magpie 配置：{}", path.display()))?;
    let config = serde_json::from_str::<Value>(&text).context("Magpie 配置不是有效 JSON")?;
    if !config.is_object() {
        bail!("Magpie 配置根节点不是对象");
    }
    if !config.get("profiles").is_some_and(Value::is_array) {
        bail!("Magpie 配置缺少 profiles 数组");
    }
    Ok(config)
}

fn write_config(path: &Path, config: &Value) -> Result<()> {
    let backup = path.with_file_name("config.json.miyu-backup");
    fs::copy(path, &backup).with_context(|| format!("无法备份 Magpie 配置：{}", path.display()))?;
    let text = serde_json::to_string_pretty(config)?;
    let temp = path.with_file_name("config.json.miyu-tmp");
    fs::write(&temp, text + "\n")
        .with_context(|| format!("无法写入 Magpie 临时配置：{}", temp.display()))?;
    fs::copy(&temp, path).with_context(|| format!("无法替换 Magpie 配置：{}", path.display()))?;
    let _ = fs::remove_file(&temp);
    Ok(())
}

fn profile_satisfied(config: &Value, game_exe: &str, class_name: &str) -> bool {
    config
        .get("profiles")
        .and_then(Value::as_array)
        .is_some_and(|profiles| {
            profiles.iter().any(|profile| {
                profile
                    .get("autoScale")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
                    > 0
                    && profile
                        .get("pathRule")
                        .and_then(Value::as_str)
                        .is_some_and(|path| same_path(path, game_exe))
                    && profile.get("classNameRule").and_then(Value::as_str) == Some(class_name)
            })
        })
}

fn upsert_profile(config: &mut Value, game_exe: &str, class_name: &str, title: &str) -> Result<()> {
    let profiles = config
        .get_mut("profiles")
        .and_then(Value::as_array_mut)
        .context("Magpie 配置缺少 profiles 数组")?;
    let default_profile = profiles
        .first()
        .cloned()
        .context("Magpie 配置缺少默认配置")?;

    let existing_index = profiles
        .iter()
        .enumerate()
        .skip(1)
        .find_map(|(index, profile)| {
            let path = profile.get("pathRule").and_then(Value::as_str)?;
            if !same_path(path, game_exe) {
                return None;
            }
            let same_class =
                profile.get("classNameRule").and_then(Value::as_str) == Some(class_name);
            let managed = profile
                .get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| name.starts_with(PROFILE_PREFIX));
            (same_class || managed).then_some(index)
        });

    let target_index = match existing_index {
        Some(index) => index,
        None => {
            let mut profile = default_profile;
            set_profile_fields(&mut profile, game_exe, class_name, title, true)?;
            profiles.push(profile);
            profiles.len() - 1
        }
    };
    let target = profiles
        .get_mut(target_index)
        .context("Magpie 配置文件生成失败")?;
    set_profile_fields(target, game_exe, class_name, title, false)?;

    // Keep the user's default and unrelated profiles, but remove stale profiles
    // created by MiyuManager for the same executable.
    let mut kept = Vec::with_capacity(profiles.len());
    for (index, profile) in profiles.drain(..).enumerate() {
        let managed_for_game = index != 0
            && index != target_index
            && profile
                .get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| name.starts_with(PROFILE_PREFIX))
            && profile
                .get("pathRule")
                .and_then(Value::as_str)
                .is_some_and(|path| same_path(path, game_exe));
        if !managed_for_game {
            kept.push(profile);
        }
    }
    *profiles = kept;
    Ok(())
}

fn set_profile_fields(
    profile: &mut Value,
    game_exe: &str,
    class_name: &str,
    title: &str,
    is_new: bool,
) -> Result<()> {
    let object = profile.as_object_mut().context("Magpie 配置项不是对象")?;
    if is_new
        || object
            .get("name")
            .and_then(Value::as_str)
            .is_none_or(|name| name.is_empty() || name.starts_with(PROFILE_PREFIX))
    {
        let name = title.trim();
        object.insert(
            "name".to_string(),
            Value::String(format!(
                "{PROFILE_PREFIX}{}",
                if name.is_empty() {
                    Path::new(game_exe)
                        .file_stem()
                        .and_then(|value| value.to_str())
                        .unwrap_or("游戏")
                } else {
                    name
                }
            )),
        );
    }
    object.insert("packaged".to_string(), Value::Bool(false));
    object.insert("pathRule".to_string(), Value::String(game_exe.to_string()));
    object.insert(
        "classNameRule".to_string(),
        Value::String(class_name.to_string()),
    );
    object.insert(
        "launcherPath".to_string(),
        Value::String(game_exe.to_string()),
    );
    object.insert("launchParameters".to_string(), Value::String(String::new()));
    if object.get("autoScale").and_then(Value::as_u64).unwrap_or(0) == 0 {
        object.insert("autoScale".to_string(), Value::from(1));
    }
    Ok(())
}

fn normalize_class_name(class_name: &str) -> String {
    if let Some(inner) = class_name
        .strip_prefix("HwndWrapper[")
        .and_then(|value| value.strip_suffix(']'))
        && let Some((name, guid)) = inner.rsplit_once(";;")
        && is_guid(guid)
    {
        return name.to_string();
    }
    if class_name
        .strip_prefix("Chrome_WidgetWin_")
        .is_some_and(|suffix| {
            !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
        })
    {
        return "Chrome_WidgetWin_1".to_string();
    }
    if class_name.strip_prefix("XWindow_").is_some_and(|suffix| {
        !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
    }) {
        return "XWindow_0".to_string();
    }
    class_name.to_string()
}

fn is_guid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte),
        })
}

fn magpie_pids(magpie_exe: &Path) -> Vec<u32> {
    let expected = magpie_exe.to_string_lossy();
    process::process_ids_with_name(MAGPIE_PROCESS)
        .into_iter()
        .filter(|pid| {
            process::process_image_path(*pid).is_none_or(|path| same_path(&path, &expected))
        })
        .collect()
}

fn stop_magpie(magpie_exe: &Path) -> Result<()> {
    if magpie_pids(magpie_exe).is_empty() {
        return Ok(());
    }
    broadcast_quit();
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if magpie_pids(magpie_exe).is_empty() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    for pid in magpie_pids(magpie_exe) {
        let _ = process::terminate_process(pid);
    }
    std::thread::sleep(Duration::from_millis(300));
    if !magpie_pids(magpie_exe).is_empty() {
        bail!("无法关闭 Magpie，配置尚未重载");
    }
    Ok(())
}

#[cfg(windows)]
fn broadcast_quit() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        HWND_BROADCAST, PostMessageW, RegisterWindowMessageW,
    };

    let name = "WM_MAGPIE_QUIT\0".encode_utf16().collect::<Vec<_>>();
    let message = unsafe { RegisterWindowMessageW(name.as_ptr()) };
    if message != 0 {
        unsafe {
            PostMessageW(HWND_BROADCAST, message, 0, 0);
        }
    }
}

#[cfg(not(windows))]
fn broadcast_quit() {}

fn start_magpie(magpie_exe: &Path, magpie_args: &[String]) -> Result<()> {
    let mut command = Command::new(magpie_exe);
    if magpie_args.is_empty() {
        command.arg("-t");
    } else {
        command.args(magpie_args);
    }
    command
        .current_dir(magpie_exe.parent().unwrap_or_else(|| Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .with_context(|| format!("无法启动 Magpie：{}", magpie_exe.display()))?;
    Ok(())
}

fn same_path(left: &str, right: &str) -> bool {
    normalize_local_path(left).eq_ignore_ascii_case(&normalize_local_path(right))
}

fn normalize_local_path(path: &str) -> String {
    let path = path.replace('/', "\\");
    path.strip_prefix("\\\\?\\UNC\\")
        .map(|rest| format!("\\\\{rest}"))
        .or_else(|| path.strip_prefix("\\\\?\\").map(str::to_string))
        .unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tempfile::TempDir;

    use super::*;

    fn fixture() -> Value {
        json!({
            "profiles": [
                {
                    "scalingMode": 7,
                    "captureMethod": 0,
                    "multiMonitorUsage": 0
                }
            ]
        })
    }

    #[test]
    fn normalizes_magpie_special_window_classes() {
        assert_eq!(
            normalize_class_name("HwndWrapper[Game;;12345678-1234-1234-1234-123456789abc]"),
            "Game"
        );
        assert_eq!(
            normalize_class_name("Chrome_WidgetWin_27"),
            "Chrome_WidgetWin_1"
        );
        assert_eq!(normalize_class_name("XWindow_42"), "XWindow_0");
        assert_eq!(normalize_class_name("UnityWndClass"), "UnityWndClass");
    }

    #[test]
    fn adds_an_auto_scale_profile_and_preserves_the_default() {
        let mut config = fixture();
        upsert_profile(
            &mut config,
            "C:\\Games\\GINKA\\GINKA.exe",
            "UnityWndClass",
            "GINKA",
        )
        .expect("profile");

        let profiles = config["profiles"].as_array().expect("profiles");
        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[0]["scalingMode"], 7);
        assert_eq!(profiles[1]["name"], "MiyuManager · GINKA");
        assert_eq!(profiles[1]["pathRule"], "C:\\Games\\GINKA\\GINKA.exe");
        assert_eq!(profiles[1]["classNameRule"], "UnityWndClass");
        assert_eq!(profiles[1]["autoScale"], 1);
        assert!(profile_satisfied(
            &config,
            "C:\\Games\\GINKA\\GINKA.exe",
            "UnityWndClass"
        ));
    }

    #[test]
    fn updates_the_existing_profile_when_the_window_class_changes() {
        let mut config = fixture();
        upsert_profile(
            &mut config,
            "C:\\Games\\GINKA\\GINKA.exe",
            "OldClass",
            "GINKA",
        )
        .expect("first profile");
        upsert_profile(
            &mut config,
            "C:\\Games\\GINKA\\GINKA.exe",
            "NewClass",
            "GINKA",
        )
        .expect("updated profile");

        let profiles = config["profiles"].as_array().expect("profiles");
        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[1]["classNameRule"], "NewClass");
    }

    #[test]
    fn reads_a_portable_config_before_the_local_app_data_copy() {
        let temp = TempDir::new().expect("temp");
        let exe = temp.path().join("Magpie.exe");
        fs::write(&exe, b"").expect("exe");
        let config = temp.path().join("config").join("config.json");
        fs::create_dir_all(config.parent().expect("parent")).expect("dir");
        fs::write(&config, "{}").expect("config");

        assert_eq!(find_config_path(&exe), Some(config));
    }

    #[test]
    fn picks_the_newest_versioned_config_directory() {
        let temp = TempDir::new().expect("temp");
        for version in [4, 5] {
            let directory = temp.path().join(format!("v{version}"));
            fs::create_dir_all(&directory).expect("dir");
            fs::write(directory.join("config.json"), "{}").expect("config");
        }

        assert_eq!(
            find_versioned_config(temp.path()),
            Some(temp.path().join("v5").join("config.json"))
        );
    }

    #[test]
    fn writes_config_and_keeps_a_backup() {
        let temp = TempDir::new().expect("temp");
        let path = temp.path().join("config.json");
        fs::write(&path, "{\"profiles\":[]}").expect("initial config");
        let config = fixture();

        write_config(&path, &config).expect("write config");
        assert_eq!(
            read_config(&path).expect("read config")["profiles"],
            config["profiles"]
        );
        assert!(temp.path().join("config.json.miyu-backup").is_file());
        assert!(!temp.path().join("config.json.miyu-tmp").exists());
    }

    #[test]
    #[ignore = "manual live probe: requires MIYU_MAGPIE_PROBE_EXE and a visible foreground target window"]
    fn live_starts_magpie_scaling_without_the_main_window() {
        let magpie_exe = PathBuf::from(
            std::env::var_os("MIYU_MAGPIE_PROBE_EXE").expect("MIYU_MAGPIE_PROBE_EXE"),
        );
        let game_exe = std::env::var_os("MIYU_MAGPIE_PROBE_GAME_EXE")
            .expect("MIYU_MAGPIE_PROBE_GAME_EXE")
            .to_string_lossy()
            .to_string();
        let target = process::wait_for_window_by_executable(&game_exe, Duration::from_secs(10))
            .expect("visible target window");
        sync_auto_scale(
            &magpie_exe,
            &["-t".to_string()],
            Path::new(&target.exe_path),
            &target.class_name,
            &target.title,
        )
        .expect("sync profile");

        let magpie = process::wait_for_window_by_class(
            &magpie_exe.to_string_lossy(),
            "Window_Magpie_",
            Duration::from_secs(20),
        )
        .expect("Magpie scaling window");
        assert!(
            magpie.class_name.starts_with("Window_Magpie_"),
            "unexpected Magpie window class: {}",
            magpie.class_name
        );
        assert!(
            process::wait_for_window_by_class(
                &magpie_exe.to_string_lossy(),
                "Magpie_Main",
                Duration::from_millis(100),
            )
            .is_none(),
            "Magpie opened its main window in -t mode"
        );
        stop_magpie(&magpie_exe).expect("stop Magpie");
    }
}
