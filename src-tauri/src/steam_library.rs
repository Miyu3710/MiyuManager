use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use anyhow::{Context, Result, bail};
use serde::Serialize;

use crate::scan::{self, ScanCandidate, ScanExclusions, ScanLimits};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamLibraryInfo {
    pub path: String,
    pub app_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamGameScan {
    pub app_id: i64,
    pub name: String,
    pub install_dir: String,
    pub size_on_disk: i64,
    pub last_updated: Option<i64>,
    pub candidates: Vec<ScanCandidate>,
    pub already_imported: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamScanProgress {
    pub job_id: String,
    pub phase: String,
    pub current_library: String,
    pub current_game: String,
    pub completed: usize,
    pub total: usize,
    pub found_candidates: usize,
    pub scanned_dirs: u64,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamScanReport {
    pub steam_root: String,
    pub libraries: Vec<SteamLibraryInfo>,
    pub games: Vec<SteamGameScan>,
    pub errors: Vec<String>,
    pub cancelled: bool,
    pub scanned_dirs: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone)]
struct SteamAppManifest {
    steamapps_dir: PathBuf,
    app_id: i64,
    name: String,
    install_dir: PathBuf,
    size_on_disk: i64,
    last_updated: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum VdfValue {
    String(String),
    Object(BTreeMap<String, VdfValue>),
}

impl VdfValue {
    fn get(&self, key: &str) -> Option<&VdfValue> {
        match self {
            VdfValue::Object(map) => map.get(key),
            VdfValue::String(_) => None,
        }
    }

    fn get_string(&self, key: &str) -> Option<&str> {
        match self.get(key) {
            Some(VdfValue::String(value)) => Some(value),
            _ => None,
        }
    }
}

pub fn discover_steam_root() -> Option<PathBuf> {
    for candidate in registry_steam_paths() {
        if candidate.join("steamapps").is_dir() {
            return Some(candidate);
        }
    }
    fallback_steam_paths()
        .into_iter()
        .find(|candidate| candidate.join("steamapps").is_dir())
}

pub fn steam_library_paths(steam_root: &Path) -> Result<(Vec<PathBuf>, Vec<String>)> {
    let mut paths = vec![steam_root.to_path_buf()];
    let mut errors = Vec::new();
    let library_file = steam_root.join("steamapps").join("libraryfolders.vdf");
    if library_file.is_file() {
        match fs::read_to_string(&library_file) {
            Ok(text) => match parse_vdf(&text) {
                Ok(root) => {
                    for path in library_paths_from_vdf(&root) {
                        paths.push(path);
                    }
                }
                Err(error) => errors.push(format!("无法解析 {}：{error}", library_file.display())),
            },
            Err(error) => errors.push(format!("无法读取 {}：{error}", library_file.display())),
        }
    }
    let mut seen = HashSet::new();
    paths.retain(|path| {
        let key = path.to_string_lossy().to_lowercase();
        seen.insert(key)
    });
    Ok((paths, errors))
}

pub fn scan_steam_libraries(
    job_id: &str,
    cancel: Arc<AtomicBool>,
    exclusions: &ScanExclusions,
    existing_exe_keys: &HashSet<String>,
    existing_app_ids: &HashSet<i64>,
    mut on_progress: impl FnMut(SteamScanProgress),
) -> Result<SteamScanReport> {
    let started = Instant::now();
    let steam_root = discover_steam_root().context(
        "未找到 Steam 安装目录。请确认 Steam 已安装，并且至少有一个 steamapps 库文件夹。",
    )?;
    let (library_roots, mut errors) = steam_library_paths(&steam_root)?;
    let mut libraries = Vec::new();
    let mut manifests = Vec::new();
    let mut seen_apps = HashSet::new();

    for library_root in &library_roots {
        let steamapps = steamapps_dir(library_root);
        if !steamapps.is_dir() {
            continue;
        }
        let mut app_count = 0usize;
        match read_manifests(&steamapps) {
            Ok(found) => {
                for manifest in found {
                    if is_ignored_app(&manifest.name, manifest.app_id) {
                        continue;
                    }
                    if !seen_apps.insert(manifest.app_id) {
                        continue;
                    }
                    app_count += 1;
                    manifests.push(manifest);
                }
            }
            Err(error) => errors.push(format!("无法读取 {}：{error}", steamapps.display())),
        }
        libraries.push(SteamLibraryInfo {
            path: library_root.to_string_lossy().to_string(),
            app_count,
        });
    }

    manifests.sort_by_key(|left| left.name.to_lowercase());
    let total = manifests.len();
    let mut games = Vec::with_capacity(total);
    let mut scanned_dirs = 0u64;
    let mut found_candidates = 0usize;
    let mut cancelled = false;

    for (index, manifest) in manifests.into_iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }
        let library_root = manifest
            .steamapps_dir
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| manifest.steamapps_dir.clone());
        on_progress(SteamScanProgress {
            job_id: job_id.to_string(),
            phase: "scanning".to_string(),
            current_library: library_root.to_string_lossy().to_string(),
            current_game: manifest.name.clone(),
            completed: index,
            total,
            found_candidates,
            scanned_dirs,
            elapsed_ms: started.elapsed().as_millis() as u64,
        });

        let common_root = manifest.steamapps_dir.join("common");
        let result = if manifest.install_dir.is_dir() {
            scan::scan_root_with_limits(
                &manifest.install_dir,
                job_id,
                cancel.clone(),
                exclusions,
                false,
                ScanLimits {
                    max_depth: 6,
                    max_entries: 80_000,
                    compute_size: false,
                },
                |_| {},
            )
        } else {
            Err(anyhow::anyhow!(
                "安装目录不存在：{}",
                manifest.install_dir.display()
            ))
        };

        match result {
            Ok(outcome) => {
                scanned_dirs += outcome.scanned_dirs;
                if outcome.cancelled {
                    cancelled = true;
                }
                let mut candidates = outcome.candidates;
                for candidate in &mut candidates {
                    candidate.root_path = common_root.to_string_lossy().to_string();
                    candidate.suggested_title = manifest.name.clone();
                    if manifest.size_on_disk > 0 {
                        candidate.size_bytes = manifest.size_on_disk;
                        candidate.size_is_estimate = false;
                    }
                    candidate.reason =
                        format!("Steam AppID {} · {}", manifest.app_id, candidate.reason);
                    candidate.already_imported = existing_exe_keys.contains(&candidate.exe_key);
                }
                let already_imported = existing_app_ids.contains(&manifest.app_id)
                    || candidates
                        .iter()
                        .any(|candidate| candidate.already_imported);
                found_candidates += candidates.len();
                let error = if candidates.is_empty() {
                    Some("安装目录中没有找到可启动的 exe".to_string())
                } else {
                    None
                };
                games.push(SteamGameScan {
                    app_id: manifest.app_id,
                    name: manifest.name,
                    install_dir: manifest.install_dir.to_string_lossy().to_string(),
                    size_on_disk: manifest.size_on_disk,
                    last_updated: manifest.last_updated,
                    candidates,
                    already_imported,
                    error,
                });
                if cancelled {
                    break;
                }
            }
            Err(error) => {
                games.push(SteamGameScan {
                    app_id: manifest.app_id,
                    name: manifest.name,
                    install_dir: manifest.install_dir.to_string_lossy().to_string(),
                    size_on_disk: manifest.size_on_disk,
                    last_updated: manifest.last_updated,
                    candidates: Vec::new(),
                    already_imported: false,
                    error: Some(error.to_string()),
                });
            }
        }
    }

    on_progress(SteamScanProgress {
        job_id: job_id.to_string(),
        phase: "done".to_string(),
        current_library: String::new(),
        current_game: String::new(),
        completed: games.len(),
        total,
        found_candidates,
        scanned_dirs,
        elapsed_ms: started.elapsed().as_millis() as u64,
    });

    Ok(SteamScanReport {
        steam_root: steam_root.to_string_lossy().to_string(),
        libraries,
        games,
        errors,
        cancelled,
        scanned_dirs,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

fn steamapps_dir(library_root: &Path) -> PathBuf {
    if library_root
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("steamapps"))
    {
        library_root.to_path_buf()
    } else {
        library_root.join("steamapps")
    }
}

fn read_manifests(steamapps: &Path) -> Result<Vec<SteamAppManifest>> {
    let mut manifests = Vec::new();
    for entry in fs::read_dir(steamapps)
        .with_context(|| format!("无法读取 Steam 库：{}", steamapps.display()))?
    {
        let entry = entry?;
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if !file_name.starts_with("appmanifest_") || !file_name.ends_with(".acf") {
            continue;
        }
        let text = match fs::read_to_string(entry.path()) {
            Ok(text) => text,
            Err(_) => continue,
        };
        let Ok(root) = parse_vdf(&text) else {
            continue;
        };
        let Some(app) = root.get("AppState") else {
            continue;
        };
        let Some(app_id) = app.get_string("appid").and_then(|value| value.parse().ok()) else {
            continue;
        };
        let Some(name) = app.get_string("name") else {
            continue;
        };
        let Some(installdir) = app.get_string("installdir") else {
            continue;
        };
        let install_dir = steamapps.join("common").join(installdir);
        if !install_dir.is_dir() {
            continue;
        }
        manifests.push(SteamAppManifest {
            steamapps_dir: steamapps.to_path_buf(),
            app_id,
            name: name.to_string(),
            install_dir,
            size_on_disk: app
                .get_string("SizeOnDisk")
                .and_then(|value| value.parse().ok())
                .unwrap_or(0),
            last_updated: app
                .get_string("LastUpdated")
                .and_then(|value| value.parse().ok()),
        });
    }
    Ok(manifests)
}

fn is_ignored_app(name: &str, app_id: i64) -> bool {
    if matches!(app_id, 228980 | 1070560 | 1391110 | 1628350) {
        return true;
    }
    let name = name.to_lowercase();
    [
        "steamworks",
        "steam linux runtime",
        "proton",
        "steamvr",
        "redistributable",
        "dedicated server",
        "wallpaper engine",
    ]
    .iter()
    .any(|marker| name.contains(marker))
}

fn library_paths_from_vdf(root: &VdfValue) -> Vec<PathBuf> {
    let Some(container) = root
        .get("libraryfolders")
        .or_else(|| root.get("LibraryFolders"))
    else {
        return Vec::new();
    };
    let VdfValue::Object(entries) = container else {
        return Vec::new();
    };
    let mut paths = Vec::new();
    for (key, value) in entries {
        match value {
            VdfValue::String(path) if key.chars().all(|character| character.is_ascii_digit()) => {
                paths.push(PathBuf::from(path));
            }
            VdfValue::Object(map) => {
                if let Some(VdfValue::String(path)) = map.get("path") {
                    paths.push(PathBuf::from(path));
                }
            }
            _ => {}
        }
    }
    paths
}

fn parse_vdf(input: &str) -> Result<VdfValue> {
    let mut parser = VdfParser {
        chars: input.chars().collect(),
        position: 0,
    };
    let mut map = BTreeMap::new();
    parser.skip_space()?;
    while !parser.is_end() {
        let key = parser.parse_key()?;
        parser.skip_space()?;
        if parser.peek() == Some('[') {
            parser.skip_condition()?;
            parser.skip_space()?;
        }
        let value = parser.parse_value()?;
        map.insert(key, value);
        parser.skip_space()?;
    }
    Ok(VdfValue::Object(map))
}

struct VdfParser {
    chars: Vec<char>,
    position: usize,
}

impl VdfParser {
    fn is_end(&self) -> bool {
        self.position >= self.chars.len()
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.position).copied()
    }

    fn next(&mut self) -> Option<char> {
        let value = self.peek()?;
        self.position += 1;
        Some(value)
    }

    fn skip_space(&mut self) -> Result<()> {
        loop {
            while self.peek().is_some_and(char::is_whitespace) {
                self.position += 1;
            }
            if self.peek() == Some('/') && self.chars.get(self.position + 1) == Some(&'/') {
                while self.peek().is_some_and(|value| value != '\n') {
                    self.position += 1;
                }
                continue;
            }
            return Ok(());
        }
    }

    fn parse_key(&mut self) -> Result<String> {
        if self.peek() == Some('"') {
            return self.parse_string();
        }
        bail!("VDF 键格式无效")
    }

    fn parse_value(&mut self) -> Result<VdfValue> {
        if self.peek() == Some('"') {
            return Ok(VdfValue::String(self.parse_string()?));
        }
        if self.peek() != Some('{') {
            bail!("VDF 值格式无效");
        }
        self.next();
        let mut map = BTreeMap::new();
        loop {
            self.skip_space()?;
            if self.peek() == Some('}') {
                self.next();
                break;
            }
            if self.is_end() {
                bail!("VDF 对象没有闭合");
            }
            let key = self.parse_key()?;
            self.skip_space()?;
            if self.peek() == Some('[') {
                self.skip_condition()?;
                self.skip_space()?;
            }
            let value = self.parse_value()?;
            map.insert(key, value);
        }
        Ok(VdfValue::Object(map))
    }

    fn parse_string(&mut self) -> Result<String> {
        if self.next() != Some('"') {
            bail!("VDF 字符串格式无效");
        }
        let mut value = String::new();
        while let Some(character) = self.next() {
            match character {
                '"' => return Ok(value),
                '\\' => {
                    if let Some(escaped) = self.next() {
                        value.push(escaped);
                    }
                }
                _ => value.push(character),
            }
        }
        bail!("VDF 字符串没有闭合")
    }

    fn skip_condition(&mut self) -> Result<()> {
        if self.next() != Some('[') {
            bail!("VDF 条件格式无效");
        }
        while let Some(character) = self.next() {
            if character == ']' {
                return Ok(());
            }
        }
        bail!("VDF 条件没有闭合")
    }
}

#[cfg(windows)]
fn registry_steam_paths() -> Vec<PathBuf> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

    let mut paths = Vec::new();
    if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam")
        && let Ok(value) = key.get_value::<String, _>("SteamPath")
    {
        paths.push(PathBuf::from(value.replace('/', "\\")));
    }
    for subkey in [
        "SOFTWARE\\WOW6432Node\\Valve\\Steam",
        "SOFTWARE\\Valve\\Steam",
    ] {
        if let Ok(key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(subkey)
            && let Ok(value) = key.get_value::<String, _>("InstallPath")
        {
            paths.push(PathBuf::from(value.replace('/', "\\")));
        }
    }
    paths
}

#[cfg(not(windows))]
fn registry_steam_paths() -> Vec<PathBuf> {
    Vec::new()
}

fn fallback_steam_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for variable in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Some(root) = std::env::var_os(variable) {
            paths.push(PathBuf::from(root).join("Steam"));
        }
    }
    paths.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    paths.push(PathBuf::from(r"C:\Program Files\Steam"));
    paths
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_text(app_id: i64, name: &str, install_dir: &str) -> String {
        format!(
            r#""AppState"
{{
  "appid" "{app_id}"
  "name" "{name}"
  "installdir" "{install_dir}"
  "SizeOnDisk" "1024"
  "LastUpdated" "1700000000"
}}"#
        )
    }

    #[test]
    fn parses_modern_and_legacy_library_folders() {
        let modern = r#""libraryfolders"
{
  "0" { "path" "C:\\Program Files (x86)\\Steam" "apps" { "324160" "1" } }
  "1" { "path" "D:\\SteamLibrary" }
}"#;
        let root = parse_vdf(modern).expect("modern vdf");
        let paths = library_paths_from_vdf(&root);
        assert_eq!(paths.len(), 2);
        assert_eq!(paths[1], PathBuf::from(r"D:\SteamLibrary"));

        let legacy = r#""LibraryFolders"
{
  "TimeNextStatsReport" "1"
  "1" "E:\\Games\\SteamLibrary"
}"#;
        let root = parse_vdf(legacy).expect("legacy vdf");
        let paths = library_paths_from_vdf(&root);
        assert_eq!(paths, vec![PathBuf::from(r"E:\Games\SteamLibrary")]);
    }

    #[test]
    fn reads_manifests_and_ignores_tools() {
        let temp = tempfile::TempDir::new().expect("temp");
        let library = temp.path().join("SteamLibrary");
        let steamapps = library.join("steamapps");
        let common = steamapps.join("common");
        fs::create_dir_all(common.join("CLANNAD")).expect("game dir");
        fs::create_dir_all(common.join("Steamworks Shared")).expect("tool dir");
        fs::write(
            steamapps.join("appmanifest_324160.acf"),
            manifest_text(324160, "CLANNAD", "CLANNAD"),
        )
        .expect("manifest");
        fs::write(
            steamapps.join("appmanifest_228980.acf"),
            manifest_text(
                228980,
                "Steamworks Common Redistributables",
                "Steamworks Shared",
            ),
        )
        .expect("tool manifest");

        let manifests = read_manifests(&steamapps).expect("manifests");
        assert_eq!(manifests.len(), 2);
        assert!(
            manifests
                .iter()
                .any(|manifest| manifest.app_id == 324160 && manifest.name == "CLANNAD")
        );
        assert!(is_ignored_app("Steamworks Common Redistributables", 228980));
    }

    #[test]
    fn parses_manifest_fields() {
        let root = parse_vdf(&manifest_text(324160, "CLANNAD", "CLANNAD")).expect("vdf");
        let app = root.get("AppState").expect("AppState");
        assert_eq!(app.get_string("appid"), Some("324160"));
        assert_eq!(app.get_string("name"), Some("CLANNAD"));
        assert_eq!(app.get_string("SizeOnDisk"), Some("1024"));
    }

    #[test]
    #[ignore = "requires a local Steam installation"]
    fn live_detects_steam_libraries_and_manifests() {
        let root = discover_steam_root().expect("steam root");
        let (libraries, errors) = steam_library_paths(&root).expect("libraries");
        assert!(errors.is_empty());
        assert!(libraries.len() >= 1);
        let mut has_manifest = false;
        for library in &libraries {
            let steamapps = steamapps_dir(library);
            if !steamapps.is_dir() {
                continue;
            }
            if !read_manifests(&steamapps).expect("manifests").is_empty() {
                has_manifest = true;
            }
        }
        assert!(has_manifest);
    }

    #[test]
    #[ignore = "requires a local Steam copy of CLANNAD"]
    fn live_scans_one_steam_game_for_executables() {
        let root = discover_steam_root().expect("steam root");
        let (libraries, _) = steam_library_paths(&root).expect("libraries");
        let mut manifest = None;
        for library in libraries {
            let steamapps = steamapps_dir(&library);
            if !steamapps.is_dir() {
                continue;
            }
            if let Some(found) = read_manifests(&steamapps)
                .expect("manifests")
                .into_iter()
                .find(|manifest| manifest.app_id == 324160)
            {
                manifest = Some(found);
                break;
            }
        }
        let manifest = manifest.expect("CLANNAD manifest");
        let outcome = scan::scan_root_with_limits(
            &manifest.install_dir,
            "live-steam-scan",
            Arc::new(AtomicBool::new(false)),
            &ScanExclusions::default(),
            false,
            ScanLimits {
                max_depth: 6,
                max_entries: 80_000,
                compute_size: false,
            },
            |_| {},
        )
        .expect("scan");
        assert!(!outcome.candidates.is_empty());
    }
}
