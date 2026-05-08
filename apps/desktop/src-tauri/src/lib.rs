use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use tauri::{
    AppHandle,
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
const markWhisprDesktopChrome = () => {
  document.documentElement?.classList.add("whispr-desktop-chrome");
};
if (document.documentElement) {
  markWhisprDesktopChrome();
} else {
  document.addEventListener("DOMContentLoaded", markWhisprDesktopChrome, { once: true });
}
"#;

const DESKTOP_BEFORE_CLOSE_SCRIPT: &str =
    r#"window.dispatchEvent(new Event("whispr:desktop-before-close"));"#;

pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            show_main_window(app);
            handle_desktop_deep_links(app, argv.iter().map(String::as_str));
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
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
                    .inner_size(1920.0, 1080.0)
                    .min_inner_size(960.0, 640.0)
                    .decorations(false)
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

            setup_deep_links(app.handle())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Whispr desktop");
}

fn setup_tray(app: &mut tauri::App, app_name: &str) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", format!("Show {app_name}"), true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Open Settings", true, None::<&str>)?;
    let diagnostics_item =
        MenuItem::with_id(app, "diagnostics", "Desktop Diagnostics", true, None::<&str>)?;
    let mute_item = MenuItem::with_id(app, "toggle_mute", "Toggle Mute", true, None::<&str>)?;
    let deafen_item = MenuItem::with_id(app, "toggle_deafen", "Toggle Deafen", true, None::<&str>)?;
    let updates_item = MenuItem::with_id(
        app,
        "updates",
        "Updates: configured later",
        false,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", format!("Quit {app_name}"), true, None::<&str>)?;
    let command_separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &settings_item,
            &diagnostics_item,
            &command_separator,
            &mute_item,
            &deafen_item,
            &updates_item,
            &separator,
            &quit_item,
        ],
    )?;

    let mut tray_builder = TrayIconBuilder::with_id("whispr-main")
        .tooltip(format!("{app_name} Desktop"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "settings" => dispatch_desktop_command(app, "open-settings", None),
            "diagnostics" => dispatch_desktop_command(app, "open-desktop-diagnostics", None),
            "toggle_mute" => dispatch_desktop_command(app, "toggle-mute", None),
            "toggle_deafen" => dispatch_desktop_command(app, "toggle-deafen", None),
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
        std::thread::sleep(Duration::from_millis(500));
        app_handle.exit(0);
    });
}

fn setup_deep_links(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        use tauri_plugin_deep_link::DeepLinkExt;

        let app_handle = app.clone();
        match app.deep_link().get_current() {
            Ok(Some(urls)) => {
                handle_desktop_deep_links(&app_handle, urls.iter().map(Url::as_str));
            }
            Ok(None) => {}
            Err(error) => {
                eprintln!("Failed to read initial desktop deep links: {error}");
            }
        }

        let app_handle = app.clone();
        app.deep_link().on_open_url(move |event| {
            show_main_window(&app_handle);
            handle_desktop_deep_links(&app_handle, event.urls().iter().map(Url::as_str));
        });
    }

    Ok(())
}

fn handle_desktop_deep_links<'a, I>(app: &AppHandle, urls: I)
where
    I: IntoIterator<Item = &'a str>,
{
    for raw_url in urls {
        if let Some(path) = safe_desktop_deep_link_path(raw_url) {
            dispatch_desktop_command(app, "navigate", Some(&path));
            break;
        }
    }
}

fn safe_desktop_deep_link_path(raw_url: &str) -> Option<String> {
    let url = Url::parse(raw_url).ok()?;
    if url.scheme() != "whispr" {
        return None;
    }

    let host = url.host_str().unwrap_or_default();
    let path = url.path();
    let mut route = match host {
        "channels" => format!("/channels{path}"),
        "invite" => format!("/invite{path}"),
        "open" => {
            if path.is_empty() || path == "/" {
                "/channels".to_string()
            } else {
                path.to_string()
            }
        }
        "settings" => format!("/settings{path}"),
        _ if host.is_empty() && !path.is_empty() => path.to_string(),
        _ => return None,
    };

    if route.len() > 512
        || !route.starts_with('/')
        || route.starts_with("//")
        || route.contains('\\')
        || !is_safe_internal_desktop_path(&route)
    {
        return None;
    }

    if let Some(query) = url.query() {
        if query.len() > 256 || query.contains('\\') {
            return None;
        }

        route.push('?');
        route.push_str(query);
    }

    Some(route)
}

fn is_safe_internal_desktop_path(route: &str) -> bool {
    route == "/"
        || route == "/channels"
        || route == "/settings"
        || route.starts_with("/channels/")
        || route.starts_with("/settings/")
        || route.starts_with("/invite/")
}

fn dispatch_desktop_command(app: &AppHandle, command: &str, path: Option<&str>) {
    show_main_window(app);

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let Ok(command_json) = serde_json::to_string(command) else {
        return;
    };
    let path_json = match path {
        Some(value) => serde_json::to_string(value).unwrap_or_else(|_| "null".to_string()),
        None => "null".to_string(),
    };
    let script = format!(
        "window.dispatchEvent(new CustomEvent('whispr:desktop-command', {{ detail: {{ command: {command_json}, path: {path_json} }} }}));"
    );

    let _ = window.eval(&script);
}

fn configured_app_url() -> Url {
    let raw_url = match std::env::var("WHISPR_DESKTOP_WEB_URL") {
        Ok(value) => value,
        Err(_) if cfg!(debug_assertions) => "http://localhost:3000".into(),
        Err(_) => {
            panic!(
                "WHISPR_DESKTOP_WEB_URL is required for production desktop builds. \
                 Use apps/desktop/scripts/run-tauri.mjs build with TAURI_WEB_URL set."
            )
        }
    };

    let url = Url::parse(&raw_url).expect("WHISPR_DESKTOP_WEB_URL must be a valid URL");

    if !cfg!(debug_assertions) && url.scheme() != "https" {
        panic!("WHISPR_DESKTOP_WEB_URL must use HTTPS in production desktop builds");
    }

    url
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
        "https" | "mailto" | "tel" => {
            if let Err(error) = open::that(url.as_str()) {
                eprintln!("Failed to open external URL in default browser: {error}");
            }
        }
        _ => {
            eprintln!("Blocked unsupported external URL scheme: {}", url.scheme());
        }
    }
}
