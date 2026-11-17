use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder,
};

use crate::commands::AppState;

pub(crate) const LABEL: &str = "bigscreen";
const DISPLAY_KEY: &str = "bigscreen.display";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BigScreenState {
    pub open: bool,
    pub display: Option<i64>,
    pub message: Option<String>,
}

fn monitors(app: &AppHandle) -> Result<Vec<tauri::Monitor>, String> {
    let window = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window(LABEL))
        .ok_or_else(|| "尚无可用于读取显示器的窗口".to_string())?;
    window
        .available_monitors()
        .map_err(|error| error.to_string())
}

fn pick_monitor(
    app: &AppHandle,
    display: Option<i64>,
) -> Result<(i64, tauri::Monitor, Option<String>), String> {
    let monitors = monitors(app)?;
    if monitors.is_empty() {
        return Err("系统没有报告可用的显示器".to_string());
    }

    let requested = display.unwrap_or(0).max(0) as usize;
    if let Some(monitor) = monitors.get(requested) {
        return Ok((requested as i64, monitor.clone(), None));
    }

    let primary_position = app
        .get_webview_window("main")
        .and_then(|window| window.primary_monitor().ok().flatten())
        .map(|monitor| *monitor.position());
    let index = primary_position
        .and_then(|position| {
            monitors
                .iter()
                .position(|monitor| *monitor.position() == position)
        })
        .unwrap_or(0);
    Ok((
        index as i64,
        monitors[index].clone(),
        Some(format!(
            "显示器 {} 不可用，已回退到显示器 {}。",
            requested + 1,
            index + 1
        )),
    ))
}

fn fullscreen_on_monitor(
    window: &tauri::WebviewWindow,
    monitor: &tauri::Monitor,
) -> Result<(), String> {
    let position = monitor.position();
    window
        .set_fullscreen_on_monitor(PhysicalPosition::new(position.x as f64, position.y as f64))
        .map_err(|error| error.to_string())
}

fn ensure_window(app: &AppHandle, monitor: &tauri::Monitor) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        fullscreen_on_monitor(&window, monitor)?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let window =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#/big-screen".into()))
            .title("MiyuManager · 大屏模式")
            .inner_size(1280.0, 720.0)
            .min_inner_size(960.0, 540.0)
            .decorations(false)
            .resizable(false)
            .visible(false)
            .focused(true)
            .center()
            .build()
            .map_err(|error| error.to_string())?;

    fullscreen_on_monitor(&window, monitor)?;
    Ok(())
}

fn hide_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
}

pub(crate) fn restore_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

pub(crate) async fn open_from_tray(app: AppHandle) -> Result<BigScreenState, String> {
    let state = app.state::<AppState>();
    let display = read_display(&state.pool).await;
    let (index, monitor, message) = pick_monitor(&app, display)?;
    if let Err(error) = ensure_window(&app, &monitor) {
        restore_main(&app);
        return Err(error);
    }
    hide_main(&app);
    write_display(&state.pool, index).await?;
    Ok(BigScreenState {
        open: true,
        display: Some(index),
        message,
    })
}

async fn read_display(pool: &SqlitePool) -> Option<i64> {
    let value: Option<String> = sqlx::query_scalar("SELECT value_json FROM settings WHERE key = ?")
        .bind(DISPLAY_KEY)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    value.and_then(|json| serde_json::from_str::<i64>(&json).ok())
}

async fn write_display(pool: &SqlitePool, display: i64) -> Result<(), String> {
    let value = serde_json::to_string(&display).map_err(|error| error.to_string())?;
    sqlx::query(
        "INSERT INTO settings (key, value_json) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(DISPLAY_KEY)
    .bind(value)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn bigscreen_open(
    app: AppHandle,
    state: State<'_, AppState>,
    display: Option<i64>,
) -> Result<BigScreenState, String> {
    let (index, monitor, message) = pick_monitor(&app, display)?;
    if let Err(error) = ensure_window(&app, &monitor) {
        restore_main(&app);
        return Err(error);
    }
    hide_main(&app);
    write_display(&state.pool, index).await?;
    Ok(BigScreenState {
        open: true,
        display: Some(index),
        message,
    })
}

#[tauri::command]
pub async fn bigscreen_close(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.close().map_err(|error| error.to_string())?;
    }
    restore_main(&app);
    Ok(())
}

#[tauri::command]
pub async fn bigscreen_move(
    app: AppHandle,
    state: State<'_, AppState>,
    display: i64,
) -> Result<BigScreenState, String> {
    let (index, monitor, message) = pick_monitor(&app, Some(display))?;
    let window = app
        .get_webview_window(LABEL)
        .ok_or_else(|| "大屏窗口尚未打开".to_string())?;
    fullscreen_on_monitor(&window, &monitor)?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    write_display(&state.pool, index).await?;
    Ok(BigScreenState {
        open: true,
        display: Some(index),
        message,
    })
}

#[tauri::command]
pub async fn bigscreen_state(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BigScreenState, String> {
    let window = app.get_webview_window(LABEL);
    let mut display = read_display(&state.pool).await;
    if let Some(window) = &window
        && let Ok(Some(current)) = window.current_monitor()
        && let Ok(list) = monitors(&app)
        && let Some(index) = list
            .iter()
            .position(|monitor| monitor.position() == current.position())
    {
        display = Some(index as i64);
    }

    let open = window
        .as_ref()
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    Ok(BigScreenState {
        open,
        display,
        message: None,
    })
}

#[tauri::command]
pub async fn bigscreen_open_detail(app: AppHandle, work_id: i64) -> Result<(), String> {
    app.emit_to(
        "main",
        "bigscreen-open-detail",
        serde_json::json!({ "workId": work_id }),
    )
    .map_err(|error| error.to_string())?;
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.close();
    }
    restore_main(&app);
    Ok(())
}
