use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::Write,
    panic,
    path::PathBuf,
    str::FromStr,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowResponse, PageLoadEvent, WebviewWindow},
    AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};
use url::Url;

#[cfg(windows)]
use std::path::Path;

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HWND, LPARAM, RECT},
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
    },
    System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
    UI::WindowsAndMessaging::{
        EnumChildWindows, GetAncestor, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetLayeredWindowAttributes,
        SetWindowLongPtrW, SetWindowPos, ShowWindow, GA_ROOT, GWL_EXSTYLE, GWL_STYLE,
        HWND_NOTOPMOST, HWND_TOPMOST, LWA_ALPHA, SWP_FRAMECHANGED, SWP_HIDEWINDOW,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSENDCHANGING, SWP_NOSIZE,
        SWP_SHOWWINDOW, SW_HIDE, SW_SHOWNOACTIVATE, WS_BORDER, WS_CAPTION, WS_DLGFRAME,
        WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_THICKFRAME,
    },
};

const DESKTOP_INIT_SCRIPT_TEMPLATE: &str = r#"
Object.defineProperty(window, "__WHISPR_DESKTOP__", {
  value: Object.freeze({
    platform: "tauri",
    releaseRing: __WHISPR_DESKTOP_RELEASE_RING__,
    shell: "desktop",
    features: Object.freeze({
      updater: __WHISPR_DESKTOP_UPDATER_ENABLED__
    })
  }),
  configurable: false,
  enumerable: false,
  writable: false
});
const markWhisprDesktopChrome = () => {
  const isTransparentSurface =
    window.location?.pathname === "/desktop/voice-mini" ||
    window.location?.pathname === "/desktop/game-overlay";
  document.documentElement?.classList.toggle(
    "whispr-desktop-transparent-surface",
    Boolean(isTransparentSurface)
  );
  if (
    window.location?.pathname === "/desktop/start" ||
    window.location?.pathname === "/desktop/voice-mini" ||
    window.location?.pathname === "/desktop/game-overlay"
  ) {
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

const DESKTOP_MAIN_WINDOW_LABEL: &str = "main";
const DESKTOP_START_PATH: &str = "/desktop/start";
const DESKTOP_GAME_OVERLAY_PATH: &str = "/desktop/game-overlay";
const DESKTOP_GAME_OVERLAY_WINDOW_LABEL: &str = "game-overlay";
const DESKTOP_GAME_OVERLAY_WIDTH: f64 = 320.0;
const DESKTOP_GAME_OVERLAY_HEIGHT: f64 = 420.0;
const DESKTOP_VOICE_MINI_PATH: &str = "/desktop/voice-mini";
const DESKTOP_VOICE_MINI_WINDOW_LABEL: &str = "voice-mini";
const DESKTOP_VOICE_MINI_WIDTH: f64 = 344.0;
const DESKTOP_VOICE_MINI_HEIGHT: f64 = 112.0;
const DESKTOP_MAIN_WINDOW_WIDTH: f64 = 1920.0;
const DESKTOP_MAIN_WINDOW_HEIGHT: f64 = 1080.0;
const DESKTOP_MIN_WINDOW_WIDTH: f64 = 960.0;
const DESKTOP_MIN_WINDOW_HEIGHT: f64 = 640.0;
const DESKTOP_SPLASH_WINDOW_WIDTH: f64 = 432.0;
const DESKTOP_SPLASH_WINDOW_HEIGHT: f64 = 292.0;
const DESKTOP_BEFORE_CLOSE_TIMEOUT_MS: u64 = 3_000;
const DESKTOP_MAIN_WINDOW_STATE_FILENAME: &str = ".window-state.json";
const DESKTOP_PLUGIN_WINDOW_STATE_FILENAME: &str = ".tauri-window-state.json";
const DESKTOP_TRAY_ID: &str = "whispr-main";
const MAX_DESKTOP_SHORTCUTS: usize = 4;
const MAX_DESKTOP_SHORTCUT_LENGTH: usize = 64;
const MAX_DESKTOP_GAME_OVERLAY_SNAPSHOT_BYTES: usize = 16_384;
const MAX_DESKTOP_VOICE_MINI_SNAPSHOT_BYTES: usize = 16_384;
const DESKTOP_NATIVE_LOG_FILENAME: &str = "desktop-diagnostics.log";
const DESKTOP_NATIVE_LOG_MAX_BYTES: u64 = 256 * 1024;
const DESKTOP_NATIVE_LOG_MAX_LINES: usize = 200;
const DESKTOP_DIAGNOSTIC_TEXT_MAX_CHARS: usize = 512;
const DESKTOP_SUPPORT_BUNDLE_VERSION: u8 = 2;

fn desktop_init_script(updater_enabled: bool, release_ring: &str) -> String {
    let release_ring_json =
        serde_json::to_string(release_ring).unwrap_or_else(|_| "\"uat\"".into());

    DESKTOP_INIT_SCRIPT_TEMPLATE
        .replace(
            "__WHISPR_DESKTOP_UPDATER_ENABLED__",
            if updater_enabled { "true" } else { "false" },
        )
        .replace(
            "__WHISPR_DESKTOP_RELEASE_RING__",
            release_ring_json.as_str(),
        )
}

fn desktop_release_ring() -> String {
    match desktop_config_value("WHISPR_DESKTOP_RELEASE_RING", "uat").as_str() {
        "production" => "production".into(),
        "production-small" => "production-small".into(),
        "dev" => "dev".into(),
        "canary" => "canary".into(),
        "stable" => "stable".into(),
        _ => "uat".into(),
    }
}

fn desktop_updater_enabled() -> bool {
    matches!(
        desktop_config_value("WHISPR_DESKTOP_UPDATER_ENABLED", "").as_str(),
        "1" | "true"
    )
}

fn desktop_config_value(name: &str, fallback: &str) -> String {
    if let Ok(value) = std::env::var(name) {
        return value;
    }

    match name {
        "WHISPR_DESKTOP_WEB_URL" => option_env!("WHISPR_DESKTOP_WEB_URL")
            .unwrap_or(fallback)
            .to_string(),
        "WHISPR_DESKTOP_RELEASE_RING" => option_env!("WHISPR_DESKTOP_RELEASE_RING")
            .unwrap_or(fallback)
            .to_string(),
        "WHISPR_DESKTOP_UPDATER_ENABLED" => option_env!("WHISPR_DESKTOP_UPDATER_ENABLED")
            .unwrap_or(fallback)
            .to_string(),
        _ => fallback.to_string(),
    }
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn desktop_window_state_flags() -> tauri_plugin_window_state::StateFlags {
    use tauri_plugin_window_state::StateFlags;

    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

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

#[derive(Clone, Default)]
struct DesktopWindowPromotionState {
    promoted: Arc<Mutex<bool>>,
}

#[derive(Clone, Default)]
struct DesktopCloseBehaviorState {
    quit_on_close: Arc<Mutex<bool>>,
}

#[derive(Clone, Default)]
struct DesktopCompanionSurfaceState {
    last_error: Arc<Mutex<Option<String>>>,
}

impl DesktopCompanionSurfaceState {
    fn clear_error(&self) {
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = None;
        }
    }

    fn last_error(&self) -> Option<String> {
        self.last_error
            .lock()
            .ok()
            .and_then(|last_error| last_error.clone())
    }

    fn set_error(&self, error: String) {
        eprintln!("Desktop companion surface error: {error}");
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = Some(error);
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopNativeLogRecord {
    level: String,
    message: String,
    scope: String,
    timestamp_ms: u64,
}

#[derive(Clone, Default)]
struct DesktopNativeLogState {
    records: Arc<Mutex<Vec<DesktopNativeLogRecord>>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSupportWebDiagnostics {
    network_status: String,
    notification_permission: String,
    overlay_health: String,
    socket_status: String,
    user_agent: String,
    voice_status: String,
}

impl DesktopSupportWebDiagnostics {
    fn sanitized(self) -> Self {
        Self {
            network_status: sanitize_diagnostic_text(&self.network_status),
            notification_permission: sanitize_diagnostic_text(&self.notification_permission),
            overlay_health: sanitize_diagnostic_text(&self.overlay_health),
            socket_status: sanitize_diagnostic_text(&self.socket_status),
            user_agent: sanitize_diagnostic_text(&self.user_agent),
            voice_status: sanitize_diagnostic_text(&self.voice_status),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSupportAppInfo {
    app_version: &'static str,
    release_ring: String,
    tauri_version: &'static str,
    updater_enabled: bool,
    webview_version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSupportPlatformInfo {
    arch: &'static str,
    family: &'static str,
    os: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSupportBundle {
    app: DesktopSupportAppInfo,
    bundle_version: u8,
    capabilities: DesktopPlatformCapabilities,
    companion_surfaces: DesktopCompanionSurfacesStatus,
    generated_at_ms: u64,
    native_logs: Vec<DesktopNativeLogRecord>,
    platform: DesktopSupportPlatformInfo,
    shortcuts: DesktopVoiceShortcutStatus,
    web: DesktopSupportWebDiagnostics,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct DesktopSavedWindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    prev_x: i32,
    prev_y: i32,
    maximized: bool,
    visible: bool,
    decorated: bool,
    fullscreen: bool,
}

impl DesktopSavedWindowState {
    fn has_usable_main_size(&self) -> bool {
        self.width >= DESKTOP_MIN_WINDOW_WIDTH as u32
            && self.height >= DESKTOP_MIN_WINDOW_HEIGHT as u32
    }
}

#[derive(Debug, Clone, Copy)]
enum DesktopActivityStatus {
    Idle,
    Offline,
    Reconnecting,
    Streaming,
    Voice,
}

impl DesktopActivityStatus {
    fn from_optional(value: Option<&str>) -> Result<Self, String> {
        match value.unwrap_or("idle") {
            "idle" => Ok(Self::Idle),
            "offline" => Ok(Self::Offline),
            "reconnecting" => Ok(Self::Reconnecting),
            "streaming" => Ok(Self::Streaming),
            "voice" => Ok(Self::Voice),
            _ => Err("Desktop activity status is not allowed.".to_string()),
        }
    }

    fn title(self) -> &'static str {
        match self {
            Self::Idle => "Whispr",
            Self::Offline => "Whispr - Offline",
            Self::Reconnecting => "Whispr - Reconnecting",
            Self::Streaming => "Whispr - Screen sharing",
            Self::Voice => "Whispr - In voice",
        }
    }

    fn tray_tooltip(self) -> &'static str {
        match self {
            Self::Idle => "Whispr Desktop",
            Self::Offline => "Whispr Desktop - Offline",
            Self::Reconnecting => "Whispr Desktop - Reconnecting",
            Self::Streaming => "Whispr Desktop - Screen sharing",
            Self::Voice => "Whispr Desktop - In voice",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopPlatformFeature {
    fallback: &'static str,
    permission: &'static str,
    status: &'static str,
    strategy: &'static str,
    user_control: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopPlatformCapabilities {
    arch: &'static str,
    hardware_encode: DesktopPlatformFeature,
    livekit_custom_track: DesktopPlatformFeature,
    native_screen_capture: DesktopPlatformFeature,
    platform: &'static str,
    rich_presence: DesktopPlatformFeature,
    system_audio_capture: DesktopPlatformFeature,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCompanionSurfaceInfo {
    exists: bool,
    height: Option<u32>,
    minimized: bool,
    visible: bool,
    width: Option<u32>,
    x: Option<i32>,
    y: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCompanionSurfacesStatus {
    game_overlay: DesktopCompanionSurfaceInfo,
    last_error: Option<String>,
    voice_mini: DesktopCompanionSurfaceInfo,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopGameOverlayAnchor {
    BottomLeft,
    BottomRight,
    TopLeft,
    TopRight,
}

impl Default for DesktopGameOverlayAnchor {
    fn default() -> Self {
        Self::TopLeft
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopGameOverlaySize {
    Compact,
    Large,
    Normal,
}

impl Default for DesktopGameOverlaySize {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopGameOverlayLayout {
    anchor: Option<DesktopGameOverlayAnchor>,
    size: Option<DesktopGameOverlaySize>,
}

impl DesktopGameOverlayLayout {
    fn anchor(self) -> DesktopGameOverlayAnchor {
        self.anchor.unwrap_or_default()
    }

    fn size(self) -> DesktopGameOverlaySize {
        self.size.unwrap_or_default()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DesktopVoiceShortcutAction {
    HideGameOverlay,
    PushToTalk,
    ToggleDeafen,
    ToggleMute,
}

impl DesktopVoiceShortcutAction {
    fn command(self, is_pressed: bool) -> Option<&'static str> {
        match (self, is_pressed) {
            (Self::HideGameOverlay, true) => Some("hide-game-overlay"),
            (Self::ToggleMute, true) => Some("toggle-mute"),
            (Self::ToggleDeafen, true) => Some("toggle-deafen"),
            (Self::PushToTalk, true) => Some("voice-shortcut-push-to-talk-start"),
            (Self::PushToTalk, false) => Some("voice-shortcut-push-to-talk-stop"),
            (Self::HideGameOverlay | Self::ToggleMute | Self::ToggleDeafen, false) => None,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::HideGameOverlay => "hideGameOverlay",
            Self::PushToTalk => "pushToTalk",
            Self::ToggleDeafen => "toggleDeafen",
            Self::ToggleMute => "toggleMute",
        }
    }
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
#[derive(Debug, Clone, Copy)]
struct DesktopVoiceShortcutEntry {
    action: DesktopVoiceShortcutAction,
    shortcut: tauri_plugin_global_shortcut::Shortcut,
}

#[derive(Clone, Default)]
struct DesktopVoiceShortcutRegistry {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    entries: Arc<Mutex<Vec<DesktopVoiceShortcutEntry>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopVoiceShortcutConfig {
    hide_game_overlay: Option<String>,
    shortcuts_enabled: bool,
    push_to_talk: Option<String>,
    toggle_deafen: Option<String>,
    toggle_mute: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopVoiceShortcutRegistration {
    action: &'static str,
    shortcut: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopVoiceShortcutStatus {
    enabled: bool,
    registered: Vec<DesktopVoiceShortcutRegistration>,
}

pub fn run() {
    let desktop_app_name =
        std::env::var("WHISPR_DESKTOP_APP_NAME").unwrap_or_else(|_| "Whispr".into());
    let desktop_release_ring = desktop_release_ring();
    let desktop_updater_enabled = desktop_updater_enabled();
    let voice_shortcut_registry = DesktopVoiceShortcutRegistry::default();
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        let shortcut_events = voice_shortcut_registry.clone();
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            show_main_window(app);
            handle_desktop_deep_links(app, argv.iter().map(String::as_str));
        }));
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    dispatch_voice_shortcut_event(app, &shortcut_events, event);
                })
                .build(),
        );
        builder = builder.plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name(desktop_app_name.clone())
                .build(),
        );
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(desktop_window_state_flags())
                .with_filename(DESKTOP_PLUGIN_WINDOW_STATE_FILENAME)
                .with_filter(|_| false)
                .build(),
        );
        if desktop_updater_enabled {
            builder = builder.plugin(tauri_plugin_process::init());
            builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        }
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .manage(DesktopCloseCoordinator::default())
        .manage(DesktopCloseBehaviorState::default())
        .manage(DesktopCompanionSurfaceState::default())
        .manage(DesktopNativeLogState::default())
        .manage(DesktopWindowPromotionState::default())
        .manage(voice_shortcut_registry)
        .invoke_handler(tauri::generate_handler![
            complete_desktop_before_close,
            configure_desktop_voice_shortcuts,
            export_desktop_diagnostics_bundle,
            get_desktop_quit_on_close_enabled,
            get_desktop_autostart_enabled,
            get_desktop_foreground_process_name,
            get_desktop_main_window_focused,
            get_desktop_companion_surfaces_status,
            get_desktop_platform_capabilities,
            get_desktop_voice_shortcut_status,
            publish_desktop_game_overlay_snapshot,
            publish_desktop_voice_mini_snapshot,
            refresh_desktop_companion_surfaces,
            set_desktop_activity_status,
            set_desktop_game_overlay_visible,
            set_desktop_voice_mini_visible,
            promote_desktop_main_window,
            set_desktop_quit_on_close_enabled,
            set_desktop_autostart_enabled
        ])
        .setup(move |app| {
            let app_url = configured_app_url();
            let app_name = desktop_app_name.clone();
            let init_script =
                desktop_init_script(desktop_updater_enabled, desktop_release_ring.as_str());
            let oauth_navigation_active = Arc::new(Mutex::new(false));
            let close_coordinator = app.state::<DesktopCloseCoordinator>().inner().clone();
            let close_behavior_state = app.state::<DesktopCloseBehaviorState>().inner().clone();
            let promotion_state = app.state::<DesktopWindowPromotionState>().inner().clone();
            let native_log_state = app.state::<DesktopNativeLogState>().inner().clone();
            let webview_data_directory = resolve_webview_data_directory(app)?;
            install_desktop_panic_hook(app.handle().clone(), native_log_state);
            record_desktop_native_log(
                app.handle(),
                "info",
                "desktop_setup",
                "Desktop shell setup started.",
            );
            set_desktop_window_promoted(&promotion_state, app_url.path() != DESKTOP_START_PATH);

            setup_tray(
                app,
                &app_name,
                close_coordinator.clone(),
                promotion_state.clone(),
            )?;

            let mut main_window_builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(app_url.clone()))
                    .title(app_name)
                    .decorations(false)
                    .center()
                    .data_directory(webview_data_directory)
                    .initialization_script(init_script)
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
                        let promotion_state = promotion_state.clone();

                        move |window, payload| {
                            let url = payload.url();
                            if !is_same_origin(url, &allowed_origin) {
                                return;
                            }

                            match payload.event() {
                                PageLoadEvent::Started if url.path() != DESKTOP_START_PATH => {
                                    promote_desktop_window(&window, &promotion_state);
                                }
                                PageLoadEvent::Finished if url.path() == DESKTOP_START_PATH => {
                                    prepare_desktop_start_window(&window);
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
            let close_request_behavior_state = close_behavior_state.clone();
            let close_request_coordinator = close_coordinator.clone();
            let close_request_promotion_state = promotion_state.clone();

            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    request_main_window_close(
                        &close_request_app,
                        &close_request_behavior_state,
                        &close_request_coordinator,
                        &close_request_promotion_state,
                    );
                }
            });

            setup_deep_links(app.handle())?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Whispr desktop");
}

fn is_authorized_desktop_command_window_label(label: &str) -> bool {
    label == DESKTOP_MAIN_WINDOW_LABEL
}

fn assert_desktop_main_command_window(window: &WebviewWindow) -> Result<(), String> {
    if is_authorized_desktop_command_window_label(window.label()) {
        return Ok(());
    }

    Err("Desktop command is only available to the main Whispr window.".to_string())
}

#[tauri::command]
fn complete_desktop_before_close(
    window: WebviewWindow,
    app: AppHandle,
    close_coordinator: tauri::State<'_, DesktopCloseCoordinator>,
    promotion_state: tauri::State<'_, DesktopWindowPromotionState>,
    request_id: u64,
) -> Result<(), String> {
    assert_desktop_main_command_window(&window)?;

    if complete_desktop_close_request(close_coordinator.inner(), request_id) {
        record_desktop_native_log(
            &app,
            "info",
            "close_handshake",
            "Web cleanup acknowledged; exiting.",
        );
        save_desktop_main_window_state(&app, promotion_state.inner());
        app.exit(0);
    }

    Ok(())
}

#[tauri::command]
fn promote_desktop_main_window(
    window: WebviewWindow,
    app: AppHandle,
    promotion_state: tauri::State<'_, DesktopWindowPromotionState>,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(false);
    };

    promote_desktop_window(&window, promotion_state.inner());
    Ok(true)
}

#[tauri::command]
fn configure_desktop_voice_shortcuts(
    window: WebviewWindow,
    app: AppHandle,
    registry: tauri::State<'_, DesktopVoiceShortcutRegistry>,
    config: DesktopVoiceShortcutConfig,
) -> Result<DesktopVoiceShortcutStatus, String> {
    assert_desktop_main_command_window(&window)?;

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        configure_desktop_voice_shortcuts_impl(&app, registry.inner(), config)
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = (app, registry, config);
        Err("Desktop voice shortcuts are not supported on this platform.".to_string())
    }
}

#[tauri::command]
fn get_desktop_voice_shortcut_status(
    window: WebviewWindow,
    registry: tauri::State<'_, DesktopVoiceShortcutRegistry>,
) -> Result<DesktopVoiceShortcutStatus, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(desktop_voice_shortcut_registry_status(registry.inner()))
}

#[tauri::command]
fn export_desktop_diagnostics_bundle(
    window: WebviewWindow,
    app: AppHandle,
    surface_state: tauri::State<'_, DesktopCompanionSurfaceState>,
    registry: tauri::State<'_, DesktopVoiceShortcutRegistry>,
    web: DesktopSupportWebDiagnostics,
) -> Result<DesktopSupportBundle, String> {
    assert_desktop_main_command_window(&window)?;

    record_desktop_native_log(
        &app,
        "info",
        "diagnostics_export",
        "Desktop diagnostics support bundle exported.",
    );

    Ok(DesktopSupportBundle {
        app: DesktopSupportAppInfo {
            app_version: env!("CARGO_PKG_VERSION"),
            release_ring: desktop_release_ring(),
            tauri_version: tauri::VERSION,
            updater_enabled: desktop_updater_enabled(),
            webview_version: tauri::webview_version().unwrap_or_else(|_| "unknown".into()),
        },
        bundle_version: DESKTOP_SUPPORT_BUNDLE_VERSION,
        capabilities: desktop_platform_capabilities(),
        companion_surfaces: desktop_companion_surfaces_status(&app, surface_state.inner()),
        generated_at_ms: current_unix_ms(),
        native_logs: read_desktop_native_logs(&app),
        platform: DesktopSupportPlatformInfo {
            arch: std::env::consts::ARCH,
            family: std::env::consts::FAMILY,
            os: std::env::consts::OS,
        },
        shortcuts: desktop_voice_shortcut_registry_status(registry.inner()),
        web: web.sanitized(),
    })
}

#[tauri::command]
fn get_desktop_autostart_enabled(window: WebviewWindow, app: AppHandle) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch()
            .is_enabled()
            .map_err(|error| format!("Unable to read desktop startup setting: {error}"))
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
fn set_desktop_autostart_enabled(
    window: WebviewWindow,
    app: AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        use tauri_plugin_autostart::ManagerExt;
        let autolaunch = app.autolaunch();
        if enabled {
            autolaunch
                .enable()
                .map_err(|error| format!("Unable to enable desktop startup: {error}"))?;
        } else {
            autolaunch
                .disable()
                .map_err(|error| format!("Unable to disable desktop startup: {error}"))?;
        }
        autolaunch
            .is_enabled()
            .map_err(|error| format!("Unable to verify desktop startup setting: {error}"))
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
fn get_desktop_quit_on_close_enabled(
    window: WebviewWindow,
    close_behavior: tauri::State<'_, DesktopCloseBehaviorState>,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(is_desktop_quit_on_close_enabled(close_behavior.inner()))
}

#[tauri::command]
fn set_desktop_quit_on_close_enabled(
    window: WebviewWindow,
    close_behavior: tauri::State<'_, DesktopCloseBehaviorState>,
    enabled: bool,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    set_desktop_quit_on_close(close_behavior.inner(), enabled);
    Ok(enabled)
}

#[tauri::command]
fn get_desktop_platform_capabilities(
    window: WebviewWindow,
) -> Result<DesktopPlatformCapabilities, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(desktop_platform_capabilities())
}

fn desktop_platform_capabilities() -> DesktopPlatformCapabilities {
    DesktopPlatformCapabilities {
        arch: std::env::consts::ARCH,
        hardware_encode: desktop_research_feature(
            "webrtc_codec_hint_telemetry_only",
            "os_webview_encoder_selection",
            "not_applicable",
            "codec_hint_only",
        ),
        livekit_custom_track: desktop_research_feature(
            "livekit_custom_track_factory_spike",
            "standard_livekit_get_display_media",
            "user_initiated_capture_required",
            "explicit_user_permission_required",
        ),
        native_screen_capture: desktop_research_feature(
            native_screen_capture_strategy(),
            "browser_get_display_media",
            native_screen_capture_permission_strategy(),
            "explicit_user_permission_required",
        ),
        platform: std::env::consts::OS,
        rich_presence: DesktopPlatformFeature {
            fallback: "none",
            permission: "not_applicable",
            status: "available",
            strategy: "local_window_and_tray_activity",
            user_control: "opt_in",
        },
        system_audio_capture: desktop_research_feature(
            system_audio_capture_strategy(),
            "no_system_audio_capture",
            system_audio_capture_permission_strategy(),
            "explicit_user_permission_required",
        ),
    }
}

fn desktop_research_feature(
    strategy: &'static str,
    fallback: &'static str,
    permission: &'static str,
    user_control: &'static str,
) -> DesktopPlatformFeature {
    DesktopPlatformFeature {
        fallback,
        permission,
        status: "research_gated",
        strategy,
        user_control,
    }
}

#[tauri::command]
fn get_desktop_foreground_process_name(window: WebviewWindow) -> Result<Option<String>, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(desktop_foreground_process_name())
}

#[tauri::command]
fn get_desktop_main_window_focused(window: WebviewWindow, app: AppHandle) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(is_main_window_focused(&app))
}

#[tauri::command]
fn get_desktop_companion_surfaces_status(
    window: WebviewWindow,
    app: AppHandle,
    surface_state: tauri::State<'_, DesktopCompanionSurfaceState>,
) -> Result<DesktopCompanionSurfacesStatus, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(desktop_companion_surfaces_status(
        &app,
        surface_state.inner(),
    ))
}

#[tauri::command]
fn refresh_desktop_companion_surfaces(
    window: WebviewWindow,
    app: AppHandle,
    surface_state: tauri::State<'_, DesktopCompanionSurfaceState>,
    layout: Option<DesktopGameOverlayLayout>,
) -> Result<DesktopCompanionSurfacesStatus, String> {
    assert_desktop_main_command_window(&window)?;

    let layout = layout.unwrap_or_default();
    let state_for_task = surface_state.inner().clone();

    schedule_desktop_companion_surface_task(&app, "refresh", state_for_task, move |app_handle| {
        let (overlay_width, overlay_height) = desktop_game_overlay_size(layout.size());
        refresh_desktop_companion_surface_window(
            &app_handle,
            DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
            overlay_width,
            overlay_height,
            desktop_game_overlay_bottom_offset(layout.anchor()),
            layout.anchor(),
            true,
        )?;

        refresh_desktop_companion_surface_window(
            &app_handle,
            DESKTOP_VOICE_MINI_WINDOW_LABEL,
            DESKTOP_VOICE_MINI_WIDTH,
            DESKTOP_VOICE_MINI_HEIGHT,
            0,
            DesktopGameOverlayAnchor::BottomRight,
            false,
        )?;

        Ok(())
    });

    Ok(desktop_companion_surfaces_queued_status(
        &app,
        surface_state.inner(),
    ))
}

#[tauri::command]
fn set_desktop_activity_status(
    window: WebviewWindow,
    app: AppHandle,
    status: Option<String>,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    let status = DesktopActivityStatus::from_optional(status.as_deref())?;

    if let Some(window) = app.get_webview_window("main") {
        window
            .set_title(status.title())
            .map_err(|error| format!("Unable to update desktop window activity: {error}"))?;
    }

    if let Some(tray) = app.tray_by_id(DESKTOP_TRAY_ID) {
        tray.set_tooltip(Some(status.tray_tooltip()))
            .map_err(|error| format!("Unable to update desktop tray activity: {error}"))?;
    }

    Ok(true)
}

#[tauri::command]
fn set_desktop_game_overlay_visible(
    window: WebviewWindow,
    app: AppHandle,
    surface_state: tauri::State<'_, DesktopCompanionSurfaceState>,
    visible: bool,
    layout: Option<DesktopGameOverlayLayout>,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    let layout = layout.unwrap_or_default();
    let state_for_task = surface_state.inner().clone();
    schedule_desktop_companion_surface_task(
        &app,
        "game-overlay-visibility",
        state_for_task,
        move |app_handle| {
            if visible {
                show_or_create_desktop_game_overlay_window(&app_handle, layout)
            } else {
                hide_desktop_game_overlay_window(&app_handle)
            }
        },
    );

    Ok(visible)
}

#[tauri::command]
fn publish_desktop_game_overlay_snapshot(
    window: WebviewWindow,
    app: AppHandle,
    snapshot: serde_json::Value,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    publish_desktop_snapshot_to_window(
        &app,
        DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
        "whispr:desktop-game-overlay-snapshot",
        snapshot,
        MAX_DESKTOP_GAME_OVERLAY_SNAPSHOT_BYTES,
        "game overlay",
    )
}

#[tauri::command]
fn set_desktop_voice_mini_visible(
    window: WebviewWindow,
    app: AppHandle,
    surface_state: tauri::State<'_, DesktopCompanionSurfaceState>,
    visible: bool,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    let state_for_task = surface_state.inner().clone();
    schedule_desktop_companion_surface_task(
        &app,
        "voice-mini-visibility",
        state_for_task,
        move |app_handle| {
            if visible {
                show_or_create_desktop_voice_mini_window(&app_handle)
            } else {
                hide_desktop_voice_mini_window(&app_handle)
            }
        },
    );

    Ok(visible)
}

#[tauri::command]
fn publish_desktop_voice_mini_snapshot(
    window: WebviewWindow,
    app: AppHandle,
    snapshot: serde_json::Value,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    publish_desktop_snapshot_to_window(
        &app,
        DESKTOP_VOICE_MINI_WINDOW_LABEL,
        "whispr:desktop-voice-mini-snapshot",
        snapshot,
        MAX_DESKTOP_VOICE_MINI_SNAPSHOT_BYTES,
        "voice mini",
    )
}

fn publish_desktop_snapshot_to_window(
    app: &AppHandle,
    window_label: &str,
    event_name: &str,
    snapshot: serde_json::Value,
    max_bytes: usize,
    description: &str,
) -> Result<bool, String> {
    let Some(window) = app.get_webview_window(window_label) else {
        return Ok(false);
    };

    let snapshot_json = serde_json::to_string(&snapshot)
        .map_err(|error| format!("Unable to serialize desktop {description} snapshot: {error}"))?;

    if snapshot_json.len() > max_bytes {
        return Err(format!("Desktop {description} snapshot is too large."));
    }

    let event_json = serde_json::to_string(event_name)
        .map_err(|error| format!("Unable to serialize desktop {description} event: {error}"))?;
    let script = format!(
        "window.dispatchEvent(new CustomEvent({event_json}, {{ detail: {snapshot_json} }}));"
    );
    window
        .eval(&script)
        .map_err(|error| format!("Unable to publish desktop {description} snapshot: {error}"))?;

    Ok(true)
}

fn schedule_desktop_companion_surface_task<F>(
    app: &AppHandle,
    label: &'static str,
    surface_state: DesktopCompanionSurfaceState,
    task: F,
) where
    F: FnOnce(AppHandle) -> Result<(), String> + Send + 'static,
{
    surface_state.clear_error();
    record_desktop_native_log(
        app,
        "info",
        "companion_surface",
        format!("Task started: {label}").as_str(),
    );

    let app_for_task = app.clone();
    let state_for_task = surface_state.clone();
    let spawn_result = std::thread::Builder::new()
        .name(format!("whispr-desktop-surface-{label}"))
        .spawn(move || {
            eprintln!("Desktop companion surface task started: {label}");
            match task(app_for_task.clone()) {
                Ok(()) => {
                    eprintln!("Desktop companion surface task succeeded: {label}");
                    record_desktop_native_log(
                        &app_for_task,
                        "info",
                        "companion_surface",
                        format!("Task succeeded: {label}").as_str(),
                    );
                    state_for_task.clear_error();
                }
                Err(error) => {
                    record_desktop_native_log(
                        &app_for_task,
                        "error",
                        "companion_surface",
                        format!("Task failed: {label}: {error}").as_str(),
                    );
                    state_for_task.set_error(error);
                }
            };
        });

    if let Err(error) = spawn_result {
        record_desktop_native_log(
            app,
            "error",
            "companion_surface",
            format!("Unable to start task: {label}: {error}").as_str(),
        );
        surface_state.set_error(format!(
            "Unable to start desktop companion surface task: {error}"
        ));
    }
}

fn current_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

fn sanitize_diagnostic_text(value: &str) -> String {
    let normalized = value
        .chars()
        .map(|character| {
            if character.is_control() && character != '\n' && character != '\t' {
                ' '
            } else {
                character
            }
        })
        .collect::<String>();
    let lower = normalized.to_ascii_lowercase();

    if [
        "authorization",
        "bearer",
        "cookie",
        "password",
        "secret",
        "session",
        "token",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
    {
        return "[redacted-sensitive-diagnostic]".into();
    }

    let redacted = normalized
        .split_whitespace()
        .map(|part| {
            if part.contains('@') {
                "[redacted-email]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ");

    redacted
        .chars()
        .take(DESKTOP_DIAGNOSTIC_TEXT_MAX_CHARS)
        .collect()
}

fn desktop_native_log_path(app: &AppHandle) -> Option<PathBuf> {
    let log_dir = app.path().app_log_dir().ok()?;
    if fs::create_dir_all(&log_dir).is_err() {
        return None;
    }

    Some(log_dir.join(DESKTOP_NATIVE_LOG_FILENAME))
}

fn push_desktop_native_log_record(
    app: Option<&AppHandle>,
    state: &DesktopNativeLogState,
    record: DesktopNativeLogRecord,
) {
    if let Ok(mut records) = state.records.lock() {
        records.push(record.clone());
        if records.len() > DESKTOP_NATIVE_LOG_MAX_LINES {
            let overflow = records.len() - DESKTOP_NATIVE_LOG_MAX_LINES;
            records.drain(0..overflow);
        }
    }

    let Some(app) = app else {
        return;
    };
    let Some(path) = desktop_native_log_path(app) else {
        return;
    };

    if fs::metadata(&path)
        .map(|metadata| metadata.len() > DESKTOP_NATIVE_LOG_MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::write(&path, "");
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        if let Ok(line) = serde_json::to_string(&record) {
            let _ = writeln!(file, "{line}");
        }
    }
}

fn record_desktop_native_log(app: &AppHandle, level: &str, scope: &str, message: &str) {
    let state = app.state::<DesktopNativeLogState>().inner().clone();
    push_desktop_native_log_record(
        Some(app),
        &state,
        DesktopNativeLogRecord {
            level: sanitize_diagnostic_text(level),
            message: sanitize_diagnostic_text(message),
            scope: sanitize_diagnostic_text(scope),
            timestamp_ms: current_unix_ms(),
        },
    );
}

fn record_desktop_native_log_with_state(
    app: Option<&AppHandle>,
    state: &DesktopNativeLogState,
    level: &str,
    scope: &str,
    message: &str,
) {
    push_desktop_native_log_record(
        app,
        state,
        DesktopNativeLogRecord {
            level: sanitize_diagnostic_text(level),
            message: sanitize_diagnostic_text(message),
            scope: sanitize_diagnostic_text(scope),
            timestamp_ms: current_unix_ms(),
        },
    );
}

fn read_desktop_native_logs(app: &AppHandle) -> Vec<DesktopNativeLogRecord> {
    let state = app.state::<DesktopNativeLogState>().inner().clone();
    let memory_records = state
        .records
        .lock()
        .map(|records| records.clone())
        .unwrap_or_default();

    let Some(path) = desktop_native_log_path(app) else {
        return memory_records;
    };
    let Ok(content) = fs::read_to_string(path) else {
        return memory_records;
    };

    let lines = content.lines().collect::<Vec<_>>();
    let start = lines.len().saturating_sub(DESKTOP_NATIVE_LOG_MAX_LINES);
    let mut records = Vec::new();
    for line in &lines[start..] {
        if let Ok(record) = serde_json::from_str::<DesktopNativeLogRecord>(line) {
            records.push(record);
        }
    }

    if records.is_empty() {
        return memory_records;
    }

    if records.len() > DESKTOP_NATIVE_LOG_MAX_LINES {
        records.drain(0..records.len() - DESKTOP_NATIVE_LOG_MAX_LINES);
    }

    records
}

fn install_desktop_panic_hook(app: AppHandle, state: DesktopNativeLogState) {
    let default_hook = panic::take_hook();

    panic::set_hook(Box::new(move |panic_info| {
        let location = panic_info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown-location".into());
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(String::as_str)
            })
            .unwrap_or("unknown panic");

        record_desktop_native_log_with_state(
            Some(&app),
            &state,
            "error",
            "panic",
            format!("{location}: {payload}").as_str(),
        );
        default_hook(panic_info);
    }));
}

fn native_screen_capture_strategy() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows_graphics_capture_spike"
    } else if cfg!(target_os = "macos") {
        "screencapturekit_spike"
    } else if cfg!(target_os = "linux") {
        "pipewire_portal_spike"
    } else {
        "unsupported_platform"
    }
}

fn native_screen_capture_permission_strategy() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows_graphics_capture_picker_required"
    } else if cfg!(target_os = "macos") {
        "screen_recording_permission_required"
    } else if cfg!(target_os = "linux") {
        "xdg_desktop_portal_permission_required"
    } else {
        "unsupported_platform"
    }
}

fn system_audio_capture_strategy() -> &'static str {
    if cfg!(target_os = "windows") {
        "wasapi_loopback_spike"
    } else if cfg!(target_os = "macos") {
        "coreaudio_tap_spike"
    } else if cfg!(target_os = "linux") {
        "pipewire_pulseaudio_monitor_spike"
    } else {
        "unsupported_platform"
    }
}

fn system_audio_capture_permission_strategy() -> &'static str {
    if cfg!(target_os = "windows") {
        "loopback_capture_user_opt_in_required"
    } else if cfg!(target_os = "macos") {
        "screen_capture_audio_permission_research"
    } else if cfg!(target_os = "linux") {
        "pipewire_portal_audio_permission_required"
    } else {
        "unsupported_platform"
    }
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn configure_desktop_voice_shortcuts_impl(
    app: &AppHandle,
    registry: &DesktopVoiceShortcutRegistry,
    config: DesktopVoiceShortcutConfig,
) -> Result<DesktopVoiceShortcutStatus, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let previous_entries = registry
        .entries
        .lock()
        .map(|entries| entries.clone())
        .unwrap_or_default();

    if !config.shortcuts_enabled {
        unregister_desktop_voice_shortcuts(
            app,
            previous_entries.iter().map(|entry| entry.shortcut),
        )?;
        replace_desktop_voice_shortcut_entries(registry, Vec::new());
        return Ok(desktop_voice_shortcut_status(false, &[]));
    }

    let mut next_entries = Vec::new();
    push_desktop_voice_shortcut_entry(
        &mut next_entries,
        DesktopVoiceShortcutAction::ToggleMute,
        config.toggle_mute.as_deref(),
    )?;
    push_desktop_voice_shortcut_entry(
        &mut next_entries,
        DesktopVoiceShortcutAction::ToggleDeafen,
        config.toggle_deafen.as_deref(),
    )?;
    push_desktop_voice_shortcut_entry(
        &mut next_entries,
        DesktopVoiceShortcutAction::PushToTalk,
        config.push_to_talk.as_deref(),
    )?;
    push_desktop_voice_shortcut_entry(
        &mut next_entries,
        DesktopVoiceShortcutAction::HideGameOverlay,
        config.hide_game_overlay.as_deref(),
    )?;

    if next_entries.len() > MAX_DESKTOP_SHORTCUTS {
        return Err("Too many desktop voice shortcuts were requested.".to_string());
    }

    let mut seen_ids = HashSet::new();
    for entry in &next_entries {
        if !seen_ids.insert(entry.shortcut.id()) {
            return Err("Desktop voice shortcuts must be unique.".to_string());
        }
    }

    unregister_desktop_voice_shortcuts(app, previous_entries.iter().map(|entry| entry.shortcut))?;

    let mut registered_entries = Vec::new();
    for entry in &next_entries {
        if let Err(error) = app.global_shortcut().register(entry.shortcut) {
            unregister_desktop_voice_shortcuts(
                app,
                registered_entries
                    .iter()
                    .map(|registered: &DesktopVoiceShortcutEntry| registered.shortcut),
            )?;
            let _ = restore_desktop_voice_shortcuts(app, registry, previous_entries);
            return Err(format!(
                "Unable to register {} desktop voice shortcut: {error}",
                entry.action.label()
            ));
        }
        registered_entries.push(*entry);
    }

    replace_desktop_voice_shortcut_entries(registry, next_entries);
    let entries = registry
        .entries
        .lock()
        .map(|entries| entries.clone())
        .unwrap_or_default();
    Ok(desktop_voice_shortcut_status(true, &entries))
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn push_desktop_voice_shortcut_entry(
    entries: &mut Vec<DesktopVoiceShortcutEntry>,
    action: DesktopVoiceShortcutAction,
    value: Option<&str>,
) -> Result<(), String> {
    let Some(raw_shortcut) = value.map(str::trim).filter(|shortcut| !shortcut.is_empty()) else {
        return Ok(());
    };

    entries.push(DesktopVoiceShortcutEntry {
        action,
        shortcut: parse_desktop_voice_shortcut(raw_shortcut)?,
    });

    Ok(())
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn parse_desktop_voice_shortcut(
    value: &str,
) -> Result<tauri_plugin_global_shortcut::Shortcut, String> {
    use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

    if value.len() > MAX_DESKTOP_SHORTCUT_LENGTH
        || value
            .chars()
            .any(|character| matches!(character, '\0' | '\n' | '\r'))
        || is_reserved_desktop_voice_shortcut(value)
    {
        return Err("Desktop voice shortcut is invalid.".to_string());
    }

    let shortcut = Shortcut::from_str(value)
        .map_err(|error| format!("Desktop voice shortcut could not be parsed: {error}"))?;

    if shortcut.mods == Modifiers::empty() && !is_dedicated_function_key(shortcut.key) {
        return Err("Desktop voice shortcuts require a modifier key.".to_string());
    }

    Ok(shortcut)
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn normalize_desktop_voice_shortcut(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>()
        .to_lowercase()
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn is_reserved_desktop_voice_shortcut(value: &str) -> bool {
    let normalized = normalize_desktop_voice_shortcut(value);
    matches!(
        normalized.as_str(),
        "alt+escape"
            | "alt+f4"
            | "alt+space"
            | "alt+tab"
            | "cmdorctrl+space"
            | "control+space"
            | "ctrl+alt+delete"
            | "ctrl+space"
            | "meta+space"
            | "super+space"
    ) || normalized.ends_with("+space")
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn is_dedicated_function_key(key: tauri_plugin_global_shortcut::Code) -> bool {
    use tauri_plugin_global_shortcut::Code;

    matches!(
        key,
        Code::F13
            | Code::F14
            | Code::F15
            | Code::F16
            | Code::F17
            | Code::F18
            | Code::F19
            | Code::F20
            | Code::F21
            | Code::F22
            | Code::F23
            | Code::F24
    )
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn unregister_desktop_voice_shortcuts<I>(app: &AppHandle, shortcuts: I) -> Result<(), String>
where
    I: IntoIterator<Item = tauri_plugin_global_shortcut::Shortcut>,
{
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let shortcuts = shortcuts.into_iter().collect::<Vec<_>>();
    if shortcuts.is_empty() {
        return Ok(());
    }

    app.global_shortcut()
        .unregister_multiple(shortcuts)
        .map_err(|error| format!("Unable to unregister desktop voice shortcuts: {error}"))
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn restore_desktop_voice_shortcuts(
    app: &AppHandle,
    registry: &DesktopVoiceShortcutRegistry,
    previous_entries: Vec<DesktopVoiceShortcutEntry>,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    for entry in &previous_entries {
        app.global_shortcut()
            .register(entry.shortcut)
            .map_err(|error| format!("Unable to restore desktop voice shortcuts: {error}"))?;
    }

    replace_desktop_voice_shortcut_entries(registry, previous_entries);
    Ok(())
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn replace_desktop_voice_shortcut_entries(
    registry: &DesktopVoiceShortcutRegistry,
    entries: Vec<DesktopVoiceShortcutEntry>,
) {
    if let Ok(mut current_entries) = registry.entries.lock() {
        *current_entries = entries;
    }
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn desktop_voice_shortcut_status(
    enabled: bool,
    entries: &[DesktopVoiceShortcutEntry],
) -> DesktopVoiceShortcutStatus {
    DesktopVoiceShortcutStatus {
        enabled,
        registered: entries
            .iter()
            .map(|entry| DesktopVoiceShortcutRegistration {
                action: entry.action.label(),
                shortcut: entry.shortcut.into_string(),
            })
            .collect(),
    }
}

fn desktop_voice_shortcut_registry_status(
    registry: &DesktopVoiceShortcutRegistry,
) -> DesktopVoiceShortcutStatus {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        let entries = registry
            .entries
            .lock()
            .map(|entries| entries.clone())
            .unwrap_or_default();

        return desktop_voice_shortcut_status(!entries.is_empty(), &entries);
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = registry;
        DesktopVoiceShortcutStatus {
            enabled: false,
            registered: Vec::new(),
        }
    }
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn dispatch_voice_shortcut_event(
    app: &AppHandle,
    registry: &DesktopVoiceShortcutRegistry,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    use tauri_plugin_global_shortcut::ShortcutState;

    let action = registry.entries.lock().ok().and_then(|entries| {
        entries
            .iter()
            .find(|entry| entry.shortcut.id() == event.id)
            .map(|entry| entry.action)
    });
    let Some(action) = action else {
        return;
    };

    let is_pressed = event.state == ShortcutState::Pressed;
    if let Some(command) = action.command(is_pressed) {
        dispatch_desktop_command_without_focus(app, command, None);
    }
}

fn promote_desktop_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    promotion_state: &DesktopWindowPromotionState,
) {
    let should_promote = promotion_state
        .promoted
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
    let _ = window.set_resizable(true);

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        if !restore_desktop_main_window_state(window) {
            let _ = window.set_size(LogicalSize::new(
                DESKTOP_MAIN_WINDOW_WIDTH,
                DESKTOP_MAIN_WINDOW_HEIGHT,
            ));
            let _ = window.center();
        }
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = window.set_size(LogicalSize::new(
            DESKTOP_MAIN_WINDOW_WIDTH,
            DESKTOP_MAIN_WINDOW_HEIGHT,
        ));
        let _ = window.center();
    }

    let _ = window.set_min_size(Some(LogicalSize::new(
        DESKTOP_MIN_WINDOW_WIDTH,
        DESKTOP_MIN_WINDOW_HEIGHT,
    )));
}

fn prepare_desktop_start_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.set_min_size(None::<LogicalSize<f64>>);
    let _ = window.set_resizable(false);
    let _ = window.set_size(LogicalSize::new(
        DESKTOP_SPLASH_WINDOW_WIDTH,
        DESKTOP_SPLASH_WINDOW_HEIGHT,
    ));
    let _ = window.set_min_size(Some(LogicalSize::new(
        DESKTOP_SPLASH_WINDOW_WIDTH,
        DESKTOP_SPLASH_WINDOW_HEIGHT,
    )));
    let _ = window.center();
}

fn set_desktop_window_promoted(promotion_state: &DesktopWindowPromotionState, value: bool) {
    if let Ok(mut promoted) = promotion_state.promoted.lock() {
        *promoted = value;
    }
}

fn is_desktop_window_promoted(promotion_state: &DesktopWindowPromotionState) -> bool {
    promotion_state
        .promoted
        .lock()
        .map(|promoted| *promoted)
        .unwrap_or(false)
}

fn set_desktop_quit_on_close(close_behavior: &DesktopCloseBehaviorState, enabled: bool) {
    if let Ok(mut quit_on_close) = close_behavior.quit_on_close.lock() {
        *quit_on_close = enabled;
    }
}

fn is_desktop_quit_on_close_enabled(close_behavior: &DesktopCloseBehaviorState) -> bool {
    close_behavior
        .quit_on_close
        .lock()
        .map(|quit_on_close| *quit_on_close)
        .unwrap_or(false)
}

fn save_desktop_main_window_state(app: &AppHandle, promotion_state: &DesktopWindowPromotionState) {
    if !is_desktop_window_promoted(promotion_state) {
        return;
    }

    let Some(window) = app.get_webview_window("main") else {
        record_desktop_native_log(
            app,
            "warning",
            "window_state",
            "Main window missing during save.",
        );
        return;
    };

    if let Some(state) = capture_desktop_main_window_state(&window) {
        match write_desktop_main_window_state(app, state) {
            Ok(()) => {
                record_desktop_native_log(app, "info", "window_state", "Main window state saved.");
            }
            Err(error) => {
                record_desktop_native_log(
                    app,
                    "error",
                    "window_state",
                    format!("Unable to save main window state: {error}").as_str(),
                );
            }
        }
    } else {
        record_desktop_native_log(
            app,
            "warning",
            "window_state",
            "Main window state capture skipped.",
        );
    }
}

fn resolve_webview_data_directory(app: &tauri::App) -> tauri::Result<PathBuf> {
    let data_directory = webview_data_directory_path(app)?;
    std::fs::create_dir_all(&data_directory)?;
    Ok(data_directory)
}

fn resolve_webview_data_directory_for_handle(app: &tauri::AppHandle) -> tauri::Result<PathBuf> {
    let data_directory = webview_data_directory_path(app)?;
    std::fs::create_dir_all(&data_directory)?;
    Ok(data_directory)
}

fn webview_data_directory_path<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
) -> tauri::Result<PathBuf> {
    Ok(manager.path().app_data_dir()?.join("webview"))
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn restore_desktop_main_window_state<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> bool {
    let Some(state) = read_desktop_main_window_state(window.app_handle()) else {
        return false;
    };

    if !state.has_usable_main_size() || !desktop_saved_state_is_on_screen(window, &state) {
        return false;
    }

    if state.fullscreen {
        let _ = window.set_fullscreen(true);
        return true;
    }

    let restore_x = if state.maximized {
        state.prev_x
    } else {
        state.x
    };
    let restore_y = if state.maximized {
        state.prev_y
    } else {
        state.y
    };
    let _ = window.set_position(PhysicalPosition::new(restore_x, restore_y));
    let _ = window.set_size(PhysicalSize::new(state.width, state.height));

    if state.maximized {
        let _ = window.maximize();
    }

    true
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn read_desktop_main_window_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<DesktopSavedWindowState> {
    let raw_state = std::fs::read_to_string(desktop_main_window_state_path(app)).ok()?;
    let state_json = serde_json::from_str::<serde_json::Value>(&raw_state).ok()?;
    serde_json::from_value(state_json.get("main")?.clone()).ok()
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn desktop_saved_state_is_on_screen<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    state: &DesktopSavedWindowState,
) -> bool {
    let position = PhysicalPosition::new(state.x, state.y);
    let size = PhysicalSize::new(state.width, state.height);

    window
        .available_monitors()
        .map(|monitors| {
            monitors
                .iter()
                .any(|monitor| monitor_intersects_window_state(monitor, position, size))
        })
        .unwrap_or(true)
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn monitor_intersects_window_state(
    monitor: &tauri::Monitor,
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
) -> bool {
    let PhysicalPosition { x: left, y: top } = *monitor.position();
    let PhysicalSize { width, height } = *monitor.size();
    let right = left + width as i32;
    let bottom = top + height as i32;
    let state_right = position.x + size.width as i32;
    let state_bottom = position.y + size.height as i32;

    position.x < right && state_right > left && position.y < bottom && state_bottom > top
}

fn capture_desktop_main_window_state<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Option<DesktopSavedWindowState> {
    let maximized = window.is_maximized().ok()?;
    let fullscreen = window.is_fullscreen().ok()?;
    let visible = window.is_visible().unwrap_or(true);
    let decorated = window.is_decorated().unwrap_or(true);
    let previous_state = read_desktop_main_window_state(window.app_handle());
    let current_size = window.inner_size().ok()?;
    let current_position = window.outer_position().ok()?;

    let saved_normal_size = previous_state
        .as_ref()
        .filter(|state| state.has_usable_main_size())
        .map(|state| (state.width, state.height));
    let saved_normal_position = previous_state.as_ref().map(|state| {
        if state.maximized {
            (state.prev_x, state.prev_y)
        } else {
            (state.x, state.y)
        }
    });

    let (width, height) = if maximized {
        saved_normal_size.unwrap_or((current_size.width, current_size.height))
    } else {
        (current_size.width, current_size.height)
    };

    if width < DESKTOP_MIN_WINDOW_WIDTH as u32 || height < DESKTOP_MIN_WINDOW_HEIGHT as u32 {
        return None;
    }

    let (x, y) = (current_position.x, current_position.y);
    let (prev_x, prev_y) = if maximized {
        saved_normal_position.unwrap_or((x, y))
    } else {
        (x, y)
    };

    Some(DesktopSavedWindowState {
        width,
        height,
        x,
        y,
        prev_x,
        prev_y,
        maximized,
        visible,
        decorated,
        fullscreen,
    })
}

fn write_desktop_main_window_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: DesktopSavedWindowState,
) -> tauri::Result<()> {
    let state_path = desktop_main_window_state_path(app);
    if let Some(parent) = state_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut states = std::fs::read_to_string(&state_path)
        .ok()
        .and_then(|raw_state| {
            serde_json::from_str::<HashMap<String, serde_json::Value>>(&raw_state).ok()
        })
        .unwrap_or_default();

    states.insert(
        "main".to_string(),
        serde_json::to_value(state).map_err(tauri::Error::Json)?,
    );
    std::fs::write(state_path, serde_json::to_vec_pretty(&states)?)?;

    Ok(())
}

fn desktop_main_window_state_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join(DESKTOP_MAIN_WINDOW_STATE_FILENAME)
}

fn setup_tray(
    app: &mut tauri::App,
    app_name: &str,
    close_coordinator: DesktopCloseCoordinator,
    promotion_state: DesktopWindowPromotionState,
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
    let hide_overlay_item = MenuItem::with_id(
        app,
        "hide_game_overlay",
        "Hide Game Overlay",
        true,
        None::<&str>,
    )?;
    let refresh_overlay_item = MenuItem::with_id(
        app,
        "refresh_game_overlay",
        "Refresh Game Overlay",
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
            &hide_overlay_item,
            &refresh_overlay_item,
            &mute_item,
            &deafen_item,
            &updates_item,
            &separator,
            &quit_item,
        ],
    )?;

    let promotion_state_for_menu = promotion_state.clone();
    let mut tray_builder = TrayIconBuilder::with_id(DESKTOP_TRAY_ID)
        .tooltip(format!("{app_name} Desktop"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "settings" => dispatch_desktop_command(app, "open-settings", None),
            "diagnostics" => dispatch_desktop_command(app, "open-desktop-diagnostics", None),
            "hide_game_overlay" => {
                let _ = hide_desktop_game_overlay_window(app);
                dispatch_desktop_command_without_focus(app, "hide-game-overlay", None);
            }
            "refresh_game_overlay" => {
                dispatch_desktop_command_without_focus(app, "refresh-game-overlay", None);
            }
            "toggle_mute" => dispatch_desktop_command(app, "toggle-mute", None),
            "toggle_deafen" => dispatch_desktop_command(app, "toggle-deafen", None),
            "quit" => request_app_quit(app, &close_coordinator, &promotion_state_for_menu),
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

fn position_desktop_companion_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    width: f64,
    height: f64,
    bottom_offset: i32,
    anchor: DesktopGameOverlayAnchor,
) {
    let monitor = window
        .cursor_position()
        .ok()
        .and_then(|position| {
            window
                .monitor_from_point(position.x, position.y)
                .ok()
                .flatten()
        })
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let scale = monitor.scale_factor();
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let width_px = (width * scale).round() as i32;
    let height_px = (height * scale).round() as i32;
    let margin_px = (24.0 * scale).round() as i32;
    let bottom_offset_px = ((bottom_offset as f64) * scale).round() as i32;
    let left_x = monitor_position.x + margin_px;
    let right_x = monitor_position.x + monitor_size.width as i32 - width_px - margin_px;
    let top_y = monitor_position.y + margin_px;
    let bottom_y =
        monitor_position.y + monitor_size.height as i32 - height_px - margin_px - bottom_offset_px;
    let (x, y) = match anchor {
        DesktopGameOverlayAnchor::BottomLeft => (left_x, bottom_y),
        DesktopGameOverlayAnchor::BottomRight => (right_x, bottom_y),
        DesktopGameOverlayAnchor::TopLeft => (left_x, top_y),
        DesktopGameOverlayAnchor::TopRight => (right_x, top_y),
    };

    let _ = window.set_position(PhysicalPosition::new(
        x.max(monitor_position.x),
        y.max(monitor_position.y),
    ));
}

#[cfg(windows)]
fn position_windows_game_overlay_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    width: f64,
    height: f64,
    bottom_offset: i32,
    anchor: DesktopGameOverlayAnchor,
) -> Result<(), String> {
    let monitor = windows_foreground_monitor_for_overlay(window)
        .or_else(|| {
            window.cursor_position().ok().and_then(|position| {
                window
                    .monitor_from_point(position.x, position.y)
                    .ok()
                    .flatten()
            })
        })
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Err("Unable to locate a monitor for the desktop game overlay.".into());
    };

    let scale = monitor.scale_factor();
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let width_px = (width * scale).round() as i32;
    let height_px = (height * scale).round() as i32;
    let margin_px = (24.0 * scale).round() as i32;
    let bottom_offset_px = ((bottom_offset as f64) * scale).round() as i32;
    let left_x = monitor_position.x + margin_px;
    let right_x = monitor_position.x + monitor_size.width as i32 - width_px - margin_px;
    let top_y = monitor_position.y + margin_px;
    let bottom_y =
        monitor_position.y + monitor_size.height as i32 - height_px - margin_px - bottom_offset_px;
    let (x, y) = match anchor {
        DesktopGameOverlayAnchor::BottomLeft => (left_x, bottom_y),
        DesktopGameOverlayAnchor::BottomRight => (right_x, bottom_y),
        DesktopGameOverlayAnchor::TopLeft => (left_x, top_y),
        DesktopGameOverlayAnchor::TopRight => (right_x, top_y),
    };
    let hwnd = windows_hwnd_for_overlay(window)?;

    unsafe {
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        if SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x.max(monitor_position.x),
            y.max(monitor_position.y),
            width_px.max(1),
            height_px.max(1),
            SWP_NOACTIVATE
                | SWP_NOOWNERZORDER
                | SWP_NOSENDCHANGING
                | SWP_SHOWWINDOW
                | SWP_FRAMECHANGED,
        ) == 0
        {
            return Err("Unable to position native desktop overlay window.".into());
        }
    }

    Ok(())
}

#[cfg(windows)]
fn windows_foreground_monitor_for_overlay<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Option<tauri::Monitor> {
    let overlay_hwnd = windows_hwnd_for_overlay(window).ok()?;

    unsafe {
        let foreground_hwnd = GetForegroundWindow();
        if foreground_hwnd.is_null() {
            return None;
        }

        let foreground_root = GetAncestor(foreground_hwnd, GA_ROOT);
        if foreground_hwnd == overlay_hwnd || foreground_root == overlay_hwnd {
            return None;
        }

        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(foreground_root, &mut rect) == 0 {
            return None;
        }

        let center_x = rect.left + (rect.right - rect.left) / 2;
        let center_y = rect.top + (rect.bottom - rect.top) / 2;
        window
            .monitor_from_point(center_x as f64, center_y as f64)
            .ok()
            .flatten()
    }
}

fn desktop_game_overlay_size(size: DesktopGameOverlaySize) -> (f64, f64) {
    match size {
        DesktopGameOverlaySize::Compact => (268.0, 312.0),
        DesktopGameOverlaySize::Large => (380.0, 520.0),
        DesktopGameOverlaySize::Normal => (DESKTOP_GAME_OVERLAY_WIDTH, DESKTOP_GAME_OVERLAY_HEIGHT),
    }
}

fn desktop_game_overlay_bottom_offset(anchor: DesktopGameOverlayAnchor) -> i32 {
    match anchor {
        DesktopGameOverlayAnchor::BottomLeft | DesktopGameOverlayAnchor::BottomRight => 132,
        DesktopGameOverlayAnchor::TopLeft | DesktopGameOverlayAnchor::TopRight => 0,
    }
}

#[cfg(windows)]
fn windows_hwnd_for_overlay<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<HWND, String> {
    if window.label() != DESKTOP_GAME_OVERLAY_WINDOW_LABEL {
        return Err(format!(
            "Refusing to apply game overlay native styles to unexpected window '{}'.",
            window.label()
        ));
    }

    window
        .hwnd()
        .map(|hwnd| hwnd.0 as HWND)
        .map_err(|error| format!("Unable to read desktop overlay window handle: {error}"))
}

#[cfg(windows)]
unsafe fn apply_windows_overlay_ex_styles(hwnd: HWND, include_layered: bool) -> bool {
    let mut overlay_styles = (WS_EX_TRANSPARENT | WS_EX_NOACTIVATE) as isize;
    if include_layered {
        overlay_styles |= (WS_EX_LAYERED | WS_EX_TOOLWINDOW) as isize;
    }

    let frame_styles = (WS_BORDER | WS_CAPTION | WS_DLGFRAME | WS_THICKFRAME) as isize;
    let current_frame_style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    SetWindowLongPtrW(hwnd, GWL_STYLE, current_frame_style & !frame_styles);

    let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current_style | overlay_styles);

    let updated_frame_style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    if updated_frame_style & frame_styles != 0 {
        return false;
    }

    let updated_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if updated_style & overlay_styles != overlay_styles {
        return false;
    }

    if include_layered && SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA) == 0 {
        return false;
    }

    true
}

#[cfg(windows)]
unsafe fn apply_windows_game_overlay_dwm_frame_preferences(hwnd: HWND) {
    let border_color = DWMWA_COLOR_NONE;
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_BORDER_COLOR as u32,
        (&border_color as *const u32).cast(),
        std::mem::size_of::<u32>() as u32,
    );

    let corner_preference: i32 = DWMWCP_DONOTROUND;
    let _ = DwmSetWindowAttribute(
        hwnd,
        DWMWA_WINDOW_CORNER_PREFERENCE as u32,
        (&corner_preference as *const i32).cast(),
        std::mem::size_of::<i32>() as u32,
    );
}

#[cfg(windows)]
unsafe extern "system" fn apply_windows_overlay_child_styles(
    child_hwnd: HWND,
    failed: LPARAM,
) -> windows_sys::core::BOOL {
    let failed = failed as *mut bool;
    if !apply_windows_overlay_ex_styles(child_hwnd, false) && !failed.is_null() {
        *failed = true;
    }

    ShowWindow(child_hwnd, SW_SHOWNOACTIVATE);

    1
}

#[cfg(windows)]
fn apply_windows_game_overlay_child_click_through(parent_hwnd: HWND) {
    let mut failed = false;

    unsafe {
        EnumChildWindows(
            parent_hwnd,
            Some(apply_windows_overlay_child_styles),
            (&mut failed as *mut bool) as LPARAM,
        );
    }

    if failed {
        eprintln!(
            "Unable to apply native click-through styles to one or more desktop overlay child windows."
        );
    }
}

#[cfg(windows)]
fn apply_windows_game_overlay_click_through<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let hwnd = windows_hwnd_for_overlay(window)?;

    unsafe {
        if !apply_windows_overlay_ex_styles(hwnd, true) {
            return Err("Unable to apply native desktop overlay click-through styles.".into());
        }
        apply_windows_game_overlay_dwm_frame_preferences(hwnd);
    }

    apply_windows_game_overlay_child_click_through(hwnd);

    unsafe {
        if SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE
                | SWP_NOSIZE
                | SWP_NOACTIVATE
                | SWP_NOOWNERZORDER
                | SWP_NOSENDCHANGING
                | SWP_FRAMECHANGED,
        ) == 0
        {
            return Err("Unable to promote native desktop overlay without activation.".into());
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn apply_windows_game_overlay_click_through<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn show_desktop_game_overlay_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    apply_windows_game_overlay_click_through(window)?;
    let hwnd = windows_hwnd_for_overlay(window)?;

    unsafe {
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        if SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE
                | SWP_NOSIZE
                | SWP_NOACTIVATE
                | SWP_NOOWNERZORDER
                | SWP_NOSENDCHANGING
                | SWP_SHOWWINDOW
                | SWP_FRAMECHANGED,
        ) == 0
        {
            return Err("Unable to show native desktop overlay without activation.".into());
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn show_desktop_game_overlay_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    window
        .show()
        .map_err(|error| format!("Unable to show desktop game overlay window: {error}"))
}

#[cfg(windows)]
fn park_desktop_game_overlay_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let hwnd = windows_hwnd_for_overlay(window)?;

    unsafe {
        ShowWindow(hwnd, SW_HIDE);
        if SetWindowPos(
            hwnd,
            HWND_NOTOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE
                | SWP_NOSIZE
                | SWP_NOACTIVATE
                | SWP_NOOWNERZORDER
                | SWP_NOSENDCHANGING
                | SWP_HIDEWINDOW
                | SWP_FRAMECHANGED,
        ) == 0
        {
            return Err("Unable to hide native desktop overlay window.".into());
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn park_desktop_game_overlay_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    window
        .hide()
        .map_err(|error| format!("Unable to hide desktop game overlay window: {error}"))
}

fn refresh_desktop_companion_surface_window(
    app: &tauri::AppHandle,
    label: &str,
    width: f64,
    height: f64,
    bottom_offset: i32,
    anchor: DesktopGameOverlayAnchor,
    click_through: bool,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(label) else {
        return Ok(());
    };

    let _ = window.set_shadow(false);

    #[cfg(windows)]
    if click_through && label == DESKTOP_GAME_OVERLAY_WINDOW_LABEL {
        if let Err(error) = apply_windows_game_overlay_click_through(&window) {
            eprintln!("Unable to apply desktop game overlay native styles: {error}");
        }
        return position_windows_game_overlay_window(&window, width, height, bottom_offset, anchor);
    }

    let _ = window.set_min_size(Some(LogicalSize::new(width, height)));
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.set_always_on_top(true);

    #[cfg(not(windows))]
    let _ = window.set_visible_on_all_workspaces(true);

    if click_through {
        window
            .set_focusable(false)
            .map_err(|error| format!("Unable to disable desktop overlay focus: {error}"))?;
        window
            .set_ignore_cursor_events(true)
            .map_err(|error| format!("Unable to enable desktop overlay click-through: {error}"))?;
        apply_windows_game_overlay_click_through(&window)?;
    } else {
        let _ = window.set_ignore_cursor_events(false);
        let _ = window.set_focusable(true);
    }
    position_desktop_companion_window(&window, width, height, bottom_offset, anchor);
    Ok(())
}

#[cfg(windows)]
fn desktop_windows_game_overlay_surface_info<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Option<DesktopCompanionSurfaceInfo> {
    let hwnd = windows_hwnd_for_overlay(window).ok()?;
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };

    unsafe {
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return None;
        }

        Some(DesktopCompanionSurfaceInfo {
            exists: true,
            height: Some(rect.bottom.saturating_sub(rect.top).max(0) as u32),
            minimized: IsIconic(hwnd) != 0,
            visible: IsWindowVisible(hwnd) != 0,
            width: Some(rect.right.saturating_sub(rect.left).max(0) as u32),
            x: Some(rect.left),
            y: Some(rect.top),
        })
    }
}

fn desktop_companion_surface_info(
    app: &tauri::AppHandle,
    label: &str,
) -> DesktopCompanionSurfaceInfo {
    let Some(window) = app.get_webview_window(label) else {
        return DesktopCompanionSurfaceInfo {
            exists: false,
            height: None,
            minimized: false,
            visible: false,
            width: None,
            x: None,
            y: None,
        };
    };

    #[cfg(windows)]
    if label == DESKTOP_GAME_OVERLAY_WINDOW_LABEL {
        if let Some(info) = desktop_windows_game_overlay_surface_info(&window) {
            return info;
        }
    }

    let size = window.inner_size().ok();
    let position = window.outer_position().ok();

    DesktopCompanionSurfaceInfo {
        exists: true,
        height: size.as_ref().map(|size| size.height),
        minimized: window.is_minimized().unwrap_or(false),
        visible: window.is_visible().unwrap_or(false),
        width: size.as_ref().map(|size| size.width),
        x: position.as_ref().map(|position| position.x),
        y: position.as_ref().map(|position| position.y),
    }
}

fn desktop_companion_surface_queued_info(
    app: &tauri::AppHandle,
    label: &str,
) -> DesktopCompanionSurfaceInfo {
    DesktopCompanionSurfaceInfo {
        exists: app.get_webview_window(label).is_some(),
        height: None,
        minimized: false,
        visible: false,
        width: None,
        x: None,
        y: None,
    }
}

fn desktop_companion_surfaces_queued_status(
    app: &tauri::AppHandle,
    surface_state: &DesktopCompanionSurfaceState,
) -> DesktopCompanionSurfacesStatus {
    DesktopCompanionSurfacesStatus {
        game_overlay: desktop_companion_surface_queued_info(app, DESKTOP_GAME_OVERLAY_WINDOW_LABEL),
        last_error: surface_state.last_error(),
        voice_mini: desktop_companion_surface_queued_info(app, DESKTOP_VOICE_MINI_WINDOW_LABEL),
    }
}

fn desktop_companion_surfaces_status(
    app: &tauri::AppHandle,
    surface_state: &DesktopCompanionSurfaceState,
) -> DesktopCompanionSurfacesStatus {
    DesktopCompanionSurfacesStatus {
        game_overlay: desktop_companion_surface_info(app, DESKTOP_GAME_OVERLAY_WINDOW_LABEL),
        last_error: surface_state.last_error(),
        voice_mini: desktop_companion_surface_info(app, DESKTOP_VOICE_MINI_WINDOW_LABEL),
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window_to_tray(app: &tauri::AppHandle, promotion_state: &DesktopWindowPromotionState) {
    save_desktop_main_window_state(app, promotion_state);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn hide_desktop_game_overlay_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DESKTOP_GAME_OVERLAY_WINDOW_LABEL) {
        let park_result = park_desktop_game_overlay_window(&window);
        if let Err(error) = park_result {
            eprintln!("Unable to park desktop game overlay before destroy: {error}");
        }

        window
            .close()
            .map_err(|error| format!("Unable to destroy desktop game overlay window: {error}"))?;
    }

    Ok(())
}

fn is_main_window_focused(app: &tauri::AppHandle) -> bool {
    is_main_window_focused_impl(app)
}

#[cfg(windows)]
fn sanitize_desktop_executable_name(value: &str) -> Option<String> {
    let basename = Path::new(value).file_name()?.to_string_lossy();
    if basename.contains('\0') || basename.contains('\r') || basename.contains('\n') {
        return None;
    }

    let normalized = basename.split_whitespace().collect::<Vec<_>>().join(" ");

    if normalized.is_empty()
        || normalized.len() > 128
        || normalized.contains('\\')
        || normalized.contains('/')
    {
        return None;
    }

    Some(normalized)
}

#[cfg(windows)]
fn desktop_foreground_process_name() -> Option<String> {
    unsafe {
        let foreground_hwnd = GetForegroundWindow();
        if foreground_hwnd.is_null() {
            return None;
        }

        let mut process_id = 0;
        GetWindowThreadProcessId(foreground_hwnd, &mut process_id);
        if process_id == 0 {
            return None;
        }

        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if process.is_null() {
            return None;
        }

        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        let succeeded = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length);
        CloseHandle(process);

        if succeeded == 0 || length == 0 {
            return None;
        }

        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        sanitize_desktop_executable_name(&path)
    }
}

#[cfg(not(windows))]
fn desktop_foreground_process_name() -> Option<String> {
    None
}

#[cfg(windows)]
fn is_main_window_focused_impl(app: &tauri::AppHandle) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };

    let Ok(hwnd) = window.hwnd() else {
        return window.is_focused().unwrap_or(false);
    };
    let main_hwnd = hwnd.0 as HWND;

    unsafe {
        let foreground_hwnd = GetForegroundWindow();
        if foreground_hwnd.is_null() {
            return false;
        }

        if foreground_hwnd == main_hwnd {
            return true;
        }

        GetAncestor(foreground_hwnd, GA_ROOT) == main_hwnd
    }
}

#[cfg(not(windows))]
fn is_main_window_focused_impl(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false)
}

fn show_or_create_desktop_game_overlay_window(
    app: &tauri::AppHandle,
    layout: DesktopGameOverlayLayout,
) -> Result<(), String> {
    let (overlay_width, overlay_height) = desktop_game_overlay_size(layout.size());
    let overlay_anchor = layout.anchor();
    let overlay_bottom_offset = desktop_game_overlay_bottom_offset(overlay_anchor);

    if let Some(window) = app.get_webview_window(DESKTOP_GAME_OVERLAY_WINDOW_LABEL) {
        if let Err(error) = refresh_desktop_companion_surface_window(
            app,
            DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
            overlay_width,
            overlay_height,
            overlay_bottom_offset,
            overlay_anchor,
            true,
        ) {
            eprintln!("Unable to refresh desktop game overlay before show: {error}");
        }
        show_desktop_game_overlay_window(&window)?;
        if let Err(error) = refresh_desktop_companion_surface_window(
            app,
            DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
            overlay_width,
            overlay_height,
            overlay_bottom_offset,
            overlay_anchor,
            true,
        ) {
            eprintln!("Unable to refresh desktop game overlay after show: {error}");
        }
        return Ok(());
    }

    let app_url = desktop_app_url_with_path(DESKTOP_GAME_OVERLAY_PATH);
    let allowed_origin = configured_app_origin_url();
    let webview_data_directory = resolve_webview_data_directory_for_handle(app)
        .map_err(|error| format!("Unable to prepare desktop game overlay webview data: {error}"))?;

    let window = WebviewWindowBuilder::new(
        app,
        DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
        WebviewUrl::External(app_url),
    )
    .title("Whispr Game Overlay")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .focusable(false)
    .skip_taskbar(true)
    .resizable(false)
    .inner_size(overlay_width, overlay_height)
    .min_inner_size(overlay_width, overlay_height)
    .data_directory(webview_data_directory)
    .initialization_script(desktop_init_script(false, desktop_release_ring().as_str()))
    .on_navigation(move |url| {
        if is_same_origin(url, &allowed_origin) {
            return true;
        }

        open_external_url(url);
        false
    })
    .on_page_load(move |window, payload| {
        if matches!(payload.event(), PageLoadEvent::Finished) {
            if let Err(error) = refresh_desktop_companion_surface_window(
                window.app_handle(),
                DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
                overlay_width,
                overlay_height,
                overlay_bottom_offset,
                overlay_anchor,
                true,
            ) {
                eprintln!("Unable to refresh desktop game overlay on page load: {error}");
            }
            if let Err(error) = show_desktop_game_overlay_window(&window) {
                eprintln!("Unable to show desktop game overlay on page load: {error}");
            }
            if let Err(error) = refresh_desktop_companion_surface_window(
                window.app_handle(),
                DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
                overlay_width,
                overlay_height,
                overlay_bottom_offset,
                overlay_anchor,
                true,
            ) {
                eprintln!("Unable to refresh desktop game overlay after page load: {error}");
            }
            dispatch_desktop_surface_ready(window.app_handle(), DESKTOP_GAME_OVERLAY_WINDOW_LABEL);
        }
    })
    .on_new_window(|url, _features| {
        open_external_url(&url);
        NewWindowResponse::Deny
    })
    .visible(false)
    .build()
    .map_err(|error| format!("Unable to create desktop game overlay window: {error}"))?;

    #[cfg(windows)]
    {
        if let Err(error) = apply_windows_game_overlay_click_through(&window) {
            eprintln!("Unable to apply desktop game overlay native styles after build: {error}");
        }
        position_windows_game_overlay_window(
            &window,
            overlay_width,
            overlay_height,
            overlay_bottom_offset,
            overlay_anchor,
        )?;
    }

    #[cfg(not(windows))]
    {
        window
            .set_focusable(false)
            .map_err(|error| format!("Unable to disable desktop overlay focus: {error}"))?;
        window
            .set_ignore_cursor_events(true)
            .map_err(|error| format!("Unable to enable desktop overlay click-through: {error}"))?;
        apply_windows_game_overlay_click_through(&window)?;
        position_desktop_companion_window(
            &window,
            overlay_width,
            overlay_height,
            overlay_bottom_offset,
            overlay_anchor,
        );
    }
    show_desktop_game_overlay_window(&window)?;
    Ok(())
}

fn show_or_create_desktop_voice_mini_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DESKTOP_VOICE_MINI_WINDOW_LABEL) {
        refresh_desktop_companion_surface_window(
            app,
            DESKTOP_VOICE_MINI_WINDOW_LABEL,
            DESKTOP_VOICE_MINI_WIDTH,
            DESKTOP_VOICE_MINI_HEIGHT,
            0,
            DesktopGameOverlayAnchor::BottomRight,
            false,
        )?;
        window
            .show()
            .map_err(|error| format!("Unable to show desktop voice mini window: {error}"))?;
        refresh_desktop_companion_surface_window(
            app,
            DESKTOP_VOICE_MINI_WINDOW_LABEL,
            DESKTOP_VOICE_MINI_WIDTH,
            DESKTOP_VOICE_MINI_HEIGHT,
            0,
            DesktopGameOverlayAnchor::BottomRight,
            false,
        )?;
        let _ = window.unminimize();
        return Ok(());
    }

    let app_url = desktop_app_url_with_path(DESKTOP_VOICE_MINI_PATH);
    let allowed_origin = configured_app_origin_url();
    let webview_data_directory = resolve_webview_data_directory_for_handle(app)
        .map_err(|error| format!("Unable to prepare desktop voice mini webview data: {error}"))?;

    WebviewWindowBuilder::new(
        app,
        DESKTOP_VOICE_MINI_WINDOW_LABEL,
        WebviewUrl::External(app_url),
    )
    .title("Whispr Voice")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .resizable(false)
    .inner_size(DESKTOP_VOICE_MINI_WIDTH, DESKTOP_VOICE_MINI_HEIGHT)
    .min_inner_size(DESKTOP_VOICE_MINI_WIDTH, DESKTOP_VOICE_MINI_HEIGHT)
    .data_directory(webview_data_directory)
    .initialization_script(desktop_init_script(false, desktop_release_ring().as_str()))
    .on_navigation(move |url| {
        if is_same_origin(url, &allowed_origin) {
            return true;
        }

        open_external_url(url);
        false
    })
    .on_page_load(|window, payload| {
        if matches!(payload.event(), PageLoadEvent::Finished) {
            if refresh_desktop_companion_surface_window(
                window.app_handle(),
                DESKTOP_VOICE_MINI_WINDOW_LABEL,
                DESKTOP_VOICE_MINI_WIDTH,
                DESKTOP_VOICE_MINI_HEIGHT,
                0,
                DesktopGameOverlayAnchor::BottomRight,
                false,
            )
            .is_err()
            {
                return;
            }
            let _ = window.show();
            let _ = refresh_desktop_companion_surface_window(
                window.app_handle(),
                DESKTOP_VOICE_MINI_WINDOW_LABEL,
                DESKTOP_VOICE_MINI_WIDTH,
                DESKTOP_VOICE_MINI_HEIGHT,
                0,
                DesktopGameOverlayAnchor::BottomRight,
                false,
            );
            dispatch_desktop_surface_ready(window.app_handle(), DESKTOP_VOICE_MINI_WINDOW_LABEL);
        }
    })
    .on_new_window(|url, _features| {
        open_external_url(&url);
        NewWindowResponse::Deny
    })
    .visible(false)
    .build()
    .map(|_| ())
    .map_err(|error| format!("Unable to create desktop voice mini window: {error}"))
}

fn hide_desktop_voice_mini_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DESKTOP_VOICE_MINI_WINDOW_LABEL) {
        window
            .hide()
            .map_err(|error| format!("Unable to hide desktop voice mini window: {error}"))?;
    }

    Ok(())
}

