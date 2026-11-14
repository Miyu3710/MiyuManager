use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn open_bigscreen_probe(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("bigscreen-probe") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        "bigscreen-probe",
        WebviewUrl::App("index.html".into()),
    )
    .title("MiyuManager · 大屏模式")
    .inner_size(1280.0, 720.0)
    .min_inner_size(960.0, 540.0)
    .decorations(false)
    .visible(false)
    .center()
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_bigscreen_probe])
        .setup(|app| {
            if std::env::var("MIYU_PROBE_WINDOW").ok().as_deref() == Some("1") {
                let _ = open_bigscreen_probe(app.handle().clone());
            }
            if std::env::var("MIYU_PROBE_FULLSCREEN").ok().as_deref() == Some("1")
                && let Some(window) = app.get_webview_window("main")
            {
                let set_result = window.set_fullscreen(true);
                let is_fullscreen = window.is_fullscreen();
                eprintln!("fullscreen probe: set={set_result:?}, is_fullscreen={is_fullscreen:?}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
