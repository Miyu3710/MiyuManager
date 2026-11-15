mod assets;
mod commands;
mod db;
mod launcher;
mod metadata;
mod net;
mod oauth;
mod scan;

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
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("miyu-asset", |context, request| {
            let state = context.app_handle().state::<commands::AppState>();
            assets::serve_asset(&state.data_dir, request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            open_bigscreen_probe,
            commands::app_info,
            commands::library_query,
            commands::library_get,
            commands::work_update,
            commands::work_validate,
            commands::work_set_cover,
            commands::work_apply_local_cover,
            commands::work_clear_cover,
            commands::work_discover_covers,
            commands::launch_profile_save,
            commands::launch_config_save,
            commands::launch_config_validate,
            commands::launch_validate,
            commands::launch_start,
            commands::launch_stop,
            commands::launch_state,
            commands::monitors_list,
            commands::library_set_status,
            commands::library_set_favorite,
            commands::library_remove_work,
            commands::library_roots,
            commands::library_remove_root,
            commands::library_scan_start,
            commands::library_scan_cancel,
            commands::library_import_candidates,
            commands::library_scan_exclusions,
            commands::library_remove_scan_exclusion,
            commands::metadata_providers,
            commands::metadata_provider_reorder,
            commands::metadata_provider_set_enabled,
            commands::metadata_work_state,
            commands::metadata_search_start,
            commands::metadata_search_cancel,
            commands::metadata_candidate_preview,
            commands::metadata_import,
            commands::metadata_set_field_lock,
            commands::oauth_config_info,
            commands::oauth_import_config,
            commands::oauth_status,
            commands::oauth_connect,
            commands::oauth_disconnect,
        ])
        .setup(|app| {
            let state = tauri::async_runtime::block_on(commands::create_app_state(app.handle()))?;
            app.manage(state);

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
