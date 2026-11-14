use std::cell::Cell;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Result;
use serde::Serialize;
use walkdir::{DirEntry, WalkDir};

const IGNORED_DIRS: &[&str] = &[
    "$recycle.bin",
    "system volume information",
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "__macosx",
    "redist",
    "_commonredist",
    "directx",
    "directx9",
    "dotnet",
    "vcredist",
    "windows",
    "winsxs",
    "installer",
    "recovery",
    "perflogs",
    "programdata",
    "temp",
    "tmp",
];

const IGNORED_EXE_PREFIXES: &[&str] = &[
    "unins",
    "uninstall",
    "setup",
    "install",
    "vc_redist",
    "vcredist",
    "dxsetup",
    "directx",
    "dxwebsetup",
    "crash",
    "unitycrashhandler",
    "notification_helper",
    "elevate",
    "7z",
    "winrar",
    "python",
    "node",
    "ffmpeg",
    "leproc",
    "locale",
    "ntlea",
    "ntleas",
    "config",
    "settings",
    "updater",
];

const COMMON_GAME_STEMS: &[&str] = &[
    "game",
    "start",
    "launch",
    "play",
    "main",
    "app",
    "visualnovel",
    "vn",
    "adv",
];

const STRONG_ASSETS: &[&str] = &[
    "xp3", "arc", "pak", "rpa", "pck", "gpk", "bgi", "cpk", "ks", "scn", "dat",
];

const LOOSE_ASSETS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "bmp", "ogg", "mp3", "wav", "flac", "mp4", "mkv", "avi", "ttf",
    "otf",
];

const GENERIC_DIRS: &[&str] = &[
    "bin", "x64", "win64", "win32", "game", "data", "files", "contents", "build", "release", "pc",
    "app", "launcher",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCandidate {
    pub id: String,
    pub exe_key: String,
    pub exe_path: String,
    pub working_dir: String,
    pub root_path: String,
    pub suggested_title: String,
    pub file_size_bytes: i64,
    pub size_bytes: i64,
    pub size_is_estimate: bool,
    pub confidence: String,
    pub reason: String,
    pub already_imported: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub job_id: String,
    pub root_path: String,
    pub phase: String,
    pub scanned_dirs: u64,
    pub found_candidates: usize,
    pub current_path: String,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone)]
pub struct ScanOutcome {
    pub candidates: Vec<ScanCandidate>,
    pub cancelled: bool,
    pub scanned_dirs: u64,
    pub skipped_dirs: u64,
    pub truncated: bool,
    pub duration_ms: u64,
}

struct ActiveScan {
    job_id: String,
    cancel: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct ScanCoordinator {
    active: Mutex<Option<ActiveScan>>,
}

impl ScanCoordinator {
    pub fn start(&self, job_id: String) -> Result<Arc<AtomicBool>, String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "扫描状态不可用".to_string())?;
        if let Some(current) = active.as_ref() {
            return Err(format!("已有扫描任务正在运行：{}", current.job_id));
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some(ActiveScan {
            job_id,
            cancel: cancel.clone(),
        });
        Ok(cancel)
    }

    pub fn cancel(&self) -> bool {
        let Ok(active) = self.active.lock() else {
            return false;
        };
        if let Some(current) = active.as_ref() {
            current.cancel.store(true, Ordering::Relaxed);
            true
        } else {
            false
        }
    }

    pub fn finish(&self, job_id: &str) {
        let Ok(mut active) = self.active.lock() else {
            return;
        };
        if active
            .as_ref()
            .is_some_and(|current| current.job_id == job_id)
        {
            *active = None;
        }
    }
}

#[derive(Default)]
struct DirFacts {
    strong_assets: usize,
    loose_assets: usize,
    config_files: usize,
    exe_count: usize,
    total_files: usize,
}