fn request_app_quit(
    app: &tauri::AppHandle,
    close_coordinator: &DesktopCloseCoordinator,
    promotion_state: &DesktopWindowPromotionState,
) {
    let Some(request_id) = begin_desktop_close_request(close_coordinator) else {
        record_desktop_native_log(
            app,
            "warning",
            "close_handshake",
            "Close request ignored because another request is pending.",
        );
        return;
    };

    let Some(window) = app.get_webview_window("main") else {
        record_desktop_native_log(
            app,
            "warning",
            "close_handshake",
            "Main window missing during close; exiting immediately.",
        );
        if complete_desktop_close_request(close_coordinator, request_id) {
            save_desktop_main_window_state(app, promotion_state);
            app.exit(0);
        }
        return;
    };

    let script = format!(
        "window.dispatchEvent(new CustomEvent('whispr:desktop-before-close', {{ detail: {{ requestId: {request_id} }}, cancelable: true }}));"
    );
    record_desktop_native_log(
        app,
        "info",
        "close_handshake",
        "Close cleanup request dispatched to web runtime.",
    );
    if window.eval(&script).is_err() {
        record_desktop_native_log(
            app,
            "error",
            "close_handshake",
            "Unable to dispatch close cleanup request; exiting immediately.",
        );
        if complete_desktop_close_request(close_coordinator, request_id) {
            save_desktop_main_window_state(app, promotion_state);
            app.exit(0);
        }
        return;
    }

    let app_handle = app.clone();
    let timeout_coordinator = close_coordinator.clone();
    let timeout_promotion_state = promotion_state.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(DESKTOP_BEFORE_CLOSE_TIMEOUT_MS));
        if complete_desktop_close_request(&timeout_coordinator, request_id) {
            record_desktop_native_log(
                &app_handle,
                "warning",
                "close_handshake",
                "Close cleanup timed out; using fallback exit.",
            );
            save_desktop_main_window_state(&app_handle, &timeout_promotion_state);
            app_handle.exit(0);
        }
    });
}

