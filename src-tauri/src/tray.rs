use tauri::{
    App, AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const OPEN_MAIN_ITEM: &str = "open-main";
const OPEN_BIGSCREEN_ITEM: &str = "open-bigscreen";
const QUIT_ITEM: &str = "quit";

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub(crate) fn setup(app: &mut App) -> tauri::Result<()> {
    let open_main = MenuItem::with_id(app, OPEN_MAIN_ITEM, "打开主窗口", true, None::<&str>)?;
    let open_bigscreen = MenuItem::with_id(
        app,
        OPEN_BIGSCREEN_ITEM,
        "打开大屏幕模式",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, QUIT_ITEM, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_main, &open_bigscreen, &separator, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("MiyuManager")
        .on_menu_event(|app, event| match event.id.as_ref() {
            OPEN_MAIN_ITEM => show_main_window(app),
            OPEN_BIGSCREEN_ITEM => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = crate::bigscreen::open_from_tray(app).await {
                        eprintln!("failed to open big screen from tray: {error}");
                    }
                });
            }
            QUIT_ITEM => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}
