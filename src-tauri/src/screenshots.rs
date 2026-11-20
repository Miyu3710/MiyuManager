use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, SystemTime};

use anyhow::{Context, Result, bail};
use chrono::{DateTime, Local, SecondsFormat, Utc};
use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ExtendedColorType, ImageFormat, RgbaImage};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::http::{Response, StatusCode, header};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use url::form_urlencoded;

use crate::commands::AppState;
use crate::launcher::process;
use crate::preferences::AppPreferences;

const TOAST_WIDTH: f64 = 388.0;
const TOAST_HEIGHT: f64 = 92.0;
const TOAST_MARGIN: f64 = 20.0;
const THUMB_WIDTH: u32 = 720;
const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "bmp"];
static TOAST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

pub struct ScreenshotService {
    root: RwLock<PathBuf>,
    registered: Mutex<Option<String>>,
    capturing: AtomicBool,
}

impl ScreenshotService {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root: RwLock::new(root),
            registered: Mutex::new(None),
            capturing: AtomicBool::new(false),
        }
    }

    pub fn root(&self) -> PathBuf {
        self.root
            .read()
            .map(|value| value.clone())
            .unwrap_or_else(|_| PathBuf::from("screenshots"))
    }

    pub fn set_root(&self, root: PathBuf) {
        if let Ok(mut value) = self.root.write() {
            *value = root;
        }
    }

    fn begin_capture(&self) -> bool {
        self.capturing
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    fn end_capture(&self) {
        self.capturing.store(false, Ordering::SeqCst);
    }

    pub fn sync_shortcut(&self, app: &AppHandle, hotkey: &str) -> Result<()> {
        let hotkey = hotkey.trim();
        if hotkey.is_empty() {
            bail!("截图快捷键不能为空");
        }
        let shortcut =
            Shortcut::from_str(hotkey).with_context(|| format!("截图快捷键无效：{hotkey}"))?;
        let mut registered = self
            .registered
            .lock()
            .map_err(|_| anyhow::anyhow!("截图快捷键状态锁已损坏"))?;
        if registered.as_deref() == Some(hotkey) {
            return Ok(());
        }
        let previous = registered.take();
        if let Some(previous) = previous.as_deref()
            && let Ok(previous_shortcut) = Shortcut::from_str(previous)
        {
            let _ = app.global_shortcut().unregister(previous_shortcut);
        }
        match app.global_shortcut().register(shortcut) {
            Ok(()) => {
                *registered = Some(hotkey.to_string());
                Ok(())
            }
            Err(error) => {
                if let Some(previous) = previous.as_deref()
                    && let Ok(previous_shortcut) = Shortcut::from_str(previous)
                    && app.global_shortcut().register(previous_shortcut).is_ok()
                {
                    *registered = Some(previous.to_string());
                }
                Err(error).with_context(|| {
                    format!("无法注册截图快捷键 {hotkey}（该组合可能已被其他程序占用）")
                })
            }
        }
    }

    pub fn unregister(&self, app: &AppHandle) {
        let Ok(mut registered) = self.registered.lock() else {
            return;
        };
        if let Some(previous) = registered.take()
            && let Ok(shortcut) = Shortcut::from_str(&previous)
        {
            let _ = app.global_shortcut().unregister(shortcut);
        }
    }
}

pub fn validate_hotkey(hotkey: &str) -> Result<()> {
    let hotkey = hotkey.trim();
    if hotkey.is_empty() {
        bail!("截图快捷键不能为空");
    }
    Shortcut::from_str(hotkey).with_context(|| format!("截图快捷键无效：{hotkey}"))?;
    Ok(())
}

pub fn effective_root(app: &AppHandle, data_dir: &Path, preferences: &AppPreferences) -> PathBuf {
    let configured = preferences.screenshot_dir.trim();
    if !configured.is_empty() {
        let path = PathBuf::from(configured);
        return if path.is_absolute() {
            path
        } else {
            data_dir.join(path)
        };
    }
    app.path()
        .picture_dir()
        .unwrap_or_else(|_| data_dir.to_path_buf())
        .join("MiyuManager")
        .join("Screenshots")
}