fn request_main_window_close(
    app: &tauri::AppHandle,
    close_behavior: &DesktopCloseBehaviorState,
    close_coordinator: &DesktopCloseCoordinator,
    promotion_state: &DesktopWindowPromotionState,
) {
    if is_desktop_quit_on_close_enabled(close_behavior) {
        request_app_quit(app, close_coordinator, promotion_state);
        return;
    }

    hide_main_window_to_tray(app, promotion_state);
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
    dispatch_desktop_command_with_focus(app, command, path, true);
}

fn dispatch_desktop_command_without_focus(app: &AppHandle, command: &str, path: Option<&str>) {
    dispatch_desktop_command_with_focus(app, command, path, false);
}

fn dispatch_desktop_surface_ready(app: &AppHandle, surface: &str) {
    if surface != DESKTOP_GAME_OVERLAY_WINDOW_LABEL && surface != DESKTOP_VOICE_MINI_WINDOW_LABEL {
        return;
    }

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let Ok(surface_json) = serde_json::to_string(surface) else {
        return;
    };
    let issued_at_ms = current_unix_ms();
    let script = format!(
        "window.dispatchEvent(new CustomEvent('whispr:desktop-command', {{ detail: {{ command: 'desktop-surface-ready', surface: {surface_json}, issuedAtMs: {issued_at_ms} }} }}));"
    );

    let _ = window.eval(&script);
}

