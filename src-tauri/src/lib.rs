mod assets;
mod bangumi;
mod bigscreen;
mod commands;
mod database_maintenance;
mod db;
mod diagnostics;
mod launcher;
mod magpie;
mod metadata;
mod net;
mod oauth;
mod preferences;
mod scan;
mod security;
mod startup;
mod steam_library;
mod tracking;
mod tray;

use std::sync::atomic::Ordering;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(security::navigation_guard())
        .register_uri_scheme_protocol("miyu-asset", |context, request| {
            let state = context.app_handle().state::<commands::AppState>();
            assets::serve_asset(&state.data_dir, request.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            bigscreen::bigscreen_open,
            bigscreen::bigscreen_close,
            bigscreen::bigscreen_move,
            bigscreen::bigscreen_state,
            bigscreen::bigscreen_open_detail,
            commands::app_info,
            commands::app_quit,
            startup::startup_silent,
            bangumi::bangumi_comments,
            bangumi::bangumi_sync_comment,
            bangumi::bangumi_sync_progress,
            commands::database_health,
            commands::database_backup,
            commands::database_backup_default,
            commands::database_restore,
            commands::open_backup_dir,
            commands::open_log_dir,
            commands::report_frontend_error,
            commands::preferences_get,
            commands::preferences_update,
            commands::onboarding_complete,
            commands::open_data_dir,
            commands::open_external_url,
            commands::reveal_work_path,
            commands::update_check,
            commands::library_query,
            commands::library_get,
            commands::work_update,
            commands::work_source_links_update,
            commands::work_source_rating,
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
            commands::sessions_list,
            commands::session_create,
            commands::session_update,
            commands::session_delete,
            commands::stats_get,
            commands::monitors_list,
            commands::library_set_status,
            commands::library_set_favorite,
            commands::library_remove_work,
            commands::library_roots,
            commands::library_remove_root,
            commands::collections_list,
            commands::collection_create,
            commands::collection_rename,
            commands::collection_delete,
            commands::collection_reorder,
            commands::collection_add_works,
            commands::collection_remove_work,
            commands::library_scan_start,
            commands::library_scan_cancel,
            commands::steam_scan_start,
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
            commands::metadata_field_priorities,
            commands::metadata_field_priority_reorder,
            commands::metadata_field_priority_reset,
            commands::metadata_set_field_priority_global,
            commands::metadata_merge_preview,
            commands::metadata_merge_apply,
            commands::metadata_adopt_claim,
            commands::metadata_batch_start,
            commands::metadata_batch_pause,
            commands::metadata_batch_cancel,
            commands::metadata_batch_apply,
            commands::oauth_config_info,
            commands::oauth_import_config,
            commands::oauth_status,
            commands::oauth_connect,
            commands::oauth_sync_profile,
            commands::oauth_disconnect,
        ])
        .setup(|app| {
            let state = tauri::async_runtime::block_on(commands::create_app_state(app.handle()))?;
            app.manage(state);
            tray::setup(app)?;

            if std::env::var("MIYU_PROBE_FULLSCREEN").ok().as_deref() == Some("1")
                && let Some(window) = app.get_webview_window("main")
            {
                let set_result = window.set_fullscreen(true);
                let is_fullscreen = window.is_fullscreen();
                eprintln!("fullscreen probe: set={set_result:?}, is_fullscreen={is_fullscreen:?}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && let tauri::WindowEvent::CloseRequested { api, .. } = event
            {
                api.prevent_close();
                let close_to_tray = window
                    .app_handle()
                    .try_state::<commands::AppState>()
                    .map(|state| state.close_to_tray.load(Ordering::SeqCst))
                    .unwrap_or(true);
                if close_to_tray {
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
            if window.label() == bigscreen::LABEL
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                bigscreen::restore_main(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::Exit)
                && let Some(state) = app_handle.try_state::<commands::AppState>()
            {
                let _ = tauri::async_runtime::block_on(tracking::close_open_sessions(&state.pool));
            }
        });
}