pub fn register_for_game(app: &AppHandle, hotkey: &str) -> Result<()> {
    let state = app.try_state::<AppState>().context("应用状态尚未初始化")?;
    state.screenshots.sync_shortcut(app, hotkey)
}

pub fn unregister(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state.screenshots.unregister(app);
    }
}

pub fn handle_hotkey(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let foreground = process::foreground_process_id();
    let Some((work_id, title, game_pid)) = state.launches.capture_target(foreground) else {
        crate::diagnostics::event(
            "info",
            "screenshot_hotkey_ignored",
            "截图快捷键触发，但前台窗口不属于正在运行的游戏",
            serde_json::json!({"foregroundPid": foreground}),
        );
        return;
    };
    if !state.screenshots.begin_capture() {
        crate::diagnostics::event(
            "info",
            "screenshot_hotkey_busy",
            "截图快捷键触发时已有截图正在保存",
            serde_json::json!({"workId": work_id}),
        );
        return;
    }

    let app = app.clone();
    let service = state.screenshots.clone();
    let root = service.root();
    tauri::async_runtime::spawn(async move {
        let result = tauri::async_runtime::spawn_blocking(move || {
            let captured = capture_game_screen(game_pid)?;
            let item = save_capture(&root, work_id, &title, captured.image)?;
            Ok::<_, anyhow::Error>(CaptureOutcome {
                item,
                monitor: captured.monitor,
            })
        })
        .await;
        service.end_capture();
        match result {
            Ok(Ok(outcome)) => {
                let _ = app.emit("screenshot-captured", &outcome.item);
                show_success_toast(&app, &outcome.item, Some(outcome.monitor));
            }
            Ok(Err(error)) => {
                eprintln!("screenshot failed: {error:#}");
                show_error_toast(&app, &format!("截图失败：{error}"), None);
            }
            Err(error) => {
                eprintln!("screenshot task failed: {error}");
                show_error_toast(&app, &format!("截图任务失败：{error}"), None);
            }
        }
    });
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotItem {
    pub work_id: Option<i64>,
    pub work_title: String,
    pub folder: String,
    pub file_name: String,
    pub relative_path: String,
    pub thumbnail_path: String,
    pub path: String,
    pub captured_at: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FolderMeta {
    work_id: i64,
    title: String,
}

#[derive(Debug, Clone, Copy)]
pub struct CaptureRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl CaptureRect {
    fn width(self) -> i32 {
        (self.right - self.left).max(0)
    }

    fn height(self) -> i32 {
        (self.bottom - self.top).max(0)
    }

    fn center(self) -> (f64, f64) {
        (
            (self.left + self.right) as f64 / 2.0,
            (self.top + self.bottom) as f64 / 2.0,
        )
    }
}

struct CapturedScreen {
    image: RgbaImage,
    monitor: CaptureRect,
}

struct CaptureOutcome {
    item: ScreenshotItem,
    monitor: CaptureRect,
}

fn extension_of(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn is_image(path: &Path) -> bool {
    extension_of(path).is_some_and(|extension| IMAGE_EXTENSIONS.contains(&extension.as_str()))
}

fn relative_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn timestamp_from_metadata(metadata: &std::fs::Metadata) -> String {
    metadata
        .modified()
        .unwrap_or_else(|_| SystemTime::now())
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()
        .and_then(|value| {
            DateTime::<Utc>::from_timestamp(value.as_secs() as i64, value.subsec_nanos())
        })
        .unwrap_or_else(Utc::now)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn sanitize_folder_name(title: &str) -> String {
    let mut output = String::new();
    for value in title.trim().chars() {
        let value = if value.is_control()
            || matches!(value, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        {
            '_'
        } else {
            value
        };
        if output.chars().count() >= 72 {
            break;
        }
        output.push(value);
    }
    let output = output.trim().trim_end_matches('.').trim().to_string();
    let output = if output.is_empty() {
        "未命名作品".to_string()
    } else {
        output
    };
    let upper = output.to_ascii_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.contains(&upper.as_str()) {
        format!("_{output}")
    } else {
        output
    }
}

fn read_folder_meta(folder: &Path) -> Option<FolderMeta> {
    let raw = std::fs::read_to_string(folder.join("_miyu.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_folder_meta(folder: &Path, work_id: i64, title: &str) -> Result<()> {
    let meta = FolderMeta {
        work_id,
        title: title.to_string(),
    };
    std::fs::write(folder.join("_miyu.json"), serde_json::to_vec_pretty(&meta)?)?;
    Ok(())
}

fn resolve_game_folder(root: &Path, work_id: i64, title: &str) -> Result<PathBuf> {
    std::fs::create_dir_all(root)
        .with_context(|| format!("无法创建截图目录：{}", root.display()))?;
    let base = sanitize_folder_name(title);
    for index in 0..100 {
        let name = if index == 0 {
            base.clone()
        } else {
            format!("{base} ({})", index + 1)
        };
        let folder = root.join(&name);
        if !folder.exists() {
            std::fs::create_dir_all(&folder)?;
            write_folder_meta(&folder, work_id, title)?;
            return Ok(folder);
        }
        let meta = read_folder_meta(&folder);
        if meta.as_ref().is_none_or(|meta| meta.work_id == work_id) {
            std::fs::create_dir_all(&folder)?;
            if meta.is_none() {
                write_folder_meta(&folder, work_id, title)?;
            }
            return Ok(folder);
        }
    }
    bail!("同名截图目录过多，无法创建作品文件夹")
}

fn save_thumbnail(image: &DynamicImage, folder: &Path, file_name: &str) -> Result<PathBuf> {
    let thumbs = folder.join("_thumbs");
    std::fs::create_dir_all(&thumbs)?;
    let path = thumbs.join(format!("{file_name}.jpg"));
    let thumb = if image.width() > THUMB_WIDTH {
        image.thumbnail(THUMB_WIDTH, image.height())
    } else {
        image.clone()
    };
    let rgb = thumb.to_rgb8();
    let mut file = std::fs::File::create(&path)?;
    JpegEncoder::new_with_quality(&mut file, 82).encode(
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        ExtendedColorType::Rgb8,
    )?;
    Ok(path)
}

fn save_capture(
    root: &Path,
    work_id: i64,
    title: &str,
    image: RgbaImage,
) -> Result<ScreenshotItem> {
    let folder = resolve_game_folder(root, work_id, title)?;
    let stamp = Local::now().format("%Y-%m-%d_%H-%M-%S_%3f").to_string();
    let mut path = folder.join(format!("{stamp}.png"));
    let mut suffix = 1;
    while path.exists() {
        path = folder.join(format!("{stamp}_{suffix}.png"));
        suffix += 1;
    }
    let dynamic = DynamicImage::ImageRgba8(image);
    dynamic.save_with_format(&path, ImageFormat::Png)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("screenshot.png")
        .to_string();
    let thumbnail = save_thumbnail(&dynamic, &folder, &file_name)?;
    let metadata = std::fs::metadata(&path)?;
    Ok(ScreenshotItem {
        work_id: Some(work_id),
        work_title: title.to_string(),
        folder: folder
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string(),
        file_name,
        relative_path: relative_string(path.strip_prefix(root).unwrap_or(&path)),
        thumbnail_path: relative_string(thumbnail.strip_prefix(root).unwrap_or(&thumbnail)),
        path: path.to_string_lossy().to_string(),
        captured_at: timestamp_from_metadata(&metadata),
        size_bytes: metadata.len() as i64,
    })
}

pub async fn list(
    pool: &SqlitePool,
    root: &Path,
    work_id: Option<i64>,
) -> Result<Vec<ScreenshotItem>> {
    let rows = sqlx::query("SELECT id, canonical_title FROM works")
        .fetch_all(pool)
        .await?;
    let mut works = Vec::new();
    let mut by_folder: HashMap<String, Vec<(i64, String)>> = HashMap::new();
    for row in rows {
        let id: i64 = row.try_get("id")?;
        let title: String = row.try_get("canonical_title")?;
        by_folder
            .entry(sanitize_folder_name(&title).to_lowercase())
            .or_default()
            .push((id, title.clone()));
        works.push((id, title));
    }
    let target_title = work_id.and_then(|id| {
        works
            .iter()
            .find(|(candidate, _)| *candidate == id)
            .map(|(_, title)| title.clone())
    });
    let target_folder = target_title.as_deref().map(sanitize_folder_name);

    let Ok(entries) = std::fs::read_dir(root) else {
        return Ok(Vec::new());
    };
    let mut items = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let folder_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string();
            if folder_name.starts_with('_') {
                continue;
            }
            let meta = read_folder_meta(&path);
            let matched = by_folder.get(&folder_name.to_lowercase());
            let (item_work_id, item_title) = if let Some(meta) = meta {
                let current_title = works
                    .iter()
                    .find(|(id, _)| *id == meta.work_id)
                    .map(|(_, title)| title.clone());
                (Some(meta.work_id), current_title.unwrap_or(meta.title))
            } else if let Some(candidates) = matched
                && candidates.len() == 1
            {
                (Some(candidates[0].0), candidates[0].1.clone())
            } else {
                (None, folder_name.clone())
            };
            collect_images(root, &path, item_work_id, &item_title, &mut items);
        } else if is_image(&path) {
            add_image_item(root, &path, None, "未分类", &mut items);
        }
    }
    if let Some(target_id) = work_id {
        items.retain(|item| {
            item.work_id == Some(target_id)
                || (item.work_id.is_none()
                    && target_folder
                        .as_deref()
                        .is_some_and(|folder| item.folder.eq_ignore_ascii_case(folder)))
        });
    }
    items.sort_by(|left, right| right.captured_at.cmp(&left.captured_at));
    Ok(items)
}

fn collect_images(
    root: &Path,
    folder: &Path,
    work_id: Option<i64>,
    title: &str,
    items: &mut Vec<ScreenshotItem>,
) {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && is_image(&path) {
            add_image_item(root, &path, work_id, title, items);
        }
    }
}

fn add_image_item(
    root: &Path,
    path: &Path,
    work_id: Option<i64>,
    title: &str,
    items: &mut Vec<ScreenshotItem>,
) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return;
    };
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let folder = path
        .parent()
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let thumb = path
        .parent()
        .map(|parent| parent.join("_thumbs").join(format!("{file_name}.jpg")))
        .filter(|thumb| thumb.is_file());
    items.push(ScreenshotItem {
        work_id,
        work_title: title.to_string(),
        folder,
        file_name: file_name.clone(),
        relative_path: relative_string(path.strip_prefix(root).unwrap_or(path)),
        thumbnail_path: relative_string(
            thumb
                .as_deref()
                .unwrap_or(path)
                .strip_prefix(root)
                .unwrap_or(path),
        ),
        path: path.to_string_lossy().to_string(),
        captured_at: timestamp_from_metadata(&metadata),
        size_bytes: metadata.len() as i64,
    });
}

pub fn serve_file(root: &Path, query: Option<&str>) -> Response<Vec<u8>> {
    let relative = form_urlencoded::parse(query.unwrap_or_default().as_bytes())
        .find_map(|(key, value)| (key == "path").then(|| value.into_owned()));
    let Some(relative) = relative else {
        return not_found("missing screenshot path");
    };
    let relative = Path::new(&relative);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return not_found("invalid screenshot path");
    }
    let Ok(root) = dunce::canonicalize(root) else {
        return not_found("screenshot directory missing");
    };
    let requested = root.join(relative);
    let Ok(requested) = dunce::canonicalize(&requested) else {
        return not_found("screenshot not found");
    };
    if !requested.starts_with(&root) || !is_image(&requested) {
        return not_found("screenshot outside directory");
    }
    let Ok(bytes) = std::fs::read(&requested) else {
        return not_found("screenshot unreadable");
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type(&requested))
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(bytes)
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn content_type(path: &Path) -> &'static str {
    match extension_of(path).as_deref() {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

fn not_found(message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

fn show_success_toast(app: &AppHandle, item: &ScreenshotItem, monitor: Option<CaptureRect>) {
    let query = form_urlencoded::Serializer::new(String::new())
        .append_pair("state", "success")
        .append_pair("title", &item.work_title)
        .append_pair("file", &item.file_name)
        .finish();
    show_toast(app, &query, monitor);
}

fn show_error_toast(app: &AppHandle, message: &str, monitor: Option<CaptureRect>) {
    let message = message.chars().take(160).collect::<String>();
    let query = form_urlencoded::Serializer::new(String::new())
        .append_pair("state", "error")
        .append_pair("message", &message)
        .finish();
    show_toast(app, &query, monitor);
}

fn show_toast(app: &AppHandle, query: &str, monitor: Option<CaptureRect>) {
    let app = app.clone();
    let query = query.to_string();
    if let Err(error) = app.clone().run_on_main_thread(move || {
        for (label, existing) in app.webview_windows() {
            if label.starts_with("screenshot-toast") {
                let _ = existing.close();
            }
        }
        let url = format!("index.html#/screenshot-toast?{query}");
        let label = format!(
            "screenshot-toast-{}",
            TOAST_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let window = match WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
            .title("MiyuManager 截图")
            .inner_size(TOAST_WIDTH, TOAST_HEIGHT)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .focusable(false)
            .visible(false)
            .build()
        {
            Ok(window) => window,
            Err(error) => {
                eprintln!("screenshot toast window failed: {error}");
                return;
            }
        };
        let _ = window.set_ignore_cursor_events(true);
        let _ = window.set_focusable(false);

        let scale = monitor
            .and_then(|rect| {
                let (x, y) = rect.center();
                app.monitor_from_point(x, y).ok().flatten()
            })
            .or_else(|| app.primary_monitor().ok().flatten())
            .map(|monitor| monitor.scale_factor())
            .unwrap_or(1.0);
        let screen_rect = monitor.or_else(|| {
            app.primary_monitor().ok().flatten().map(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                CaptureRect {
                    left: position.x,
                    top: position.y,
                    right: position.x + size.width as i32,
                    bottom: position.y + size.height as i32,
                }
            })
        });
        let width = (TOAST_WIDTH * scale).round() as u32;
        let height = (TOAST_HEIGHT * scale).round() as u32;
        let _ = window.set_size(PhysicalSize::new(width, height));
        if let Some(rect) = screen_rect {
            let margin = (TOAST_MARGIN * scale).round() as i32;
            let x = rect.right - width as i32 - margin;
            let y = rect.bottom - height as i32 - margin;
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }

        let show_window = window.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(120)).await;
            let _ = show_window.show();
            tokio::time::sleep(Duration::from_millis(2400)).await;
            let _ = show_window.close();
        });
    }) {
        eprintln!("screenshot toast dispatch failed: {error}");
    }
}

pub fn open_root(root: &Path) -> Result<()> {
    std::fs::create_dir_all(root)
        .with_context(|| format!("无法创建截图目录：{}", root.display()))?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(root)
            .spawn()
            .context("无法打开截图目录")?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        bail!("当前平台不支持打开截图目录")
    }
}

