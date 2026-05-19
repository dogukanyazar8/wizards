use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
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
  if (window.location?.pathname === "/desktop/start") {
    document.documentElement?.classList.remove("whispr-desktop-chrome");
    return;
  }
  document.documentElement?.classList.add("whispr-desktop-chrome");
};
if (document.documentElement) {
  markWhisprDesktopChrome();
} else {
  document.addEventListener("DOMContentLoaded", markWhisprDesktopChrome, { once: true });
}
"#;

const DESKTOP_START_PATH: &str = "/desktop/start";
const DESKTOP_MAIN_WINDOW_WIDTH: f64 = 1920.0;
const DESKTOP_MAIN_WINDOW_HEIGHT: f64 = 1080.0;
const DESKTOP_MIN_WINDOW_WIDTH: f64 = 960.0;
const DESKTOP_MIN_WINDOW_HEIGHT: f64 = 640.0;
const DESKTOP_SPLASH_WINDOW_WIDTH: f64 = 432.0;
const DESKTOP_SPLASH_WINDOW_HEIGHT: f64 = 292.0;
const DESKTOP_BEFORE_CLOSE_TIMEOUT_MS: u64 = 3_000;

#[derive(Default)]
struct DesktopCloseState {
    exiting: bool,
    next_request_id: u64,
    pending_request_id: Option<u64>,
}

#[derive(Clone, Default)]
struct DesktopCloseCoordinator {
    state: Arc<Mutex<DesktopCloseState>>,
}

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
        .manage(DesktopCloseCoordinator::default())
        .invoke_handler(tauri::generate_handler![complete_desktop_before_close])
        .setup(|app| {
            let app_url = configured_app_url();
            let app_name =
                std::env::var("WHISPR_DESKTOP_APP_NAME").unwrap_or_else(|_| "Whispr".into());
            let oauth_navigation_active = Arc::new(Mutex::new(false));
            let desktop_window_promoted =
                Arc::new(Mutex::new(app_url.path() != DESKTOP_START_PATH));
            let close_coordinator = app.state::<DesktopCloseCoordinator>().inner().clone();
            let webview_data_directory = resolve_webview_data_directory(app)?;

            setup_tray(app, &app_name, close_coordinator.clone())?;

            let mut main_window_builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url.clone()))
                    .title(app_name)
                    .decorations(false)
                    .center()
                    .data_directory(webview_data_directory)
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
                    .on_page_load({
                        let allowed_origin = app_url.clone();
                        let desktop_window_promoted = Arc::clone(&desktop_window_promoted);

                        move |window, payload| {
                            let url = payload.url();
                            if !is_same_origin(url, &allowed_origin) {
                                return;
                            }

                            match payload.event() {
                                PageLoadEvent::Started if url.path() != DESKTOP_START_PATH => {
                                    promote_desktop_window(&window, &desktop_window_promoted);
                                }
                                PageLoadEvent::Finished if url.path() == DESKTOP_START_PATH => {
                                    let _ = window.show();
                                }
                                _ => {}
                            }
                        }
                    })
                    .on_new_window(|url, _features| {
                        open_external_url(&url);
                        NewWindowResponse::Deny
                    });

            if app_url.path() == DESKTOP_START_PATH {
                main_window_builder = main_window_builder
                    .inner_size(DESKTOP_SPLASH_WINDOW_WIDTH, DESKTOP_SPLASH_WINDOW_HEIGHT)
                    .min_inner_size(DESKTOP_SPLASH_WINDOW_WIDTH, DESKTOP_SPLASH_WINDOW_HEIGHT)
                    .resizable(false)
                    .visible(false);
            } else {
                main_window_builder = main_window_builder
                    .inner_size(DESKTOP_MAIN_WINDOW_WIDTH, DESKTOP_MAIN_WINDOW_HEIGHT)
                    .min_inner_size(DESKTOP_MIN_WINDOW_WIDTH, DESKTOP_MIN_WINDOW_HEIGHT)
                    .resizable(true);
            }

            let main_window = main_window_builder.build()?;
            let close_request_app = app.handle().clone();
            let close_request_coordinator = close_coordinator.clone();

            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    request_app_quit(&close_request_app, &close_request_coordinator);
                }
            });

            setup_deep_links(app.handle())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Whispr desktop");
}

