use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::NewWindowResponse,
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use url::Url;

const DESKTOP_INIT_SCRIPT: &str = r#"
Object.defineProperty(window, "__WHISPR_DESKTOP__", {
  value: Object.freeze({ platform: "tauri", shell: "desktop" }),
  configurable: false,
  enumerable: false,
  writable: false
});
"#;

const DESKTOP_BEFORE_CLOSE_SCRIPT: &str =
    r#"window.dispatchEvent(new Event("whispr:desktop-before-close"));"#;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_url = configured_app_url();
            let app_name =
                std::env::var("WHISPR_DESKTOP_APP_NAME").unwrap_or_else(|_| "Whispr".into());
            let oauth_navigation_active = Arc::new(Mutex::new(false));

            setup_tray(app, &app_name)?;

            let main_window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url.clone()))
                    .title(app_name)
                    .inner_size(1280.0, 820.0)
                    .min_inner_size(960.0, 640.0)
                    .resizable(true)
                    .center()
                    .initialization_script(DESKTOP_INIT_SCRIPT)
                    .on_navigation({
                        let allowed_origin = app_url.clone();
                        let oauth_navigation_active = Arc::clone(&oauth_navigation_active);

                        move |url| {
                            if is_same_origin(url, &allowed_origin) {
                                sync_oauth_navigation_state(url, &oauth_navigation_active);
                                return true;
                            }

                            if is_allowed_oauth_navigation(url, &oauth_navigation_active) {
                                return true;
                            }

                            open_external_url(url);
                            false
                        }
                    })
                    .on_new_window(|url, _features| {
                        open_external_url(&url);
                        NewWindowResponse::Deny
                    })
                    .build()?;
            let close_signal_window = main_window.clone();

            main_window.on_window_event(move |event| {
                if matches!(event, WindowEvent::CloseRequested { .. }) {
                    let _ = close_signal_window.eval(DESKTOP_BEFORE_CLOSE_SCRIPT);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Whispr desktop");
}

fn setup_tray(app: &mut tauri::App, app_name: &str) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", format!("Show {app_name}"), true, None::<&str>)?;
    let updates_item = MenuItem::with_id(
        app,
        "updates",
        "Updates: configured later",
        false,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", format!("Quit {app_name}"), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &updates_item, &separator, &quit_item])?;

    let mut tray_builder = TrayIconBuilder::with_id("whispr-main")
        .tooltip(format!("{app_name} Desktop"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => request_app_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => show_main_window(tray.app_handle()),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn request_app_quit(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(DESKTOP_BEFORE_CLOSE_SCRIPT);
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(250));
        app_handle.exit(0);
    });
}

fn configured_app_url() -> Url {
    let fallback = if cfg!(debug_assertions) {
        "http://localhost:3000"
    } else {
        "https://whispr.example.com"
    };

    let raw_url = std::env::var("WHISPR_DESKTOP_WEB_URL").unwrap_or_else(|_| fallback.into());

    Url::parse(&raw_url).expect("WHISPR_DESKTOP_WEB_URL must be a valid URL")
}

fn is_same_origin(candidate: &Url, allowed_origin: &Url) -> bool {
    candidate.scheme() == allowed_origin.scheme()
        && candidate.host_str() == allowed_origin.host_str()
        && candidate.port_or_known_default() == allowed_origin.port_or_known_default()
}

fn sync_oauth_navigation_state(url: &Url, oauth_navigation_active: &Arc<Mutex<bool>>) {
    let path = url.path();

    if path.starts_with("/api/auth/signin") || path.starts_with("/api/auth/callback") {
        set_oauth_navigation_active(oauth_navigation_active, true);
        return;
    }

    if path.starts_with("/api/auth/error")
        || path == "/login"
        || path.starts_with("/channels")
        || path.starts_with("/settings")
    {
        set_oauth_navigation_active(oauth_navigation_active, false);
    }
}

fn is_allowed_oauth_navigation(url: &Url, oauth_navigation_active: &Arc<Mutex<bool>>) -> bool {
    if url.scheme() != "https" || !is_oauth_navigation_active(oauth_navigation_active) {
        return false;
    }

    matches!(
        url.host_str(),
        Some("accounts.google.com") | Some("github.com")
    )
}

fn is_oauth_navigation_active(oauth_navigation_active: &Arc<Mutex<bool>>) -> bool {
    oauth_navigation_active
        .lock()
        .map(|active| *active)
        .unwrap_or(false)
}

fn set_oauth_navigation_active(oauth_navigation_active: &Arc<Mutex<bool>>, next_value: bool) {
    if let Ok(mut active) = oauth_navigation_active.lock() {
        *active = next_value;
    }
}

fn open_external_url(url: &Url) {
    match url.scheme() {
        "http" | "https" | "mailto" | "tel" => {
            if let Err(error) = open::that(url.as_str()) {
                eprintln!("Failed to open external URL in default browser: {error}");
            }
        }
        _ => {
            eprintln!("Blocked unsupported external URL scheme: {}", url.scheme());
        }
    }
}