fn dispatch_desktop_command_with_focus(
    app: &AppHandle,
    command: &str,
    path: Option<&str>,
    focus_window: bool,
) {
    if focus_window {
        show_main_window(app);
    }

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
    let issued_at_ms = current_unix_ms();
    let script = format!(
        "window.dispatchEvent(new CustomEvent('whispr:desktop-command', {{ detail: {{ command: {command_json}, path: {path_json}, issuedAtMs: {issued_at_ms} }} }}));"
    );

    let _ = window.eval(&script);
}

fn configured_app_url() -> Url {
    let raw_url = desktop_config_value(
        "WHISPR_DESKTOP_WEB_URL",
        if cfg!(debug_assertions) {
            "http://localhost:3000"
        } else {
            ""
        },
    );

    if raw_url.trim().is_empty() {
        panic!(
            "WHISPR_DESKTOP_WEB_URL is required for production desktop builds. \
             Use apps/desktop/scripts/run-tauri.mjs build with TAURI_WEB_URL set."
        );
    }

    let mut url = Url::parse(&raw_url).expect("WHISPR_DESKTOP_WEB_URL must be a valid URL");

    if !cfg!(debug_assertions) && url.scheme() != "https" {
        panic!("WHISPR_DESKTOP_WEB_URL must use HTTPS in production desktop builds");
    }

    if url.path() == "/" {
        url.set_path(DESKTOP_START_PATH);
    }

    url
}