pub fn reveal(path: &str, root: &Path) -> Result<()> {
    let canonical_root =
        dunce::canonicalize(root).with_context(|| format!("截图目录不存在：{}", root.display()))?;
    let requested = dunce::canonicalize(path).context("截图文件不存在")?;
    if !requested.starts_with(&canonical_root) {
        bail!("截图文件不在截图目录中");
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg("/select,")
            .arg(&requested)
            .spawn()
            .context("无法打开截图所在文件夹")?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = requested;
        bail!("当前平台不支持定位截图文件")
    }
}

#[cfg(windows)]
fn capture_game_screen(game_pid: Option<u32>) -> Result<CapturedScreen> {
    platform::capture_game_screen(game_pid)
}

#[cfg(not(windows))]
fn capture_game_screen(_game_pid: Option<u32>) -> Result<CapturedScreen> {
    bail!("当前平台不支持游戏内截图")
}

#[cfg(windows)]
mod platform {
    use std::ffi::c_void;

    use anyhow::{Result, bail};
    use image::RgbaImage;
    use windows_sys::Win32::Foundation::{HWND, POINT, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CAPTUREBLT, ClientToScreen,
        CreateCompatibleBitmap, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC, DeleteObject, GetDC,
        GetDIBits, GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow,
        ReleaseDC, SRCCOPY, SelectObject,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClientRect, GetForegroundWindow};

