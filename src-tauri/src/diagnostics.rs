use std::backtrace::Backtrace;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::panic::{self, PanicHookInfo};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once, OnceLock};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const LOG_FILE: &str = "miyumanager.jsonl";
const CRASH_PREFIX: &str = "crash-";
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const LOG_GENERATIONS: u8 = 3;

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();
static INSTALL_PANIC_HOOK: Once = Once::new();
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn init(data_dir: &Path) -> Result<()> {
    let log_dir = data_dir.join("logs");
    fs::create_dir_all(&log_dir)
        .with_context(|| format!("无法创建日志目录 {}", log_dir.display()))?;
    let _ = LOG_DIR.set(log_dir.clone());
    install_panic_hook();
    event(
        "info",
        "app_start",
        "MiyuManager 启动",
        json!({"version": env!("CARGO_PKG_VERSION")}),
    );
    Ok(())
}

pub fn log_dir() -> Option<PathBuf> {
    LOG_DIR.get().cloned()
}

pub fn event(level: &str, kind: &str, message: &str, fields: Value) {
    let record = json!({
        "timestamp": Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "level": level,
        "event": kind,
        "message": truncate(message, 4_000),
        "version": env!("CARGO_PKG_VERSION"),
        "fields": fields,
    });
    write_json_line(&record, None);
}

fn install_panic_hook() {
    INSTALL_PANIC_HOOK.call_once(|| {
        let previous = panic::take_hook();
        panic::set_hook(Box::new(move |info| {
            record_panic(info);
            previous(info);
        }));
    });
}

fn record_panic(info: &PanicHookInfo<'_>) {
    let message = info
        .payload()
        .downcast_ref::<&str>()
        .map(|value| (*value).to_string())
        .or_else(|| info.payload().downcast_ref::<String>().cloned())
        .unwrap_or_else(|| "未知恐慌信息".to_string());
    let location = info.location().map(|location| {
        json!({
            "file": location.file(),
            "line": location.line(),
            "column": location.column(),
        })
    });
    let thread = std::thread::current()
        .name()
        .unwrap_or("unnamed")
        .to_string();
    let backtrace = Backtrace::force_capture().to_string();
    let crash = json!({
        "timestamp": Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "version": env!("CARGO_PKG_VERSION"),
        "thread": thread,
        "message": truncate(&message, 16_000),
        "location": location,
        "backtrace": truncate(&backtrace, 32_000),
    });
    let Some(directory) = log_dir() else {
        return;
    };
    let stamp = Utc::now().format("%Y%m%d-%H%M%S-%3f");
    let path = directory.join(format!("{CRASH_PREFIX}{stamp}.json"));
    let _ = fs::write(path, serde_json::to_vec_pretty(&crash).unwrap_or_default());
    write_json_line(
        &json!({
            "timestamp": crash["timestamp"],
            "level": "fatal",
            "event": "process_panic",
            "message": "进程发生恐慌",
            "version": env!("CARGO_PKG_VERSION"),
            "fields": {"thread": crash["thread"], "location": crash["location"]},
        }),
        None,
    );
}

fn write_json_line(record: &Value, directory: Option<&Path>) {
    let Some(directory) = directory.map(Path::to_path_buf).or_else(log_dir) else {
        return;
    };
    let _guard = WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let path = directory.join(LOG_FILE);
    rotate_if_needed(&directory, &path);
    let Ok(mut line) = serde_json::to_vec(record) else {
        return;
    };
    line.push(b'\n');
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(&line);
    }
}

fn rotate_if_needed(directory: &Path, path: &Path) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.len() < MAX_LOG_BYTES {
        return;
    }
    for generation in (1..LOG_GENERATIONS).rev() {
        let from = directory.join(format!("miyumanager.{generation}.jsonl"));
        let to = directory.join(format!("miyumanager.{}.jsonl", generation + 1));
        if from.exists() {
            let _ = fs::rename(from, to);
        }
    }
    let _ = fs::rename(path, directory.join("miyumanager.1.jsonl"));
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendError {
    pub kind: String,
    pub message: String,
    #[serde(default)]
    pub stack: Option<String>,
    #[serde(default)]
    pub component_stack: Option<String>,
    #[serde(default)]
    pub route: Option<String>,
}

pub fn record_frontend_error(input: FrontendError) {
    event(
        "error",
        "frontend_error",
        &input.message,
        json!({
            "kind": truncate(&input.kind, 80),
            "stack": input.stack.as_deref().map(|value| truncate(value, 20_000)),
            "componentStack": input.component_stack.as_deref().map(|value| truncate(value, 20_000)),
            "route": input.route.as_deref().map(|value| truncate(value, 2_000)),
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::truncate;

    #[test]
    fn truncates_diagnostic_text_by_characters() {
        assert_eq!(truncate("樱纸", 1), "樱");
        assert_eq!(truncate("short", 20), "short");
    }
}