#[tauri::command]
fn complete_desktop_before_close(
    app: AppHandle,
    close_coordinator: tauri::State<'_, DesktopCloseCoordinator>,
    request_id: u64,
) {
    if complete_desktop_close_request(close_coordinator.inner(), request_id) {
        app.exit(0);
    }
}

fn promote_desktop_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    promoted: &Arc<Mutex<bool>>,
) {
    let should_promote = promoted
        .lock()
        .map(|mut already_promoted| {
            if *already_promoted {
                false
            } else {
                *already_promoted = true;
                true
            }
        })
        .unwrap_or(false);

    if !should_promote {
        return;
    }

    let _ = window.set_min_size(None::<LogicalSize<f64>>);
    let _ = window.set_size(LogicalSize::new(
        DESKTOP_MAIN_WINDOW_WIDTH,
        DESKTOP_MAIN_WINDOW_HEIGHT,
    ));
    let _ = window.set_min_size(Some(LogicalSize::new(
        DESKTOP_MIN_WINDOW_WIDTH,
        DESKTOP_MIN_WINDOW_HEIGHT,
    )));
    let _ = window.set_resizable(true);
    let _ = window.center();
}

fn resolve_webview_data_directory(app: &tauri::App) -> tauri::Result<PathBuf> {
    let data_directory = app.path().app_data_dir()?.join("webview");
    std::fs::create_dir_all(&data_directory)?;
    Ok(data_directory)
}

fn setup_tray(
    app: &mut tauri::App,
    app_name: &str,
    close_coordinator: DesktopCloseCoordinator,
) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", format!("Show {app_name}"), true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Open Settings", true, None::<&str>)?;
    let diagnostics_item = MenuItem::with_id(
        app,
        "diagnostics",
        "Desktop Diagnostics",
        true,
        None::<&str>,
    )?;
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
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "settings" => dispatch_desktop_command(app, "open-settings", None),
            "diagnostics" => dispatch_desktop_command(app, "open-desktop-diagnostics", None),
            "toggle_mute" => dispatch_desktop_command(app, "toggle-mute", None),
            "toggle_deafen" => dispatch_desktop_command(app, "toggle-deafen", None),
            "quit" => request_app_quit(app, &close_coordinator),
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

fn request_app_quit(app: &tauri::AppHandle, close_coordinator: &DesktopCloseCoordinator) {
    let Some(request_id) = begin_desktop_close_request(close_coordinator) else {
        return;
    };

    let Some(window) = app.get_webview_window("main") else {
        if complete_desktop_close_request(close_coordinator, request_id) {
            app.exit(0);
        }
        return;
    };

    let script = format!(
        "window.dispatchEvent(new CustomEvent('whispr:desktop-before-close', {{ detail: {{ requestId: {request_id} }}, cancelable: true }}));"
    );
    if window.eval(&script).is_err() {
        if complete_desktop_close_request(close_coordinator, request_id) {
            app.exit(0);
        }
        return;
    }

    let app_handle = app.clone();
    let timeout_coordinator = close_coordinator.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(DESKTOP_BEFORE_CLOSE_TIMEOUT_MS));
        if complete_desktop_close_request(&timeout_coordinator, request_id) {
            app_handle.exit(0);
        }
    });
}

fn begin_desktop_close_request(close_coordinator: &DesktopCloseCoordinator) -> Option<u64> {
    close_coordinator.state.lock().ok().and_then(|mut state| {
        if state.exiting || state.pending_request_id.is_some() {
            return None;
        }

        state.next_request_id = state.next_request_id.saturating_add(1).max(1);
        let request_id = state.next_request_id;
        state.pending_request_id = Some(request_id);
        Some(request_id)
    })
}

fn complete_desktop_close_request(
    close_coordinator: &DesktopCloseCoordinator,
    request_id: u64,
) -> bool {
    close_coordinator
        .state
        .lock()
        .map(|mut state| {
            if state.exiting || state.pending_request_id != Some(request_id) {
                return false;
            }

            state.exiting = true;
            state.pending_request_id = None;
            true
        })
        .unwrap_or(false)
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

    let mut url = Url::parse(&raw_url).expect("WHISPR_DESKTOP_WEB_URL must be a valid URL");

    if !cfg!(debug_assertions) && url.scheme() != "https" {
        panic!("WHISPR_DESKTOP_WEB_URL must use HTTPS in production desktop builds");
    }

    if url.path() == "/" {
        url.set_path(DESKTOP_START_PATH);
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
        || path == DESKTOP_START_PATH
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