fn configured_app_origin_url() -> Url {
    let mut url = configured_app_url();
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);
    url
}

fn desktop_app_url_with_path(path: &str) -> Url {
    let mut url = configured_app_origin_url();
    url.set_path(path);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_custom_commands_are_main_window_only() {
        assert!(is_authorized_desktop_command_window_label("main"));
        assert!(!is_authorized_desktop_command_window_label("voice-mini"));
        assert!(!is_authorized_desktop_command_window_label("game-overlay"));
        assert!(!is_authorized_desktop_command_window_label("settings"));
        assert!(!is_authorized_desktop_command_window_label(""));
    }

    #[test]
    fn desktop_diagnostic_text_is_redacted_and_bounded() {
        assert_eq!(
            sanitize_diagnostic_text("authorization bearer abc"),
            "[redacted-sensitive-diagnostic]"
        );
        assert_eq!(
            sanitize_diagnostic_text("user@example.com connected"),
            "[redacted-email] connected"
        );
        assert!(
            sanitize_diagnostic_text(&"a".repeat(DESKTOP_DIAGNOSTIC_TEXT_MAX_CHARS + 20)).len()
                <= DESKTOP_DIAGNOSTIC_TEXT_MAX_CHARS
        );
    }

    #[test]
    fn desktop_native_media_capabilities_stay_research_gated() {
        let capabilities = desktop_platform_capabilities();

        assert_eq!(capabilities.native_screen_capture.status, "research_gated");
        assert_eq!(capabilities.native_screen_capture.fallback, "browser_get_display_media");
        assert_eq!(capabilities.system_audio_capture.status, "research_gated");
        assert_eq!(capabilities.system_audio_capture.fallback, "no_system_audio_capture");
        assert_eq!(capabilities.livekit_custom_track.status, "research_gated");
        assert_eq!(
            capabilities.livekit_custom_track.fallback,
            "standard_livekit_get_display_media"
        );
        assert_eq!(capabilities.hardware_encode.status, "research_gated");
        assert_eq!(
            capabilities.hardware_encode.strategy,
            "webrtc_codec_hint_telemetry_only"
        );
        assert_eq!(
            capabilities.hardware_encode.fallback,
            "os_webview_encoder_selection"
        );
    }

    #[cfg(windows)]
    #[test]
    fn desktop_foreground_process_name_is_pathless() {
        assert_eq!(
            sanitize_desktop_executable_name(r"C:\Games\osu!\osu!.exe"),
            Some("osu!.exe".to_string())
        );
        assert_eq!(sanitize_desktop_executable_name(""), None);
        assert_eq!(sanitize_desktop_executable_name("bad\nname.exe"), None);
    }

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    #[test]
    fn desktop_voice_shortcuts_reject_reserved_combinations() {
        assert!(is_reserved_desktop_voice_shortcut("Alt+Space"));
        assert!(is_reserved_desktop_voice_shortcut("Ctrl+Space"));
        assert!(is_reserved_desktop_voice_shortcut("CmdOrCtrl+Shift+Space"));
        assert!(is_reserved_desktop_voice_shortcut("Alt+Tab"));
        assert!(is_reserved_desktop_voice_shortcut("Alt+F4"));
        assert!(!is_reserved_desktop_voice_shortcut("Alt+V"));
        assert!(parse_desktop_voice_shortcut("Alt+V").is_ok());
        assert!(parse_desktop_voice_shortcut("Alt+Space").is_err());
    }
}