pub fn scan_root(
    root: &Path,
    job_id: &str,
    cancel: Arc<AtomicBool>,
    mut on_progress: impl FnMut(ScanProgress),
) -> Result<ScanOutcome> {
    let started = Instant::now();
    let root_path = path_string(root);
    let skipped_dirs = Cell::new(0u64);
    let mut scanned_dirs = 0u64;
    let mut visited_entries = 0u64;
    let mut truncated = false;
    let mut cancelled = false;
    let mut candidates_by_dir: HashMap<PathBuf, Vec<(i32, Vec<String>, PathBuf)>> = HashMap::new();
    let mut facts_cache: HashMap<PathBuf, DirFacts> = HashMap::new();
    let mut last_progress = Instant::now() - Duration::from_secs(1);

    let walker = WalkDir::new(root)
        .follow_links(false)
        .max_depth(16)
        .into_iter()
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            if entry.file_type().is_dir() && is_ignored_dir(entry) {
                skipped_dirs.set(skipped_dirs.get() + 1);
                return false;
            }
            true
        });

    for entry in walker {
        if cancel.load(Ordering::Relaxed) {
            cancelled = true;
            break;
        }

        visited_entries += 1;
        if visited_entries > 250_000 {
            truncated = true;
            break;
        }

        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        if entry.file_type().is_dir() {
            scanned_dirs += 1;
            if last_progress.elapsed() >= Duration::from_millis(90) {
                let found = candidates_by_dir.values().map(Vec::len).sum();
                on_progress(ScanProgress {
                    job_id: job_id.to_string(),
                    root_path: root_path.clone(),
                    phase: "walking".to_string(),
                    scanned_dirs,
                    found_candidates: found,
                    current_path: path_string(entry.path()),
                    elapsed_ms: started.elapsed().as_millis() as u64,
                });
                last_progress = Instant::now();
            }
            continue;
        }

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        if !has_exe_extension(path) || is_ignored_exe(path) {
            continue;
        }

        let Some(parent) = path.parent() else {
            continue;
        };
        let parent = parent.to_path_buf();
        let facts = facts_cache
            .entry(parent.clone())
            .or_insert_with(|| read_dir_facts(&parent));
        let (score, reasons) = score_candidate(path, root, facts);
        if score < 38 {
            continue;
        }

        let list = candidates_by_dir.entry(parent).or_default();
        list.push((score, reasons, path.to_path_buf()));
        list.sort_by_key(|left| std::cmp::Reverse(left.0));
        list.truncate(3);

        if last_progress.elapsed() >= Duration::from_millis(90) {
            let found = candidates_by_dir.values().map(Vec::len).sum();
            on_progress(ScanProgress {
                job_id: job_id.to_string(),
                root_path: root_path.clone(),
                phase: "walking".to_string(),
                scanned_dirs,
                found_candidates: found,
                current_path: path_string(path),
                elapsed_ms: started.elapsed().as_millis() as u64,
            });
            last_progress = Instant::now();
        }
    }

    let mut candidates = Vec::new();
    for (working_dir, entries) in candidates_by_dir {
        for (score, reasons, exe_path) in entries {
            let (size_bytes, size_is_estimate) = directory_size(&working_dir, &cancel);
            let file_size_bytes = fs::metadata(&exe_path)
                .map(|metadata| metadata.len() as i64)
                .unwrap_or(0);
            let suggested_title = suggested_title(&working_dir, &exe_path);
            let exe_path_string = path_string(&exe_path);
            let exe_key = exe_path_string.to_lowercase();
            let confidence = if score >= 75 {
                "high"
            } else if score >= 52 {
                "medium"
            } else {
                "low"
            };
            candidates.push(ScanCandidate {
                id: exe_key.clone(),
                exe_key,
                exe_path: exe_path_string,
                working_dir: path_string(&working_dir),
                root_path: root_path.clone(),
                suggested_title,
                file_size_bytes,
                size_bytes,
                size_is_estimate,
                confidence: confidence.to_string(),
                reason: reasons.join(" · "),
                already_imported: false,
            });
        }
    }

    let confidence_rank = |value: &str| match value {
        "high" => 0,
        "medium" => 1,
        _ => 2,
    };
    candidates.sort_by(|left, right| {
        confidence_rank(&left.confidence)
            .cmp(&confidence_rank(&right.confidence))
            .then_with(|| right.size_bytes.cmp(&left.size_bytes))
            .then_with(|| left.suggested_title.cmp(&right.suggested_title))
    });

    Ok(ScanOutcome {
        candidates,
        cancelled,
        scanned_dirs,
        skipped_dirs: skipped_dirs.get(),
        truncated,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

fn has_exe_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
}

fn is_ignored_dir(entry: &DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
    if name.starts_with('.') || name.starts_with('$') {
        return true;
    }
    IGNORED_DIRS.contains(&name.as_str()) || name.contains("_commonredist")
}

fn is_ignored_exe(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return true;
    };
    let name = name.to_ascii_lowercase();
    IGNORED_EXE_PREFIXES
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

fn read_dir_facts(dir: &Path) -> DirFacts {
    let mut facts = DirFacts::default();
    let Ok(entries) = fs::read_dir(dir) else {
        return facts;
    };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        facts.total_files += 1;
        let path = entry.path();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if extension == "exe" {
            facts.exe_count += 1;
        } else if STRONG_ASSETS.contains(&extension.as_str()) {
            facts.strong_assets += 1;
        } else if LOOSE_ASSETS.contains(&extension.as_str()) {
            facts.loose_assets += 1;
        } else if extension == "bin" {
            let large = entry
                .metadata()
                .map(|metadata| metadata.len() > 1_000_000)
                .unwrap_or(false);
            if large {
                facts.strong_assets += 1;
            } else {
                facts.loose_assets += 1;
            }
        }
        if matches!(extension.as_str(), "ini" | "cfg" | "txt" | "json") {
            facts.config_files += 1;
        }
    }
    facts
}