    use super::{CaptureRect, CapturedScreen, process};

    fn monitor_rect(hwnd: HWND) -> (CaptureRect, f64) {
        let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if monitor.is_null() || unsafe { GetMonitorInfoW(monitor, &mut info) } == 0 {
            return (
                CaptureRect {
                    left: 0,
                    top: 0,
                    right: 1920,
                    bottom: 1080,
                },
                1.0,
            );
        }
        (
            CaptureRect {
                left: info.rcMonitor.left,
                top: info.rcMonitor.top,
                right: info.rcMonitor.right,
                bottom: info.rcMonitor.bottom,
            },
            1.0,
        )
    }

    fn clamped_window_rect(hwnd: HWND, monitor: CaptureRect) -> Option<CaptureRect> {
        let mut client = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if unsafe { GetClientRect(hwnd, &mut client) } != 0 {
            let mut origin = POINT { x: 0, y: 0 };
            if unsafe { ClientToScreen(hwnd, &mut origin) } != 0 {
                let client_rect = CaptureRect {
                    left: origin.x,
                    top: origin.y,
                    right: origin.x + (client.right - client.left),
                    bottom: origin.y + (client.bottom - client.top),
                };
                if let Some(clamped) = clamp_rect(client_rect, monitor) {
                    return Some(clamped);
                }
            }
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if unsafe { windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect(hwnd, &mut rect) }
            == 0
        {
            return None;
        }
        clamp_rect(
            CaptureRect {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
            },
            monitor,
        )
    }

    fn clamp_rect(rect: CaptureRect, monitor: CaptureRect) -> Option<CaptureRect> {
        let left = rect.left.max(monitor.left);
        let top = rect.top.max(monitor.top);
        let right = rect.right.min(monitor.right);
        let bottom = rect.bottom.min(monitor.bottom);
        (right - left >= 160 && bottom - top >= 120).then_some(CaptureRect {
            left,
            top,
            right,
            bottom,
        })
    }

    pub fn capture_game_screen(game_pid: Option<u32>) -> Result<CapturedScreen> {
        let info = game_pid
            .and_then(process::window_info_by_pid)
            .or_else(|| process::window_info_by_pid(process::foreground_process_id().unwrap_or(0)));
        let foreground = unsafe { GetForegroundWindow() };
        let hwnd = if foreground.is_null() {
            info.as_ref()
                .map(|info| info.hwnd as HWND)
                .filter(|hwnd| !hwnd.is_null())
                .unwrap_or(foreground)
        } else {
            foreground
        };
        if hwnd.is_null() {
            bail!("没有找到可截取的游戏窗口");
        }
        let (monitor, _) = monitor_rect(hwnd);
        if monitor.width() <= 0 || monitor.height() <= 0 {
            bail!("显示器尺寸无效");
        }
        let window = clamped_window_rect(hwnd, monitor);
        let area = window.unwrap_or(monitor);
        let image = capture_rect(area)?;
        Ok(CapturedScreen { image, monitor })
    }

    fn capture_rect(area: CaptureRect) -> Result<RgbaImage> {
        let width = area.width();
        let height = area.height();
        if width <= 0 || height <= 0 {
            bail!("截图区域无效");
        }
        let screen = unsafe { GetDC(std::ptr::null_mut()) };
        if screen.is_null() {
            bail!("无法获取屏幕设备上下文");
        }
        let memory = unsafe { CreateCompatibleDC(screen) };
        if memory.is_null() {
            unsafe { ReleaseDC(std::ptr::null_mut(), screen) };
            bail!("无法创建截图设备上下文");
        }
        let bitmap = unsafe { CreateCompatibleBitmap(screen, width, height) };
        if bitmap.is_null() {
            unsafe {
                DeleteDC(memory);
                ReleaseDC(std::ptr::null_mut(), screen);
            }
            bail!("无法创建截图位图");
        }
        let previous = unsafe { SelectObject(memory, bitmap) };
        let copied = unsafe {
            BitBlt(
                memory,
                0,
                0,
                width,
                height,
                screen,
                area.left,
                area.top,
                SRCCOPY | CAPTUREBLT,
            )
        };
        if copied == 0 {
            unsafe {
                SelectObject(memory, previous);
                DeleteObject(bitmap);
                DeleteDC(memory);
                ReleaseDC(std::ptr::null_mut(), screen);
            }
            bail!("屏幕截图失败");
        }

        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        let lines = unsafe {
            GetDIBits(
                memory,
                bitmap,
                0,
                height as u32,
                pixels.as_mut_ptr().cast::<c_void>(),
                &mut info,
                DIB_RGB_COLORS,
            )
        };
        unsafe {
            SelectObject(memory, previous);
            DeleteObject(bitmap);
            DeleteDC(memory);
            ReleaseDC(std::ptr::null_mut(), screen);
        }
        if lines == 0 {
            bail!("无法读取截图像素");
        }
        for pixel in pixels.as_chunks_mut::<4>().0 {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }
        RgbaImage::from_raw(width as u32, height as u32, pixels)
            .ok_or_else(|| anyhow::anyhow!("截图缓冲区尺寸不匹配"))
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        #[ignore = "requires an interactive Windows desktop"]
        fn captures_a_desktop_region() {
            let image = capture_rect(CaptureRect {
                left: 0,
                top: 0,
                right: 320,
                bottom: 200,
            })
            .expect("screen capture");
            assert_eq!(image.width(), 320);
            assert_eq!(image.height(), 200);
            assert!(image.as_raw().iter().any(|value| *value != 0));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_image() -> RgbaImage {
        RgbaImage::from_pixel(64, 36, image::Rgba([214, 86, 123, 255]))
    }

    #[test]
    fn sanitizes_windows_folder_names() {
        assert_eq!(sanitize_folder_name("GINKA"), "GINKA");
        assert_eq!(sanitize_folder_name("A/B:C*?\"<>"), "A_B_C_____");
        assert_eq!(sanitize_folder_name("CON"), "_CON");
        assert_eq!(sanitize_folder_name("   "), "未命名作品");
    }

    #[test]
    fn validates_hotkey_syntax() {
        assert!(validate_hotkey("F12").is_ok());
        assert!(validate_hotkey("Ctrl+Shift+F12").is_ok());
        assert!(validate_hotkey("Ctrl+").is_err());
    }

    #[tokio::test]
    async fn saves_lists_and_serves_a_screenshot() {
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path().join("Screenshots");
        let saved = save_capture(&root, 7, "GINKA", sample_image()).expect("save screenshot");
        assert!(saved.relative_path.starts_with("GINKA/"));
        assert!(std::path::Path::new(&saved.path).is_file());
        assert!(saved.thumbnail_path.contains("_thumbs/"));

        let pool = crate::db::open_memory_pool().await.expect("pool");
        sqlx::query("INSERT INTO works (id, canonical_title) VALUES (7, 'GINKA')")
            .execute(&pool)
            .await
            .expect("work");
        let listed = list(&pool, &root, Some(7)).await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].work_id, Some(7));
        assert_eq!(listed[0].work_title, "GINKA");

        let query = form_urlencoded::Serializer::new(String::new())
            .append_pair("path", &saved.relative_path)
            .finish();
        let response = serve_file(&root, Some(&query));
        assert_eq!(response.status(), StatusCode::OK);
        assert!(!response.body().is_empty());

        let traversal = form_urlencoded::Serializer::new(String::new())
            .append_pair("path", "../secret.png")
            .finish();
        assert_eq!(
            serve_file(&root, Some(&traversal)).status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn uses_a_suffix_when_two_works_share_a_title_folder() {
        let temp = tempfile::TempDir::new().expect("temp");
        let root = temp.path().join("Screenshots");
        let first = resolve_game_folder(&root, 1, "Same Title").expect("first folder");
        let second = resolve_game_folder(&root, 2, "Same Title").expect("second folder");
        assert_ne!(first, second);
        assert_eq!(
            second.file_name().and_then(|value| value.to_str()),
            Some("Same Title (2)")
        );
    }
}