fn score_candidate(path: &Path, root: &Path, facts: &DirFacts) -> (i32, Vec<String>) {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let folder = path
        .parent()
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let normalized_stem = normalize_compare(&stem);
    let normalized_folder = normalize_compare(&folder);
    let file_size = fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let depth = path
        .strip_prefix(root)
        .map(|relative| relative.components().count())
        .unwrap_or(0);

    let mut score = 20i32;
    let mut reasons: Vec<String> = Vec::new();

    if COMMON_GAME_STEMS.contains(&stem.as_str()) {
        score += 34;
        reasons.push("常见主程序名".to_string());
    }
    if normalized_stem.len() >= 4
        && (normalized_folder.contains(&normalized_stem)
            || normalized_stem.contains(&normalized_folder))
    {
        score += 18;
        reasons.push("文件名与目录匹配".to_string());
    }
    if facts.strong_assets > 0 {
        score += 22 + (facts.strong_assets.min(3) as i32 * 2);
        reasons.push("目录含游戏资源".to_string());
    } else if facts.loose_assets >= 3 {
        score += 8;
        reasons.push("目录含媒体资源".to_string());
    }
    if file_size > 5_000_000 {
        score += 14;
    } else if file_size > 1_000_000 {
        score += 10;
    } else if file_size > 256_000 {
        score += 5;
    }
    if file_size < 32_000 {
        score -= 18;
    }
    if depth <= 3 {
        score += 8;
    } else if depth >= 7 {
        score -= 6;
    }
    if has_cjk(&folder) || has_cjk(&stem) {
        score += 6;
    }
    if matches!(folder.as_str(), "bin" | "x64" | "win64" | "win32") {
        score += 4;
    }
    if facts.total_files > 20 {
        score += 4;
    }
    if facts.config_files > 0 {
        score += 2;
    }
    if matches!(
        stem.as_str(),
        "launcher"
            | "config"
            | "settings"
            | "update"
            | "updater"
            | "tool"
            | "editor"
            | "benchmark"
            | "sample"
            | "manual"
            | "readme"
            | "voice"
            | "sound"
            | "movie"
            | "opening"
            | "ending"
    ) {
        score -= 35;
        reasons.push("辅助程序".to_string());
    }

    (score.clamp(0, 100), reasons)
}

fn normalize_compare(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn has_cjk(value: &str) -> bool {
    value.chars().any(|character| {
        matches!(character, '\u{3040}'..='\u{30ff}' | '\u{4e00}'..='\u{9fff}' | '\u{ac00}'..='\u{d7af}')
    })
}

fn directory_size(dir: &Path, cancel: &AtomicBool) -> (i64, bool) {
    let mut total = 0u64;
    let mut files = 0u64;
    let mut estimate = false;

    for entry in WalkDir::new(dir)
        .follow_links(false)
        .max_depth(8)
        .into_iter()
        .filter_map(Result::ok)
    {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        if entry.file_type().is_file() {
            files += 1;
            if files > 50_000 {
                estimate = true;
                break;
            }
            if let Ok(metadata) = entry.metadata() {
                total = total.saturating_add(metadata.len());
            }
        }
    }

    (total as i64, estimate)
}

fn suggested_title(working_dir: &Path, exe_path: &Path) -> String {
    let mut folder = working_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_string();

    let mut current = working_dir;
    for _ in 0..2 {
        if !GENERIC_DIRS.contains(&folder.to_ascii_lowercase().as_str()) {
            break;
        }
        let Some(parent) = current.parent() else {
            break;
        };
        let Some(parent_name) = parent.file_name().and_then(|value| value.to_str()) else {
            break;
        };
        folder = parent_name.to_string();
        current = parent;
    }

    if folder.trim().is_empty() || GENERIC_DIRS.contains(&folder.to_ascii_lowercase().as_str()) {
        folder = exe_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("未命名游戏")
            .to_string();
    }

    let cleaned = clean_title(&folder);
    let mut characters = cleaned.chars();
    let shortened: String = characters.by_ref().take(200).collect();
    if shortened.is_empty() {
        "未命名游戏".to_string()
    } else {
        shortened
    }
}

fn clean_title(raw: &str) -> String {
    let mut value = collapse_spaces(&raw.trim().replace('_', " "));
    loop {
        let trimmed = value.trim_end();
        let (open, close) = if trimmed.ends_with(']') {
            (trimmed.rfind('['), ']')
        } else if trimmed.ends_with(')') {
            (trimmed.rfind('('), ')')
        } else {
            break;
        };
        let Some(open) = open else {
            break;
        };
        if open == 0 || !trimmed.ends_with(close) {
            break;
        }
        let tag = trimmed[open + 1..trimmed.len() - 1].to_ascii_lowercase();
        let removable = [
            "汉化",
            "中文",
            "english",
            "japanese",
            "patch",
            "crack",
            "uncensored",
            "repack",
            "v1",
            "v2",
            "v3",
            "full",
            "demo",
            "trial",
        ]
        .iter()
        .any(|marker| tag.contains(marker));
        if !removable {
            break;
        }
        value = trimmed[..open].trim_end().to_string();
    }

    if value.trim().is_empty() {
        raw.trim().to_string()
    } else {
        value.trim().to_string()
    }
}

fn collapse_spaces(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_exe(path: &Path, bytes: usize) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        fs::write(path, vec![0u8; bytes]).expect("exe");
    }

    #[test]
    fn scans_nested_games_and_ignores_redistributables() {
        let temp = TempDir::new().expect("temp");
        let root = temp.path().join("library");

        write_exe(&root.join("Game A").join("game.exe"), 300_000);
        fs::write(root.join("Game A").join("data.xp3"), vec![0u8; 4096]).expect("xp3");
        write_exe(
            &root
                .join("Game A")
                .join("_CommonRedist")
                .join("vcredist_x64.exe"),
            200_000,
        );
        write_exe(&root.join("Game B").join("start.exe"), 200_000);
        fs::write(root.join("Game B").join("scene.pak"), vec![0u8; 2048]).expect("pak");
        write_exe(&root.join("Game B").join("tool.exe"), 10_000);
        write_exe(&root.join("Game C").join("bin").join("main.exe"), 500_000);
        fs::write(root.join("Game C").join("data.pck"), vec![0u8; 4096]).expect("pck");
        fs::create_dir_all(root.join("Empty")).expect("empty");
        fs::write(root.join("Empty").join("readme.txt"), "nothing").expect("readme");

        let outcome = scan_root(
            &root,
            "test",
            Arc::new(AtomicBool::new(false)),
            |_progress| {},
        )
        .expect("scan");

        let titles = outcome
            .candidates
            .iter()
            .map(|candidate| candidate.suggested_title.as_str())
            .collect::<Vec<_>>();
        assert!(titles.contains(&"Game A"));
        assert!(titles.contains(&"Game B"));
        assert!(titles.contains(&"Game C"));
        assert!(
            !outcome
                .candidates
                .iter()
                .any(|candidate| candidate.exe_path.to_ascii_lowercase().contains("vcredist"))
        );
        assert!(outcome.scanned_dirs >= 4);
    }

    #[test]
    fn stops_when_cancelled() {
        let temp = TempDir::new().expect("temp");
        let root = temp.path().join("library");
        write_exe(&root.join("Game").join("game.exe"), 128_000);
        let cancel = Arc::new(AtomicBool::new(true));

        let outcome = scan_root(&root, "test", cancel, |_progress| {}).expect("scan");
        assert!(outcome.cancelled);
        assert!(outcome.candidates.is_empty());
    }

    #[test]
    fn finds_one_hundred_fixture_games() {
        let temp = TempDir::new().expect("temp");
        let root = temp.path().join("library");
        for index in 0..100 {
            let folder = root.join(format!("Fixture {index:03}"));
            write_exe(&folder.join("game.exe"), 64 * 1024);
            fs::write(folder.join("data.xp3"), vec![0u8; 128]).expect("asset");
        }

        let outcome = scan_root(
            &root,
            "test",
            Arc::new(AtomicBool::new(false)),
            |_progress| {},
        )
        .expect("scan");
        assert_eq!(outcome.candidates.len(), 100);
        assert!(
            outcome
                .candidates
                .iter()
                .all(|candidate| candidate.confidence == "high")
        );
    }

    #[test]
    fn handles_spaces_and_deep_cjk_paths() {
        let temp = TempDir::new().expect("temp");
        let root = temp.path().join("library");
        let game = root.join("层一").join("层二").join("Game With Spaces");
        write_exe(&game.join("game.exe"), 240_000);
        fs::write(game.join("data.xp3"), vec![0u8; 512]).expect("asset");

        let outcome = scan_root(
            &root,
            "test",
            Arc::new(AtomicBool::new(false)),
            |_progress| {},
        )
        .expect("scan");
        assert_eq!(outcome.candidates.len(), 1);
        let candidate = &outcome.candidates[0];
        assert_eq!(candidate.suggested_title, "Game With Spaces");
        assert!(candidate.exe_path.contains("Game With Spaces"));
        assert!(candidate.working_dir.contains("层一"));
    }
}
