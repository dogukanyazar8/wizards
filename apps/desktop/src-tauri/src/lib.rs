use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::Write,
    panic,
    path::{Path, PathBuf},
    str::FromStr,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::ipc::{DesktopCompanionSnapshotPublishResultV1, DesktopCompanionSnapshotV1};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{NewWindowResponse, PageLoadEvent, WebviewWindow},
    AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};
use url::Url;

use media_permissions::{
    DesktopMediaPermissionBroker, DesktopMediaPermissionKind, DesktopMediaPermissionPrompt,
};

mod game_activity;
mod game_overlay_lifecycle;
use game_overlay_lifecycle::GameOverlayLifecycle;
mod ipc;
mod media_permissions;
mod notifications;
mod tray_menu;
mod window_tasks;
use window_tasks::DesktopWindowTasks;
#[cfg(windows)]
mod clipboard;
#[cfg(windows)]
mod screen_capture_picker;
#[cfg(windows)]
mod windows_media_permissions;

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HWND, LPARAM, RECT},
    Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
    },
    Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH},
    System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    },
    UI::WindowsAndMessaging::{
        EnumChildWindows, GetAncestor, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetLayeredWindowAttributes,
        SetWindowLongPtrW, SetWindowPos, ShowWindow, GA_ROOT, GWL_EXSTYLE, GWL_STYLE,
        HWND_NOTOPMOST, HWND_TOPMOST, LWA_ALPHA, SWP_FRAMECHANGED, SWP_HIDEWINDOW, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSENDCHANGING, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE,
        SW_SHOWNOACTIVATE, WS_BORDER, WS_CAPTION, WS_DLGFRAME, WS_EX_LAYERED, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT, WS_THICKFRAME,
    },
};

const DESKTOP_INIT_SCRIPT_TEMPLATE: &str = r#"
Object.defineProperty(window, "__WHISPR_DESKTOP__", {
  value: Object.freeze({
    platform: "tauri",
    os: __WHISPR_DESKTOP_OS__,
    launchMode: __WHISPR_DESKTOP_LAUNCH_MODE__,
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
const DESKTOP_CONTROL_WINDOW_LABEL: &str = "desktop-control";
const DESKTOP_CONTROL_SCHEME: &str = "desktop-control";
const DESKTOP_CONTROL_CSP: &str = "default-src 'none'; base-uri 'none'; connect-src ipc: http://ipc.localhost https://ipc.localhost; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'";
const DESKTOP_CONTROL_INDEX: &[u8] = include_bytes!("../assets/desktop-control/index.html");
const DESKTOP_CONTROL_FONT: &[u8] = include_bytes!("../../../web/src/app/fonts/outfit-latin.woff2");
const DESKTOP_CONTROL_CSS: &[u8] = include_bytes!("../assets/desktop-control/app.css");
const DESKTOP_CONTROL_SCRIPT: &[u8] = include_bytes!("../assets/desktop-control/app.js");
const DESKTOP_CONTROL_SHORTCUT_EDITOR_SCRIPT: &[u8] =
    include_bytes!("../assets/desktop-control/shortcut-editor.mjs");
const DESKTOP_CONTROL_PLATFORM_KEYBOARD_SCRIPT: &[u8] =
    include_bytes!("../../../../packages/ui/src/platform-keyboard.mjs");
const DESKTOP_MEDIA_PERMISSION_BRIDGE_SCRIPT: &str =
    include_str!("../assets/desktop-media-permission-bridge.js");
const DESKTOP_START_PATH: &str = "/desktop/start";
const DESKTOP_GAME_OVERLAY_PATH: &str = "/desktop/game-overlay";
const DESKTOP_GAME_OVERLAY_WINDOW_LABEL: &str = "game-overlay";
const DESKTOP_GAME_OVERLAY_WIDTH: f64 = 320.0;
const DESKTOP_GAME_OVERLAY_HEIGHT: f64 = 420.0;
const DESKTOP_VOICE_MINI_PATH: &str = "/desktop/voice-mini";
const DESKTOP_VOICE_MINI_WINDOW_LABEL: &str = "voice-mini";
const DESKTOP_VOICE_MINI_WIDTH: f64 = 344.0;
const DESKTOP_VOICE_MINI_HEIGHT: f64 = 112.0;
/// F8 detached moderation console. There is no desktop frontend for it: the
/// window loads the same admin route the browser does and asks it for the dense
/// `?surface=console` presentation.
const DESKTOP_ADMIN_CONSOLE_PATH: &str = "/admin/moderation?surface=console";
const DESKTOP_ADMIN_CONSOLE_WINDOW_LABEL: &str = "admin-console";
const DESKTOP_ADMIN_CONSOLE_WIDTH: f64 = 1_040.0;
const DESKTOP_ADMIN_CONSOLE_HEIGHT: f64 = 760.0;
const DESKTOP_ADMIN_CONSOLE_MIN_WIDTH: f64 = 720.0;
const DESKTOP_ADMIN_CONSOLE_MIN_HEIGHT: f64 = 520.0;
const DESKTOP_MAIN_WINDOW_WIDTH: f64 = 1920.0;
const DESKTOP_MAIN_WINDOW_HEIGHT: f64 = 1080.0;
const DESKTOP_MIN_WINDOW_WIDTH: f64 = 960.0;
const DESKTOP_MIN_WINDOW_HEIGHT: f64 = 640.0;
/// Açılış penceresi — SPEC-SPLASH §4 tasarımı 420 × 280 yazar ve inceleme ölçeği
/// 1,5×'tir. Üretim ölçeği olarak 1,5× seçildi (K3): kabuk 630 × 420, web tarafı
/// kökte `zoom: 1.5` uygular ve düzen yine 420 × 280 CSS px olarak çizilir.
///
/// Pencere kabuktan **büyüktür**: `0 26px 58px -26px` gölgesi kabuğun dışına taşar ve
/// pencere kutusuyla tam örtüşen bir kabukta kırpılırdı. Saydam kenar payı CSS px
/// cinsinden 6 yan / 4 üst / 32 alt; 1,5× ile 9 / 6 / 48 cihaz px eder.
/// Görünen kabuk yine tam 630 × 420'dir, payın içi saydamdır.
const DESKTOP_SPLASH_WINDOW_WIDTH: f64 = 648.0;
const DESKTOP_SPLASH_WINDOW_HEIGHT: f64 = 474.0;
const DESKTOP_BEFORE_CLOSE_TIMEOUT_MS: u64 = 3_000;
const DESKTOP_AUTOSTART_ARG: &str = "--autostart";
const DESKTOP_MAIN_WINDOW_STATE_FILENAME: &str = ".window-state.json";
const DESKTOP_DEVICE_SETTINGS_FILENAME: &str = "device-settings.json";
const DESKTOP_LEGACY_NATIVE_SETTINGS_FILENAME: &str = ".native-settings.json";
const DESKTOP_DEVICE_SETTINGS_SCHEMA_VERSION: u8 = 1;
const DESKTOP_DEVICE_SETTINGS_MAX_BYTES: u64 = 64 * 1024;
const DESKTOP_PLUGIN_WINDOW_STATE_FILENAME: &str = ".tauri-window-state.json";
const DESKTOP_TRAY_ID: &str = "whispr-main";
const MAX_DESKTOP_SHORTCUTS: usize = 5;
const MAX_DESKTOP_SHORTCUT_LENGTH: usize = 64;
const MAX_DESKTOP_INTERNAL_PATH_LENGTH: usize = 768;
const MAX_DESKTOP_GAME_OVERLAY_SNAPSHOT_BYTES: usize = 16_384;
const MAX_DESKTOP_VOICE_MINI_SNAPSHOT_BYTES: usize = 16_384;
const DESKTOP_NATIVE_LOG_FILENAME: &str = "desktop-diagnostics.log";
const DESKTOP_NATIVE_LOG_MAX_BYTES: u64 = 256 * 1024;
const DESKTOP_NATIVE_LOG_MAX_LINES: usize = 200;
const DESKTOP_DIAGNOSTIC_TEXT_MAX_CHARS: usize = 512;
const DESKTOP_SUPPORT_BUNDLE_VERSION: u8 = 2;
const DESKTOP_SUPPORT_BUNDLE_MAX_BYTES: usize = 256 * 1024;
const DESKTOP_CONTROL_WIDTH: f64 = 480.0;
const DESKTOP_CONTROL_HEIGHT: f64 = 520.0;

fn desktop_init_script(
    updater_enabled: bool,
    release_ring: &str,
    launched_from_autostart: bool,
) -> String {
    let release_ring_json =
        serde_json::to_string(release_ring).unwrap_or_else(|_| "\"uat\"".into());

    DESKTOP_INIT_SCRIPT_TEMPLATE
        .replace(
            "__WHISPR_DESKTOP_OS__",
            &format!("\"{}\"", std::env::consts::OS),
        )
        .replace(
            "__WHISPR_DESKTOP_UPDATER_ENABLED__",
            if updater_enabled { "true" } else { "false" },
        )
        .replace(
            "__WHISPR_DESKTOP_RELEASE_RING__",
            release_ring_json.as_str(),
        )
        .replace(
            "__WHISPR_DESKTOP_LAUNCH_MODE__",
            if launched_from_autostart {
                "\"autostart\""
            } else {
                "\"interactive\""
            },
        )
}

fn desktop_launched_from_autostart(args: impl IntoIterator<Item = String>) -> bool {
    args.into_iter()
        .any(|argument| argument == DESKTOP_AUTOSTART_ARG)
}

fn desktop_release_ring() -> String {
    match desktop_config_value("WHISPR_DESKTOP_RELEASE_RING", "uat").as_str() {
        "production" => "stable".into(),
        "dev" => "dev".into(),
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
        "WHISPR_DESKTOP_BUILD_TIME" => option_env!("WHISPR_DESKTOP_BUILD_TIME")
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopTrayContext {
    locale: String,
    voice_active: bool,
    muted: bool,
    deafened: bool,
}

struct DesktopTrayItems {
    items: [MenuItem<tauri::Wry>; 3],
    locale: Mutex<String>,
}

impl DesktopTrayItems {
    fn sync(
        &self,
        context: Option<&DesktopTrayContext>,
        _voice_active: bool,
    ) -> Result<(), String> {
        let locale = {
            let mut locale = self
                .locale
                .lock()
                .map_err(|_| "Desktop tray state is unavailable.")?;
            if let Some(context) = context {
                *locale = context.locale.clone();
            }
            locale.clone()
        };
        let labels = tray_menu::labels(
            &locale,
            context.is_some_and(|value| value.muted),
            context.is_some_and(|value| value.deafened),
        );
        for (item, label) in self.items.iter().zip(labels) {
            item.set_text(label)
                .map_err(|error| format!("Unable to update tray label: {error}"))?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopWindowCloseAction {
    #[default]
    Tray,
    Quit,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct DesktopWindowSettings {
    close_action: DesktopWindowCloseAction,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct DesktopDeviceSettings {
    registered_games: Vec<game_activity::RegisteredGame>,
    schema_version: u8,
    game_detection_enabled: bool,
    window: DesktopWindowSettings,
    voice_shortcuts: DesktopShortcutConfig,
}

impl Default for DesktopDeviceSettings {
    fn default() -> Self {
        Self {
            schema_version: DESKTOP_DEVICE_SETTINGS_SCHEMA_VERSION,
            game_detection_enabled: false,
            registered_games: Vec::new(),
            window: DesktopWindowSettings::default(),
            voice_shortcuts: DesktopShortcutConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
struct LegacyDesktopNativeSettings {
    quit_on_close: bool,
    voice_shortcuts: DesktopShortcutConfig,
}

impl From<LegacyDesktopNativeSettings> for DesktopDeviceSettings {
    fn from(legacy: LegacyDesktopNativeSettings) -> Self {
        Self {
            window: DesktopWindowSettings {
                close_action: if legacy.quit_on_close {
                    DesktopWindowCloseAction::Quit
                } else {
                    DesktopWindowCloseAction::Tray
                },
            },
            voice_shortcuts: legacy.voice_shortcuts,
            ..Self::default()
        }
    }
}

/// F9 tray badge. Both halves of the tooltip live here so the activity status
/// and the moderation count can each change without erasing the other.
///
/// The count itself is never computed on this side: the web app receives
/// `admin:open-case-count` over its socket and publishes the number it was
/// given. A desktop build that counted for itself would eventually disagree
/// with the server about what "open" means and put a wrong badge on the tray.
#[derive(Clone, Default)]
struct DesktopTrayBadgeState {
    activity: Arc<Mutex<DesktopActivityStatus>>,
    open_case_count: Arc<Mutex<u32>>,
}

impl DesktopTrayBadgeState {
    fn activity(&self) -> DesktopActivityStatus {
        self.activity
            .lock()
            .map(|activity| *activity)
            .unwrap_or_default()
    }

    fn set_activity(&self, status: DesktopActivityStatus) {
        if let Ok(mut activity) = self.activity.lock() {
            *activity = status;
        }
    }

    fn open_case_count(&self) -> u32 {
        self.open_case_count.lock().map(|count| *count).unwrap_or(0)
    }

    fn set_open_case_count(&self, next: u32) {
        if let Ok(mut count) = self.open_case_count.lock() {
            *count = next;
        }
    }
}

#[derive(Clone, Default)]
struct DesktopCompanionSurfaceState {
    last_error: Arc<Mutex<Option<String>>>,
    game_overlay: Arc<Mutex<GameOverlayLifecycle>>,
}

impl DesktopCompanionSurfaceState {
    fn update_game_overlay<T>(
        &self,
        update: impl FnOnce(&mut GameOverlayLifecycle) -> T,
    ) -> Result<T, String> {
        let mut lifecycle = self
            .game_overlay
            .lock()
            .map_err(|_| "Desktop overlay lifecycle is unavailable.".to_string())?;
        Ok(update(&mut lifecycle))
    }

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSupportAppInfo {
    app_version: &'static str,
    build_time: String,
    release_ring: String,
    tauri_version: &'static str,
    updater_enabled: bool,
    webview_version: String,
}

fn desktop_support_app_info() -> DesktopSupportAppInfo {
    DesktopSupportAppInfo {
        app_version: env!("CARGO_PKG_VERSION"),
        build_time: desktop_config_value("WHISPR_DESKTOP_BUILD_TIME", ""),
        release_ring: desktop_release_ring(),
        tauri_version: tauri::VERSION,
        updater_enabled: desktop_updater_enabled(),
        webview_version: tauri::webview_version().unwrap_or_else(|_| "unknown".into()),
    }
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
    companion_surfaces: DesktopCompanionSurfacesStatus,
    generated_at_ms: u64,
    native_logs: Vec<DesktopNativeLogRecord>,
    platform: DesktopSupportPlatformInfo,
    shortcuts: DesktopShortcutStatus,
    updater: DesktopControlUpdaterState,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSupportBundleFileResult {
    generated_at_ms: u64,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopControlPermissionInfo {
    can_request: bool,
    id: &'static str,
    instructions: &'static str,
    label: &'static str,
    status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopControlUpdaterState {
    available: bool,
    current_version: String,
    enabled: bool,
    latest_version: Option<String>,
    message: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct DesktopControlAppSettings {
    #[serde(default)]
    registered_games: Option<Vec<game_activity::RegisteredGame>>,
    close_action: DesktopWindowCloseAction,
    launch_on_startup: bool,
    #[serde(default)]
    game_detection_enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopControlState {
    app: DesktopSupportAppInfo,
    application: DesktopControlAppSettings,
    companion_surfaces: DesktopCompanionSurfacesStatus,
    media_permission_prompt: Option<DesktopMediaPermissionPromptPayload>,
    permissions: Vec<DesktopControlPermissionInfo>,
    platform: DesktopSupportPlatformInfo,
    shortcuts: DesktopShortcutStatus,
    updater: DesktopControlUpdaterState,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopMediaPermissionPromptPayload {
    kind: &'static str,
    request_id: String,
}

impl From<DesktopMediaPermissionPrompt> for DesktopMediaPermissionPromptPayload {
    fn from(prompt: DesktopMediaPermissionPrompt) -> Self {
        Self {
            kind: prompt.kind.as_str(),
            request_id: prompt.request_id,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopControlOperationResult {
    message: String,
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

#[derive(Debug, Clone, Copy, Default)]
enum DesktopActivityStatus {
    #[default]
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

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopGameOverlayAnchor {
    BottomLeft,
    BottomRight,
    #[default]
    TopLeft,
    TopRight,
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopGameOverlaySize {
    Compact,
    Large,
    #[default]
    Normal,
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
enum DesktopShortcutAction {
    HideGameOverlay,
    PushToTalk,
    ToggleAdminConsole,
    ToggleDeafen,
    ToggleMute,
}

impl DesktopShortcutAction {
    fn command(self, is_pressed: bool) -> Option<&'static str> {
        match (self, is_pressed) {
            (Self::HideGameOverlay, true) => Some("hide-game-overlay"),
            (Self::ToggleAdminConsole, true) => Some("toggle-admin-console"),
            (Self::ToggleMute, true) => Some("toggle-mute"),
            (Self::ToggleDeafen, true) => Some("toggle-deafen"),
            (Self::PushToTalk, true) => Some("voice-shortcut-push-to-talk-start"),
            (Self::PushToTalk, false) => Some("voice-shortcut-push-to-talk-stop"),
            (
                Self::HideGameOverlay
                | Self::ToggleAdminConsole
                | Self::ToggleMute
                | Self::ToggleDeafen,
                false,
            ) => None,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::HideGameOverlay => "hideGameOverlay",
            Self::ToggleAdminConsole => "toggleAdminConsole",
            Self::PushToTalk => "pushToTalk",
            Self::ToggleDeafen => "toggleDeafen",
            Self::ToggleMute => "toggleMute",
        }
    }
}

/// K7 — one requested assignment plus the **result** of asking the OS for it.
///
/// `shortcut` is `None` when the combination could not be parsed or is reserved, and
/// `registered` is false when the OS refused it. Both cases are reported to the screen as a
/// conflict; neither aborts the batch, so a single taken combination can no longer cost the
/// user their four working shortcuts.
///
/// Nothing here is written to disk: `DesktopDeviceSettings` keeps the requested combinations
/// and this outcome is recomputed from a real registration attempt on every launch.
#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
#[derive(Debug, Clone)]
struct DesktopShortcutEntry {
    action: DesktopShortcutAction,
    accelerator: String,
    reason: Option<DesktopShortcutFailureReason>,
    registered: bool,
    shortcut: Option<tauri_plugin_global_shortcut::Shortcut>,
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
impl DesktopShortcutEntry {
    fn conflict(&self) -> bool {
        self.reason.is_some()
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum DesktopShortcutFailureReason {
    Duplicate,
    Invalid,
    OsRefused,
    Reserved,
}

impl DesktopShortcutFailureReason {
    fn label(self) -> &'static str {
        match self {
            Self::Duplicate => "duplicate",
            Self::Invalid => "invalid",
            Self::OsRefused => "refused by the operating system",
            Self::Reserved => "reserved by the operating system",
        }
    }
}

#[derive(Clone, Default)]
struct DesktopShortcutRegistry {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    entries: Arc<Mutex<Vec<DesktopShortcutEntry>>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct DesktopShortcutConfig {
    hide_game_overlay: Option<String>,
    shortcuts_enabled: bool,
    push_to_talk: Option<String>,
    /// F9: detaching the moderation console rides the same registry the voice
    /// shortcuts use, so one screen configures every global key.
    toggle_admin_console: Option<String>,
    toggle_deafen: Option<String>,
    toggle_mute: Option<String>,
}

impl Default for DesktopShortcutConfig {
    fn default() -> Self {
        Self {
            hide_game_overlay: Some("Alt+H".to_string()),
            push_to_talk: Some("Alt+V".to_string()),
            shortcuts_enabled: false,
            toggle_admin_console: Some("Alt+Shift+K".to_string()),
            toggle_deafen: Some("Alt+D".to_string()),
            toggle_mute: Some("Alt+M".to_string()),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopShortcutRegistration {
    action: &'static str,
    shortcut: String,
}

/// The old command's compatibility fields remain stable: older bundles read only `enabled` and
/// `registered`. `entries` is additive and gives the bundled Desktop Control one row per action.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopShortcutStatus {
    enabled: bool,
    entries: Vec<DesktopShortcutStatusEntry>,
    registered: Vec<DesktopShortcutRegistration>,
}

/// K7 — the new command's answer, one row per requested assignment.
///
/// `keys` is the accelerator split on `+` (`Alt+Shift+K` → `["Alt", "Shift", "K"]`). The
/// screen turns those into `⌥⇧K` capsules; the shell has no business knowing which glyph a
/// platform draws for a modifier.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopShortcutStatusEntry {
    action: &'static str,
    conflict: bool,
    keys: Vec<String>,
    reason: Option<DesktopShortcutFailureReason>,
    registered: bool,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum DesktopControlRecoveryAction {
    HideOverlay,
    RefreshOverlay,
    ReopenVoiceMini,
    ResetMainWindow,
}

fn desktop_sentry_options(environment: String) -> sentry::ClientOptions {
    sentry::ClientOptions::new()
        .environment(environment)
        .maybe_release(sentry::release_name!())
        .send_default_pii(false)
}

pub fn run() {
    let desktop_app_name =
        std::env::var("WHISPR_DESKTOP_APP_NAME").unwrap_or_else(|_| "Whispr".into());
    let desktop_release_ring = desktop_release_ring();
    let launched_from_autostart = desktop_launched_from_autostart(std::env::args());

    // Sentry: derleme zamanında gömülen DSN yoksa tamamen kapalı (no-op).
    // Guard, run() bloğu boyunca (uygulama ömrü) canlı tutulur; panic
    // integration'ı sentry::init içinde varsayılan olarak kurulur.
    let _sentry_guard = option_env!("WHISPR_DESKTOP_SENTRY_DSN")
        .filter(|dsn| !dsn.trim().is_empty())
        .map(|dsn| sentry::init((dsn, desktop_sentry_options(desktop_release_ring.clone()))));

    let desktop_updater_enabled = desktop_updater_enabled();
    let desktop_media_permission_broker = DesktopMediaPermissionBroker::default();
    let desktop_shortcut_registry = DesktopShortcutRegistry::default();
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        let shortcut_events = desktop_shortcut_registry.clone();
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if !desktop_launched_from_autostart(argv.iter().cloned()) {
                show_main_window(app);
            }
            handle_desktop_deep_links(app, argv.iter().map(String::as_str));
        }));
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    dispatch_desktop_shortcut_event(app, &shortcut_events, event);
                })
                .build(),
        );
        builder = builder.plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name(desktop_app_name.clone())
                .arg(DESKTOP_AUTOSTART_ARG)
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
            builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
        }
    }

    builder = builder.register_uri_scheme_protocol(DESKTOP_CONTROL_SCHEME, |_context, request| {
        desktop_control_protocol_response(request.uri().path())
    });

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .manage(DesktopCloseCoordinator::default())
        .manage(DesktopCloseBehaviorState::default())
        .manage(DesktopCompanionSurfaceState::default())
        .manage(DesktopWindowTasks::default())
        .manage(DesktopNativeLogState::default())
        .manage(desktop_media_permission_broker.clone())
        .manage(DesktopTrayBadgeState::default())
        .manage(DesktopWindowPromotionState::default())
        .manage(desktop_shortcut_registry)
        .invoke_handler(tauri::generate_handler![
            complete_desktop_before_close,
            configure_desktop_shortcuts,
            configure_desktop_voice_shortcuts,
            desktop_control_check_for_updates,
            desktop_control_install_update,
            desktop_control_recover,
            desktop_control_request_notification_permission,
            get_desktop_notification_permission,
            test_desktop_screen_capture,
            read_desktop_clipboard_text,
            send_desktop_notification,
            resolve_desktop_media_permission,
            desktop_control_set_app_settings,
            export_desktop_diagnostics_bundle,
            get_desktop_app_info,
            get_desktop_control_state,
            get_desktop_foreground_process_name,
            get_desktop_detected_game,
            get_desktop_go_live_candidate,
            list_desktop_running_applications,
            get_desktop_main_window_focused,
            get_desktop_admin_console_open,
            get_desktop_companion_surfaces_status,
            get_desktop_platform_capabilities,
            get_desktop_shortcut_status,
            get_desktop_voice_shortcut_status,
            open_desktop_permission_settings,
            publish_desktop_game_overlay_snapshot,
            publish_desktop_voice_mini_snapshot,
            request_desktop_media_permission,
            refresh_desktop_companion_surfaces,
            set_desktop_activity_status,
            set_desktop_admin_console_visible,
            set_desktop_game_overlay_visible,
            set_desktop_voice_mini_visible,
            show_desktop_control,
            promote_desktop_main_window,
            publish_desktop_admin_case_count
        ])
        .setup(move |app| {
            let app_url = configured_app_url();
            let app_name = desktop_app_name.clone();
            let init_script = format!(
                "{}\n{}",
                desktop_init_script(
                    desktop_updater_enabled,
                    desktop_release_ring.as_str(),
                    launched_from_autostart,
                ),
                DESKTOP_MEDIA_PERMISSION_BRIDGE_SCRIPT,
            );
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
            let device_settings = match load_desktop_device_settings(app.handle()) {
                Ok(settings) => settings,
                Err(error) => {
                    record_desktop_native_log(
                        app.handle(),
                        "error",
                        "device_settings",
                        format!("Desktop device settings could not be loaded: {error}").as_str(),
                    );
                    DesktopDeviceSettings::default()
                }
            };
            set_desktop_window_promoted(&promotion_state, app_url.path() != DESKTOP_START_PATH);
            set_desktop_quit_on_close(
                &close_behavior_state,
                device_settings.window.close_action == DesktopWindowCloseAction::Quit,
            );

            setup_tray(
                app,
                &app_name,
                close_coordinator.clone(),
                promotion_state.clone(),
            )?;

            if device_settings.voice_shortcuts.shortcuts_enabled {
                let registry = app.state::<DesktopShortcutRegistry>();
                if configure_desktop_shortcuts_impl(
                    app.handle(),
                    registry.inner(),
                    device_settings.voice_shortcuts.clone(),
                )
                .is_err()
                {
                    record_desktop_native_log(
                        app.handle(),
                        "error",
                        "desktop_shortcuts",
                        "Saved desktop shortcuts could not be restored.",
                    );
                }
            }

            // Configure Windows identity and permission handlers before the first remote request.
            #[cfg(windows)]
            let initial_main_url = Url::parse("about:blank")?;
            #[cfg(not(windows))]
            let initial_main_url = app_url.clone();
            let mut main_window_builder =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(initial_main_url))
                    .title(app_name)
                    .decorations(false)
                    .transparent(true)
                    .center()
                    .data_directory(webview_data_directory)
                    .initialization_script(init_script)
                    .on_navigation({
                        let allowed_origin = app_url.clone();
                        let oauth_navigation_active = Arc::clone(&oauth_navigation_active);

                        move |url| {
                            if url.as_str() == "about:blank" {
                                return true;
                            }
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

                        move |window, payload| {
                            let url = payload.url();
                            if !is_same_origin(url, &allowed_origin) {
                                return;
                            }

                            match payload.event() {
                                // Terfi burada **yapılmaz**. Açılış ekranı bitene kadar
                                // pencere açılış ölçüsünde kalmalı; büyütme kararını
                                // kabuk verir (`promote_desktop_main_window` komutu).
                                // Eskiden buradaki erken terfi, kullanıcıya önce boş bir
                                // dev çerçeve, sonra baştan başlayan ikinci bir açılış
                                // ekranı gösteriyordu.
                                PageLoadEvent::Finished if url.path() == DESKTOP_START_PATH => {
                                    prepare_desktop_start_window(&window);
                                    if !launched_from_autostart {
                                        let _ = window.show();
                                    }
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

            if launched_from_autostart {
                main_window_builder = main_window_builder.visible(false);
            }

            let main_window = main_window_builder.build()?;

            install_webview_media_permission_handler(
                &main_window,
                Some(desktop_media_permission_broker.clone()),
                configured_app_origin_url(),
                app_url.clone(),
            )
            .map_err(std::io::Error::other)?;

            if app_url.path() == DESKTOP_START_PATH {
                spawn_desktop_startup_promotion_guard(main_window.clone(), promotion_state.clone());
            }
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

/// K7 — the main window **on the app's own origin**.
///
/// `assert_desktop_main_command_window` checks the label alone, which is enough for the
/// read-only commands it guards. Registering a global hotkey is not read-only, and the main
/// window is deliberately allowed to navigate to Google's and GitHub's sign-in pages during
/// OAuth; that page carries the `main` label too.
fn assert_desktop_main_app_origin_window(window: &WebviewWindow) -> Result<(), String> {
    assert_desktop_main_command_window(window)?;

    let url = window
        .url()
        .map_err(|_| "Desktop command origin could not be verified.".to_string())?;

    if is_same_origin(&url, &configured_app_url()) {
        return Ok(());
    }

    Err("Desktop command is only available to the Whispr application origin.".to_string())
}

fn is_authorized_desktop_control_command_window(label: &str, url: &Url) -> bool {
    label == DESKTOP_CONTROL_WINDOW_LABEL && is_desktop_control_url(url)
}

fn is_desktop_control_url(url: &Url) -> bool {
    is_desktop_control_url_for_platform(url, cfg!(windows))
}

fn is_desktop_control_url_for_platform(url: &Url, accept_windows_http_origin: bool) -> bool {
    if url.port().is_some() || !url.username().is_empty() || url.password().is_some() {
        return false;
    }

    match url.scheme() {
        DESKTOP_CONTROL_SCHEME => url.host_str() == Some("localhost"),
        "http" => accept_windows_http_origin && url.host_str() == Some("desktop-control.localhost"),
        _ => false,
    }
}

fn assert_desktop_control_command_window(window: &WebviewWindow) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|_| "Desktop Control command origin could not be verified.".to_string())?;

    if is_authorized_desktop_control_command_window(window.label(), &url) {
        return Ok(());
    }

    Err("Desktop command is only available to trusted local Desktop Control.".to_string())
}

// Only app-specific settings operations use this guard. Media consent resolution stays local.
fn is_authorized_desktop_settings_window(label: &str, url: &Url, app_url: &Url) -> bool {
    is_authorized_desktop_control_command_window(label, url)
        || (label == DESKTOP_MAIN_WINDOW_LABEL
            && url.username().is_empty()
            && url.password().is_none()
            && is_same_origin(url, app_url))
}

fn assert_desktop_settings_command_window(window: &WebviewWindow) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|_| "Desktop settings origin could not be verified.".to_string())?;
    if is_authorized_desktop_settings_window(window.label(), &url, &configured_app_url()) {
        return Ok(());
    }
    Err("Desktop settings require the Whispr application window and origin.".to_string())
}

fn desktop_control_protocol_response(path: &str) -> tauri::http::Response<Vec<u8>> {
    use tauri::http::{header, Response, StatusCode};

    let (status, content_type, body) = match path {
        "/" | "/index.html" => (
            StatusCode::OK,
            "text/html; charset=utf-8",
            DESKTOP_CONTROL_INDEX,
        ),
        "/font.woff2" => (StatusCode::OK, "font/woff2", DESKTOP_CONTROL_FONT),
        "/app.css" => (
            StatusCode::OK,
            "text/css; charset=utf-8",
            DESKTOP_CONTROL_CSS,
        ),
        "/app.js" => (
            StatusCode::OK,
            "text/javascript; charset=utf-8",
            DESKTOP_CONTROL_SCRIPT,
        ),
        "/shortcut-editor.mjs" => (
            StatusCode::OK,
            "text/javascript; charset=utf-8",
            DESKTOP_CONTROL_SHORTCUT_EDITOR_SCRIPT,
        ),
        "/platform-keyboard.mjs" => (
            StatusCode::OK,
            "text/javascript; charset=utf-8",
            DESKTOP_CONTROL_PLATFORM_KEYBOARD_SCRIPT,
        ),
        _ => (
            StatusCode::NOT_FOUND,
            "text/plain; charset=utf-8",
            b"Not found".as_slice(),
        ),
    };

    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_SECURITY_POLICY, DESKTOP_CONTROL_CSP)
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::REFERRER_POLICY, "no-referrer")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .body(body.to_vec())
        .expect("static Desktop Control response headers must be valid")
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

/// The write half, shared by the old Desktop Control command and the new Settings one.
fn apply_desktop_shortcut_config(
    app: &AppHandle,
    registry: &DesktopShortcutRegistry,
    config: DesktopShortcutConfig,
) -> Result<DesktopShortcutStatus, String> {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        let previous_settings = load_desktop_device_settings(app)?;
        let status = configure_desktop_shortcuts_impl(app, registry, config.clone())?;
        let mut next_settings = previous_settings.clone();
        next_settings.voice_shortcuts = config;

        if let Err(error) = save_desktop_device_settings(app, &next_settings) {
            let restore_result =
                configure_desktop_shortcuts_impl(app, registry, previous_settings.voice_shortcuts);
            return if restore_result.is_ok() {
                Err(error)
            } else {
                Err("Desktop shortcuts could not be saved or restored.".to_string())
            };
        }

        Ok(status)
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = (app, registry, config);
        Err("Desktop shortcuts are not supported on this platform.".to_string())
    }
}

/// K7 — kept under its old name and compatible answer fields. A desktop shell can be handed a
/// web bundle older than itself; that bundle calls this command and reads `registered`.
#[tauri::command]
fn configure_desktop_voice_shortcuts(
    window: WebviewWindow,
    app: AppHandle,
    registry: tauri::State<'_, DesktopShortcutRegistry>,
    config: DesktopShortcutConfig,
) -> Result<DesktopShortcutStatus, String> {
    assert_desktop_settings_command_window(&window)?;

    apply_desktop_shortcut_config(&app, registry.inner(), config)
}

/// K7 — the Settings window's write path.
///
/// Guarded harder than `assert_desktop_main_command_window` on purpose: the main window is
/// allowed to navigate to `accounts.google.com` and `github.com` during OAuth, and registering
/// a global hotkey is not something a page on those origins may ask for. Label **and** origin
/// both have to match the configured app URL.
#[tauri::command]
fn configure_desktop_shortcuts(
    window: WebviewWindow,
    app: AppHandle,
    registry: tauri::State<'_, DesktopShortcutRegistry>,
    config: DesktopShortcutConfig,
) -> Result<Vec<DesktopShortcutStatusEntry>, String> {
    assert_desktop_main_app_origin_window(&window)?;

    apply_desktop_shortcut_config(&app, registry.inner(), config)?;

    Ok(desktop_shortcut_registry_entries(registry.inner()))
}

/// K7 — `{ action, keys, registered, conflict }[]`, read from the live registry.
#[tauri::command]
fn get_desktop_shortcut_status(
    window: WebviewWindow,
    registry: tauri::State<'_, DesktopShortcutRegistry>,
) -> Result<Vec<DesktopShortcutStatusEntry>, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(desktop_shortcut_registry_entries(registry.inner()))
}

#[tauri::command]
fn get_desktop_voice_shortcut_status(
    window: WebviewWindow,
    app: AppHandle,
    registry: tauri::State<'_, DesktopShortcutRegistry>,
) -> Result<DesktopShortcutStatus, String> {
    assert_desktop_main_command_window(&window)?;

    desktop_shortcut_status_for_app(&app, registry.inner())
}

#[tauri::command]
fn export_desktop_diagnostics_bundle(
    window: WebviewWindow,
    app: AppHandle,
    surface_state: tauri::State<'_, DesktopCompanionSurfaceState>,
    registry: tauri::State<'_, DesktopShortcutRegistry>,
) -> Result<DesktopSupportBundleFileResult, String> {
    assert_desktop_settings_command_window(&window)?;

    record_desktop_native_log(
        &app,
        "info",
        "diagnostics_export",
        "Desktop diagnostics support bundle exported.",
    );

    let generated_at_ms = current_unix_ms();
    let bundle = DesktopSupportBundle {
        app: desktop_support_app_info(),
        bundle_version: DESKTOP_SUPPORT_BUNDLE_VERSION,
        companion_surfaces: desktop_companion_surfaces_status(&app, surface_state.inner()),
        generated_at_ms,
        native_logs: read_desktop_native_logs(&app),
        platform: DesktopSupportPlatformInfo {
            arch: std::env::consts::ARCH,
            family: std::env::consts::FAMILY,
            os: std::env::consts::OS,
        },
        shortcuts: desktop_shortcut_status_for_app(&app, registry.inner())?,
        updater: desktop_control_updater_state(desktop_updater_enabled(), false, None),
    };
    let serialized = serde_json::to_vec_pretty(&bundle)
        .map_err(|_| "Desktop diagnostics bundle could not be serialized.".to_string())?;
    if serialized.len() > DESKTOP_SUPPORT_BUNDLE_MAX_BYTES {
        return Err("Desktop diagnostics bundle exceeded its size limit.".to_string());
    }

    let directory = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .or_else(|_| app.path().app_log_dir())
        .map_err(|_| "Desktop diagnostics directory is unavailable.".to_string())?;
    let path = write_desktop_support_bundle_atomic(&directory, generated_at_ms, &serialized)?;

    Ok(DesktopSupportBundleFileResult {
        generated_at_ms,
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn get_desktop_control_state(
    window: WebviewWindow,
    app: AppHandle,
    close_behavior: tauri::State<'_, DesktopCloseBehaviorState>,
    media_permissions: tauri::State<'_, DesktopMediaPermissionBroker>,
    surface_state: tauri::State<'_, DesktopCompanionSurfaceState>,
    registry: tauri::State<'_, DesktopShortcutRegistry>,
) -> Result<DesktopControlState, String> {
    assert_desktop_settings_command_window(&window)?;

    Ok(DesktopControlState {
        app: desktop_support_app_info(),
        application: desktop_control_app_settings(&app, close_behavior.inner())?,
        companion_surfaces: desktop_companion_surfaces_status(&app, surface_state.inner()),
        media_permission_prompt: if window.label() == DESKTOP_CONTROL_WINDOW_LABEL {
            media_permissions
                .pending_prompt(current_unix_ms())
                .map(DesktopMediaPermissionPromptPayload::from)
        } else {
            None
        },
        permissions: desktop_control_permission_info(),
        platform: DesktopSupportPlatformInfo {
            arch: std::env::consts::ARCH,
            family: std::env::consts::FAMILY,
            os: std::env::consts::OS,
        },
        shortcuts: desktop_shortcut_status_for_app(&app, registry.inner())?,
        updater: desktop_control_updater_state(desktop_updater_enabled(), false, None),
    })
}

fn desktop_control_app_settings(
    app: &AppHandle,
    close_behavior: &DesktopCloseBehaviorState,
) -> Result<DesktopControlAppSettings, String> {
    Ok(DesktopControlAppSettings {
        close_action: if is_desktop_quit_on_close_enabled(close_behavior) {
            DesktopWindowCloseAction::Quit
        } else {
            DesktopWindowCloseAction::Tray
        },
        launch_on_startup: is_desktop_autostart_enabled(app)?,
        game_detection_enabled: load_desktop_device_settings(app)?.game_detection_enabled,
        registered_games: Some(load_desktop_device_settings(app)?.registered_games),
    })
}

#[tauri::command]
fn desktop_control_set_app_settings(
    window: WebviewWindow,
    app: AppHandle,
    close_behavior: tauri::State<'_, DesktopCloseBehaviorState>,
    settings: DesktopControlAppSettings,
) -> Result<DesktopControlAppSettings, String> {
    assert_desktop_settings_command_window(&window)?;

    let previous_autostart = is_desktop_autostart_enabled(&app)?;
    let registered_games = settings
        .registered_games
        .as_deref()
        .map(game_activity::validate_registered)
        .transpose()?;
    let previous_device_settings = load_desktop_device_settings(&app)?;
    let applied_autostart = if previous_autostart == settings.launch_on_startup {
        previous_autostart
    } else {
        set_desktop_autostart_from_native_menu(&app, settings.launch_on_startup)?
    };
    if applied_autostart != settings.launch_on_startup {
        return Err("Desktop startup setting was not applied by the operating system.".to_string());
    }

    let mut next_device_settings = previous_device_settings;
    next_device_settings.window.close_action = settings.close_action;
    next_device_settings.game_detection_enabled = settings.game_detection_enabled;
    if let Some(games) = registered_games {
        next_device_settings.registered_games = games;
    }
    if let Err(save_error) = save_desktop_device_settings(&app, &next_device_settings) {
        if previous_autostart != applied_autostart
            && set_desktop_autostart_from_native_menu(&app, previous_autostart).is_err()
        {
            return Err(
                "Desktop settings could not be saved and the startup setting could not be restored."
                    .to_string(),
            );
        }
        return Err(save_error);
    }

    let quit_on_close = settings.close_action == DesktopWindowCloseAction::Quit;
    set_desktop_quit_on_close(close_behavior.inner(), quit_on_close);
    record_desktop_native_log(
        &app,
        "info",
        "device_settings",
        "Desktop application settings updated from guarded settings.",
    );

    Ok(DesktopControlAppSettings {
        close_action: settings.close_action,
        launch_on_startup: applied_autostart,
        game_detection_enabled: settings.game_detection_enabled,
        registered_games: Some(next_device_settings.registered_games),
    })
}

#[tauri::command]
async fn desktop_control_check_for_updates(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<DesktopControlUpdaterState, String> {
    use tauri_plugin_updater::UpdaterExt;

    assert_desktop_settings_command_window(&window)?;
    let Some(updater) = resolve_desktop_updater(desktop_updater_enabled(), || {
        app.updater()
            .map_err(|_| "Desktop updater is not configured.".to_string())
    })?
    else {
        return Ok(desktop_control_updater_state(false, false, None));
    };

    match updater.check().await {
        Ok(update) => Ok(desktop_control_updater_state(true, true, update.as_ref())),
        Err(_) => {
            record_desktop_native_log(
                &app,
                "error",
                "desktop_updater",
                "Desktop update check failed.",
            );
            Err("Desktop update check failed.".to_string())
        }
    }
}

#[tauri::command]
async fn desktop_control_install_update(
    window: WebviewWindow,
    app: AppHandle,
    confirmed: bool,
    expected_version: String,
) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    assert_desktop_settings_command_window(&window)?;
    let expected_version = validate_desktop_update_install_request(confirmed, &expected_version)?;
    let Some(updater) = resolve_desktop_updater(desktop_updater_enabled(), || {
        app.updater()
            .map_err(|_| "Desktop updater is not configured.".to_string())
    })?
    else {
        return Err("Desktop updater is disabled or not configured.".to_string());
    };
    let Some(update) = updater
        .check()
        .await
        .map_err(|_| "Desktop update check failed.".to_string())?
    else {
        return Err("No desktop update is available.".to_string());
    };

    if update.version != expected_version {
        return Err("Desktop update changed; check again before installing.".to_string());
    }

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|_| "Desktop update download or install failed.".to_string())?;
    record_desktop_native_log(
        &app,
        "info",
        "desktop_updater",
        "Desktop update installed; restarting.",
    );
    app.restart()
}

#[tauri::command]
fn desktop_control_request_notification_permission(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<DesktopControlOperationResult, String> {
    assert_desktop_settings_command_window(&window)?;
    notifications::send(&app, "Whispr", "Whispr masaüstü bildirimleri çalışıyor.")?;

    Ok(DesktopControlOperationResult {
        message:
            "Test notification sent. If it is not visible, check Windows notification settings."
                .to_string(),
    })
}

#[tauri::command]
fn read_desktop_clipboard_text(window: WebviewWindow) -> Result<String, String> {
    assert_desktop_main_command_window(&window)?;
    #[cfg(windows)]
    {
        clipboard::read_text(&window)
    }
    #[cfg(not(windows))]
    {
        Err("Native clipboard access is unavailable on this platform.".into())
    }
}

#[tauri::command]
async fn test_desktop_screen_capture(window: WebviewWindow) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;
    #[cfg(windows)]
    {
        screen_capture_picker::test(window).await
    }
    #[cfg(not(windows))]
    {
        Err("Native screen selection is not available on this platform.".into())
    }
}

#[tauri::command]
fn get_desktop_notification_permission(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<String, String> {
    assert_desktop_settings_command_window(&window)?;
    notifications::permission(&app).map(str::to_owned)
}

#[tauri::command]
fn send_desktop_notification(
    window: WebviewWindow,
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    assert_desktop_settings_command_window(&window)?;
    notifications::send(&app, &title, &body)
}

#[tauri::command]
async fn desktop_control_recover(
    window: WebviewWindow,
    app: AppHandle,
    action: DesktopControlRecoveryAction,
) -> Result<DesktopControlOperationResult, String> {
    assert_desktop_settings_command_window(&window)?;

    let tasks = app.state::<DesktopWindowTasks>().inner().clone();
    tasks
        .run(move || {
            let promotion_state = app.state::<DesktopWindowPromotionState>();
            let message = match action {
                DesktopControlRecoveryAction::ReopenVoiceMini => {
                    show_or_create_desktop_voice_mini_window(&app)?;
                    if let Some(window) = app.get_webview_window(DESKTOP_VOICE_MINI_WINDOW_LABEL) {
                        let _ = window.set_focus();
                    }
                    "Voice mini window reopened."
                }
                DesktopControlRecoveryAction::RefreshOverlay => {
                    if app
                        .get_webview_window(DESKTOP_GAME_OVERLAY_WINDOW_LABEL)
                        .is_some()
                    {
                        let (width, height) =
                            desktop_game_overlay_size(DesktopGameOverlaySize::default());
                        refresh_desktop_companion_surface_window(
                            &app,
                            DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
                            width,
                            height,
                            desktop_game_overlay_bottom_offset(DesktopGameOverlayAnchor::default()),
                            DesktopGameOverlayAnchor::default(),
                            true,
                        )?;
                        "Game overlay refreshed."
                    } else {
                        "Game overlay is not active; nothing was changed."
                    }
                }
                DesktopControlRecoveryAction::HideOverlay => {
                    hide_desktop_game_overlay_window(&app)?;
                    "Game overlay hidden."
                }
                DesktopControlRecoveryAction::ResetMainWindow => {
                    reset_desktop_main_window(&app, promotion_state.inner())?;
                    "Main window size and position reset."
                }
            };

            Ok(DesktopControlOperationResult {
                message: message.to_string(),
            })
        })
        .await
}

#[tauri::command]
async fn show_desktop_control(
    window: WebviewWindow,
    app: AppHandle,
    section: Option<String>,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;
    let section = desktop_control_section(section.as_deref())?;
    open_in_app_desktop_settings(&app, section)?;
    Ok(true)
}

fn desktop_permission_settings_uri(key: &str) -> Option<&'static str> {
    match key {
        "notifications" => Some("ms-settings:notifications"),
        "microphone" => Some("ms-settings:privacy-microphone"),
        "camera" => Some("ms-settings:privacy-webcam"),
        _ => None,
    }
}

#[tauri::command]
fn open_desktop_permission_settings(window: WebviewWindow, key: String) -> Result<bool, String> {
    assert_desktop_main_app_origin_window(&window)?;

    if !cfg!(windows) {
        return Ok(false);
    }

    let uri = desktop_permission_settings_uri(&key)
        .ok_or_else(|| "Desktop permission settings kind is not allowed.".to_string())?;
    open::that(uri).map_err(|_| "Windows permission settings could not be opened.".to_string())?;
    Ok(true)
}

#[tauri::command]
async fn request_desktop_media_permission(
    window: WebviewWindow,
    app: AppHandle,
    media_permissions: tauri::State<'_, DesktopMediaPermissionBroker>,
    kind: String,
) -> Result<DesktopMediaPermissionPromptPayload, String> {
    assert_desktop_main_app_origin_window(&window)?;
    let kind = DesktopMediaPermissionKind::parse(&kind)
        .ok_or_else(|| "Desktop media permission kind is not allowed.".to_string())?;
    let origin = configured_app_origin_url().origin().ascii_serialization();
    let prompt = media_permissions.prepare(kind, &origin, current_unix_ms())?;

    if let Err(error) = open_desktop_control_window(app.clone()).await {
        let _ = media_permissions.resolve(&prompt.request_id, false, current_unix_ms());
        return Err(error);
    }

    if let Some(control_window) = app.get_webview_window(DESKTOP_CONTROL_WINDOW_LABEL) {
        let _ = control_window.eval("window.whisprDesktopControlRefreshState?.();");
    }

    Ok(prompt.into())
}

#[tauri::command]
fn resolve_desktop_media_permission(
    window: WebviewWindow,
    app: AppHandle,
    media_permissions: tauri::State<'_, DesktopMediaPermissionBroker>,
    request_id: String,
    allowed: bool,
) -> Result<DesktopControlOperationResult, String> {
    assert_desktop_control_command_window(&window)?;
    let resolution = media_permissions.resolve(&request_id, allowed, current_unix_ms())?;
    let request_id_json = serde_json::to_string(&resolution.request_id)
        .map_err(|_| "Desktop media permission result could not be encoded.".to_string())?;
    let main_window = app
        .get_webview_window(DESKTOP_MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Whispr main window is unavailable.".to_string())?;

    main_window
        .eval(format!(
            "window.__WHISPR_DESKTOP_MEDIA_PERMISSION_RESOLVE__?.({request_id_json}, {});",
            if resolution.allowed { "true" } else { "false" },
        ))
        .map_err(|_| "Desktop media permission result could not be delivered.".to_string())?;

    let _ = window.hide();
    let _ = main_window.set_focus();

    Ok(DesktopControlOperationResult {
        message: if resolution.allowed {
            format!("{} access approved for Whispr.", resolution.kind.as_str())
        } else {
            format!("{} access was not approved.", resolution.kind.as_str())
        },
    })
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopDetectedGame {
    enabled: bool,
    game_id: Option<String>,
    label: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopGoLiveCandidate {
    enabled: bool,
    game_id: Option<String>,
    label: Option<String>,
    foreground_is_game: bool,
    can_offer_go_live: bool,
}

#[tauri::command]
async fn get_desktop_go_live_candidate(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<DesktopGoLiveCandidate, String> {
    assert_desktop_main_command_window(&window)?;
    let enabled = load_desktop_device_settings(&app)?.game_detection_enabled;
    let game_id = if enabled {
        let games = load_desktop_device_settings(&app)?.registered_games;
        tauri::async_runtime::spawn_blocking(move || game_activity::detect_cached(&games))
            .await
            .map_err(|_| "Game detection unavailable.".to_string())??
    } else {
        None
    };
    let enabled = enabled && load_desktop_device_settings(&app)?.game_detection_enabled;
    let games = load_desktop_device_settings(&app)?.registered_games;
    let foreground_name = if enabled {
        desktop_foreground_process_name()
    } else {
        None
    };
    let foreground = foreground_name
        .as_ref()
        .and_then(|name| game_activity::identify_registered(name, &games));
    let foreground_is_game = foreground.is_some();
    let can_offer_go_live = enabled && (foreground_is_game || is_main_window_focused_impl(&app));
    let game_id = if enabled {
        foreground.or(game_id)
    } else {
        None
    };
    let label = games
        .iter()
        .find(|game| Some(&game.id) == game_id.as_ref())
        .map(|game| game.label.clone());
    Ok(DesktopGoLiveCandidate {
        enabled,
        game_id,
        label,
        foreground_is_game,
        can_offer_go_live,
    })
}

#[tauri::command]
async fn list_desktop_running_applications(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Vec<game_activity::RunningApplication>, String> {
    assert_desktop_main_command_window(&window)?;
    if !load_desktop_device_settings(&app)?.game_detection_enabled {
        return Ok(Vec::new());
    }
    let applications = tauri::async_runtime::spawn_blocking(game_activity::running_applications)
        .await
        .map_err(|_| "Application list unavailable.".to_string())?;
    Ok(
        if load_desktop_device_settings(&app)?.game_detection_enabled {
            applications
        } else {
            Vec::new()
        },
    )
}

#[tauri::command]
async fn get_desktop_detected_game(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<DesktopDetectedGame, String> {
    assert_desktop_main_command_window(&window)?;
    // Process detection is opt-in per device, saved through guarded desktop settings.
    let enabled = load_desktop_device_settings(&app)?.game_detection_enabled;
    let game_id = if enabled {
        let games = load_desktop_device_settings(&app)?.registered_games;
        tauri::async_runtime::spawn_blocking(move || game_activity::detect_cached(&games))
            .await
            .map_err(|_| "Game detection unavailable.".to_string())??
    } else {
        None
    };
    // Consent can be revoked while the blocking scan runs.
    let enabled = enabled && load_desktop_device_settings(&app)?.game_detection_enabled;
    Ok(DesktopDetectedGame {
        enabled,
        label: if enabled {
            load_desktop_device_settings(&app)?
                .registered_games
                .iter()
                .find(|game| Some(&game.id) == game_id.as_ref())
                .map(|game| game.label.clone())
        } else {
            None
        },
        game_id: if enabled { game_id } else { None },
    })
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
    badge_state: tauri::State<'_, DesktopTrayBadgeState>,
    status: Option<String>,
    tray: Option<DesktopTrayContext>,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    if tray
        .as_ref()
        .is_some_and(|value| !matches!(value.locale.as_str(), "tr" | "en"))
    {
        return Err("Desktop tray locale is not supported.".to_string());
    }
    let status = DesktopActivityStatus::from_optional(status.as_deref())?;

    if let Some(window) = app.get_webview_window("main") {
        window
            .set_title(status.title())
            .map_err(|error| format!("Unable to update desktop window activity: {error}"))?;
    }

    let voice_active = tray.as_ref().map_or(
        matches!(
            status,
            DesktopActivityStatus::Voice | DesktopActivityStatus::Streaming
        ),
        |value| value.voice_active,
    );
    app.state::<DesktopTrayItems>()
        .sync(tray.as_ref(), voice_active)?;
    badge_state.set_activity(status);
    apply_desktop_tray_tooltip(&app, badge_state.inner())
        .map_err(|error| format!("Unable to update desktop tray activity: {error}"))?;

    Ok(true)
}

/// F9: the count arrives from the server through the main window's socket and
/// is rendered as-is. Only the main window may publish it, so a companion
/// window cannot invent a badge.
#[tauri::command]
fn publish_desktop_admin_case_count(
    window: WebviewWindow,
    app: AppHandle,
    badge_state: tauri::State<'_, DesktopTrayBadgeState>,
    count: u32,
) -> Result<u32, String> {
    assert_desktop_main_command_window(&window)?;

    badge_state.set_open_case_count(count);
    apply_desktop_tray_tooltip(&app, badge_state.inner())
        .map_err(|error| format!("Unable to update desktop tray moderation badge: {error}"))?;

    Ok(count)
}

fn compose_desktop_tray_tooltip(base: &str, open_case_count: u32) -> String {
    match open_case_count {
        0 => base.to_string(),
        1 => format!("{base} - 1 open case"),
        count => format!("{base} - {count} open cases"),
    }
}

fn apply_desktop_tray_tooltip(
    app: &AppHandle,
    badge_state: &DesktopTrayBadgeState,
) -> Result<(), String> {
    let tooltip = compose_desktop_tray_tooltip(
        badge_state.activity().tray_tooltip(),
        badge_state.open_case_count(),
    );

    if let Some(tray) = app.tray_by_id(DESKTOP_TRAY_ID) {
        tray.set_tooltip(Some(tooltip))
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn set_desktop_game_overlay_visible(
    window: WebviewWindow,
    app: AppHandle,
    surface_state: tauri::State<'_, DesktopCompanionSurfaceState>,
    visible: bool,
    layout: Option<DesktopGameOverlayLayout>,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;
    let layout = layout.unwrap_or_default();
    let state = surface_state.inner().clone();
    state.update_game_overlay(|lifecycle| lifecycle.request_visibility(visible))?;
    let tasks = app.state::<DesktopWindowTasks>().inner().clone();
    tasks
        .run(move || {
            // A newer focus/visibility request supersedes queued work.
            if state.update_game_overlay(|lifecycle| lifecycle.requested())? != visible {
                return Ok(());
            }
            if visible {
                show_or_create_desktop_game_overlay_window(&app, layout)
            } else {
                hide_desktop_game_overlay_window(&app)
            }
        })
        .await?;
    Ok(visible)
}

#[tauri::command]
fn publish_desktop_game_overlay_snapshot(
    window: WebviewWindow,
    app: AppHandle,
    snapshot: DesktopCompanionSnapshotV1,
) -> Result<DesktopCompanionSnapshotPublishResultV1, String> {
    assert_desktop_main_command_window(&window)?;

    publish_desktop_snapshot_to_window(
        &app,
        DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
        "whispr:desktop-game-overlay-snapshot",
        snapshot,
        MAX_DESKTOP_GAME_OVERLAY_SNAPSHOT_BYTES,
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

/// Opening and closing the console is a main-window decision. The console
/// itself cannot call this — `assert_desktop_main_command_window` refuses every
/// label but `main`, which is also what keeps it from closing or re-opening
/// itself from a page that was loaded over the network.
#[tauri::command]
async fn set_desktop_admin_console_visible(
    window: WebviewWindow,
    app: AppHandle,
    visible: bool,
) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    run_desktop_window_task(app, "admin-console", move |app| {
        if visible {
            show_or_create_desktop_admin_console_window(&app)
        } else {
            close_desktop_admin_console_window(&app)
        }
    })
    .await?;

    Ok(visible)
}

#[tauri::command]
fn get_desktop_admin_console_open(window: WebviewWindow, app: AppHandle) -> Result<bool, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(app
        .get_webview_window(DESKTOP_ADMIN_CONSOLE_WINDOW_LABEL)
        .is_some())
}

#[tauri::command]
fn publish_desktop_voice_mini_snapshot(
    window: WebviewWindow,
    app: AppHandle,
    snapshot: DesktopCompanionSnapshotV1,
) -> Result<DesktopCompanionSnapshotPublishResultV1, String> {
    assert_desktop_main_command_window(&window)?;

    publish_desktop_snapshot_to_window(
        &app,
        DESKTOP_VOICE_MINI_WINDOW_LABEL,
        "whispr:desktop-voice-mini-snapshot",
        snapshot,
        MAX_DESKTOP_VOICE_MINI_SNAPSHOT_BYTES,
    )
}

fn publish_desktop_snapshot_to_window(
    app: &AppHandle,
    window_label: &str,
    event_name: &str,
    snapshot: DesktopCompanionSnapshotV1,
    max_bytes: usize,
) -> Result<DesktopCompanionSnapshotPublishResultV1, String> {
    let Some(window) = app.get_webview_window(window_label) else {
        return Ok(DesktopCompanionSnapshotPublishResultV1::new(false));
    };

    let snapshot_json = serde_json::to_string(&snapshot)
        .map_err(|_| "Desktop companion snapshot could not be published.".to_string())?;

    if snapshot_json.len() > max_bytes {
        return Err("Desktop companion snapshot is too large.".to_string());
    }

    let event_json = serde_json::to_string(event_name)
        .map_err(|_| "Desktop companion snapshot could not be published.".to_string())?;
    let script = format!(
        "window.__WHISPR_DESKTOP_SNAPSHOTS__ ??= {{}}; window.__WHISPR_DESKTOP_SNAPSHOTS__[{event_json}] = {snapshot_json}; window.dispatchEvent(new CustomEvent({event_json}, {{ detail: window.__WHISPR_DESKTOP_SNAPSHOTS__[{event_json}] }}));"
    );
    window
        .eval(&script)
        .map_err(|_| "Desktop companion snapshot could not be published.".to_string())?;

    Ok(DesktopCompanionSnapshotPublishResultV1::new(true))
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

fn resolve_desktop_updater<T, F>(enabled: bool, build: F) -> Result<Option<T>, String>
where
    F: FnOnce() -> Result<T, String>,
{
    if !enabled {
        return Ok(None);
    }

    build().map(Some)
}

fn validate_desktop_update_install_request(
    confirmed: bool,
    expected_version: &str,
) -> Result<String, String> {
    if !confirmed {
        return Err("Desktop update install requires explicit confirmation.".to_string());
    }

    let version = expected_version.trim();
    if version.is_empty()
        || version.len() > 64
        || !version.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '+')
        })
    {
        return Err("Desktop update version is invalid.".to_string());
    }

    Ok(version.to_string())
}

fn desktop_control_updater_state(
    enabled: bool,
    checked: bool,
    update: Option<&tauri_plugin_updater::Update>,
) -> DesktopControlUpdaterState {
    if !enabled {
        return DesktopControlUpdaterState {
            available: false,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            enabled: false,
            latest_version: None,
            message: "Updater disabled or not configured for this build.".to_string(),
        };
    }

    match (checked, update) {
        (_, Some(update)) => DesktopControlUpdaterState {
            available: true,
            current_version: update.current_version.clone(),
            enabled: true,
            latest_version: Some(update.version.clone()),
            message: format!("Signed update {} is available.", update.version),
        },
        (false, None) => DesktopControlUpdaterState {
            available: false,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            enabled: true,
            latest_version: None,
            message: "Signed update check has not run yet.".to_string(),
        },
        (true, None) => DesktopControlUpdaterState {
            available: false,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            enabled: true,
            latest_version: None,
            message: "No newer signed desktop update is available.".to_string(),
        },
    }
}

fn desktop_control_permission_info() -> Vec<DesktopControlPermissionInfo> {
    let (screen_instructions, shortcut_instructions) = if cfg!(target_os = "macos") {
        (
            "Use System Settings > Privacy & Security > Screen Recording when screen sharing requires it.",
            "Use System Settings > Privacy & Security > Accessibility if global shortcuts do not respond.",
        )
    } else if cfg!(windows) {
        (
            "Windows presents its capture picker when screen sharing starts; select a window or display there.",
            "Global shortcuts normally need no separate Windows permission; verify conflicting apps if they fail.",
        )
    } else {
        (
            "Your desktop portal asks for screen-share access when capture starts.",
            "Global shortcut availability depends on your desktop environment and compositor.",
        )
    };

    vec![
        DesktopControlPermissionInfo {
            can_request: true,
            id: "notifications",
            instructions: "Send a visible test, then verify Whispr in Windows notification settings if it does not appear.",
            label: "Notifications",
            status: "Desktop API available; OS delivery unverified",
        },
        DesktopControlPermissionInfo {
            can_request: false,
            id: "screen-capture",
            instructions: screen_instructions,
            label: "Screen sharing",
            status: "OS status unverified",
        },
        DesktopControlPermissionInfo {
            can_request: false,
            id: "global-shortcuts",
            instructions: shortcut_instructions,
            label: "Global shortcuts",
            status: "OS status unverified",
        },
    ]
}

fn write_desktop_support_bundle_atomic(
    directory: &std::path::Path,
    timestamp_ms: u64,
    contents: &[u8],
) -> Result<PathBuf, String> {
    fs::create_dir_all(directory)
        .map_err(|_| "Unable to prepare desktop diagnostics directory.".to_string())?;

    for attempt in 0..1_000_u16 {
        let suffix = if attempt == 0 {
            String::new()
        } else {
            format!("-{attempt}")
        };
        let filename = format!("whispr-desktop-support-{timestamp_ms}{suffix}.json");
        let final_path = directory.join(filename);
        let temp_path = directory.join(format!(
            ".whispr-desktop-support-{timestamp_ms}-{}-{attempt}.tmp",
            std::process::id(),
        ));

        let mut temp_file = match OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("Unable to create desktop diagnostics bundle.".to_string()),
        };

        if temp_file
            .write_all(contents)
            .and_then(|_| temp_file.sync_all())
            .is_err()
        {
            let _ = fs::remove_file(&temp_path);
            return Err("Unable to write desktop diagnostics bundle.".to_string());
        }
        drop(temp_file);

        match fs::hard_link(&temp_path, &final_path) {
            Ok(()) => {
                let _ = fs::remove_file(&temp_path);
                return Ok(final_path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let _ = fs::remove_file(&temp_path);
            }
            Err(_) => {
                let _ = fs::remove_file(&temp_path);
                return Err("Unable to finalize desktop diagnostics bundle.".to_string());
            }
        }
    }

    Err("Unable to choose a unique desktop diagnostics filename.".to_string())
}

fn sanitize_diagnostic_text(value: &str) -> String {
    let mut normalized = value
        .chars()
        .map(|character| {
            if character.is_control() && character != '\n' && character != '\t' {
                ' '
            } else {
                character
            }
        })
        .collect::<String>();

    for variable in ["USERPROFILE", "HOME"] {
        let Some(home) = std::env::var_os(variable) else {
            continue;
        };
        let home = home.to_string_lossy();
        if home.trim().is_empty() {
            continue;
        }
        normalized = normalized.replace(home.as_ref(), "[redacted-user-path]");
        normalized = normalized.replace(home.replace('\\', "/").as_str(), "[redacted-user-path]");
    }
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
fn configure_desktop_shortcuts_impl(
    app: &AppHandle,
    registry: &DesktopShortcutRegistry,
    config: DesktopShortcutConfig,
) -> Result<DesktopShortcutStatus, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let mut next_entries = prepare_desktop_shortcut_entries(&config)?;
    let previous_entries = registry
        .entries
        .lock()
        .map(|entries| entries.clone())
        .unwrap_or_default();

    unregister_desktop_shortcuts(app, registered_desktop_shortcuts(&previous_entries))?;

    if !config.shortcuts_enabled {
        replace_desktop_shortcut_entries(registry, Vec::new());
        return Ok(desktop_shortcut_status(
            false,
            &inspect_desktop_shortcut_entries(&config),
        ));
    }

    // First activation may keep four accepted rows when one is owned by another application.
    // Reconfiguration is stricter: any refusal restores the previous working set atomically.
    for entry in &mut next_entries {
        let Some(shortcut) = entry.shortcut else {
            continue;
        };

        match app.global_shortcut().register(shortcut) {
            Ok(()) => entry.registered = true,
            Err(_) => entry.reason = Some(DesktopShortcutFailureReason::OsRefused),
        }
    }

    let refused_action = next_entries
        .iter()
        .find(|entry| entry.reason == Some(DesktopShortcutFailureReason::OsRefused))
        .map(|entry| entry.action);
    let had_previous_registration = previous_entries.iter().any(|entry| entry.registered);

    if let Some(action) = refused_action.filter(|_| had_previous_registration) {
        unregister_desktop_shortcuts(app, registered_desktop_shortcuts(&next_entries))?;
        let mut restored_entries = previous_entries;
        let mut restore_failed = false;

        for entry in &mut restored_entries {
            if !entry.registered {
                continue;
            }
            let Some(shortcut) = entry.shortcut else {
                continue;
            };
            if app.global_shortcut().register(shortcut).is_err() {
                entry.registered = false;
                entry.reason = Some(DesktopShortcutFailureReason::OsRefused);
                restore_failed = true;
            }
        }

        replace_desktop_shortcut_entries(registry, restored_entries);
        return if restore_failed {
            Err("Desktop shortcuts could not be registered or restored.".to_string())
        } else {
            Err(format!(
                "Desktop shortcut {} was refused by the operating system; previous shortcuts were restored.",
                action.label()
            ))
        };
    }

    replace_desktop_shortcut_entries(registry, next_entries);
    let entries = registry
        .entries
        .lock()
        .map(|entries| entries.clone())
        .unwrap_or_default();
    Ok(desktop_shortcut_status(true, &entries))
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn registered_desktop_shortcuts(
    entries: &[DesktopShortcutEntry],
) -> Vec<tauri_plugin_global_shortcut::Shortcut> {
    entries
        .iter()
        .filter(|entry| entry.registered)
        .filter_map(|entry| entry.shortcut)
        .collect()
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn prepare_desktop_shortcut_entries(
    config: &DesktopShortcutConfig,
) -> Result<Vec<DesktopShortcutEntry>, String> {
    if !config.shortcuts_enabled {
        return Ok(Vec::new());
    }

    let mut next_entries = inspect_desktop_shortcut_entries(config);

    if next_entries
        .iter()
        .all(|entry| entry.accelerator.is_empty())
    {
        return Err("Enable at least one desktop shortcut.".to_string());
    }

    let mut seen_ids = HashSet::new();
    for entry in &mut next_entries {
        let Some(shortcut) = entry.shortcut else {
            continue;
        };

        if !seen_ids.insert(shortcut.id()) {
            entry.shortcut = None;
            entry.reason = Some(DesktopShortcutFailureReason::Duplicate);
        }
    }

    validate_desktop_shortcut_entries(&next_entries)?;
    Ok(next_entries)
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn inspect_desktop_shortcut_entries(config: &DesktopShortcutConfig) -> Vec<DesktopShortcutEntry> {
    let mut next_entries = Vec::with_capacity(MAX_DESKTOP_SHORTCUTS);
    push_desktop_shortcut_entry(
        &mut next_entries,
        DesktopShortcutAction::ToggleMute,
        config.toggle_mute.as_deref(),
    );
    push_desktop_shortcut_entry(
        &mut next_entries,
        DesktopShortcutAction::ToggleDeafen,
        config.toggle_deafen.as_deref(),
    );
    push_desktop_shortcut_entry(
        &mut next_entries,
        DesktopShortcutAction::PushToTalk,
        config.push_to_talk.as_deref(),
    );
    push_desktop_shortcut_entry(
        &mut next_entries,
        DesktopShortcutAction::HideGameOverlay,
        config.hide_game_overlay.as_deref(),
    );
    push_desktop_shortcut_entry(
        &mut next_entries,
        DesktopShortcutAction::ToggleAdminConsole,
        config.toggle_admin_console.as_deref(),
    );

    next_entries
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn validate_desktop_shortcut_entries(entries: &[DesktopShortcutEntry]) -> Result<(), String> {
    if let Some(entry) = entries.iter().find(|entry| entry.reason.is_some()) {
        let reason = entry.reason.expect("failure reason checked");
        return Err(format!(
            "Desktop shortcut {} is {}.",
            entry.action.label(),
            reason.label()
        ));
    }

    Ok(())
}

/// An unparseable or reserved combination is kept as a **row** with no shortcut rather than
/// dropped: the screen still has to draw `Bas-konuş` and say why it is not working.
#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn push_desktop_shortcut_entry(
    entries: &mut Vec<DesktopShortcutEntry>,
    action: DesktopShortcutAction,
    value: Option<&str>,
) {
    let raw_shortcut = value.map(str::trim).unwrap_or_default();
    let (shortcut, reason) = if raw_shortcut.is_empty() {
        (None, None)
    } else if is_reserved_desktop_shortcut(raw_shortcut) {
        (None, Some(DesktopShortcutFailureReason::Reserved))
    } else {
        match parse_desktop_shortcut(raw_shortcut) {
            Ok(shortcut) => (Some(shortcut), None),
            Err(_) => (None, Some(DesktopShortcutFailureReason::Invalid)),
        }
    };

    entries.push(DesktopShortcutEntry {
        accelerator: raw_shortcut.to_string(),
        action,
        reason,
        registered: false,
        shortcut,
    });
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn parse_desktop_shortcut(value: &str) -> Result<tauri_plugin_global_shortcut::Shortcut, String> {
    use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

    if value.len() > MAX_DESKTOP_SHORTCUT_LENGTH
        || value
            .chars()
            .any(|character| matches!(character, '\0' | '\n' | '\r'))
        || is_reserved_desktop_shortcut(value)
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
fn normalize_desktop_shortcut(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>()
        .to_lowercase()
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn is_reserved_desktop_shortcut(value: &str) -> bool {
    let normalized = normalize_desktop_shortcut(value);
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
        || is_application_shortcut_accelerator(&normalized)
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn is_application_shortcut_accelerator(value: &str) -> bool {
    let mut parts = value.split('+').collect::<Vec<_>>();
    let Some(key) = parts.pop() else {
        return false;
    };
    let is_command = |part: &&str| {
        matches!(
            *part,
            "cmd"
                | "cmdorctrl"
                | "command"
                | "commandorcontrol"
                | "control"
                | "ctrl"
                | "meta"
                | "super"
        )
    };
    let command = parts.iter().any(is_command);
    let alt = parts.iter().any(|part| matches!(*part, "alt" | "option"));
    let shift = parts.contains(&"shift");
    let known = parts
        .iter()
        .all(|part| is_command(part) || matches!(*part, "alt" | "option" | "shift"));
    if !known {
        return false;
    }

    (command
        && !alt
        && if shift {
            matches!(key, "b" | "d" | "h" | "i" | "m" | "o" | "s" | "u" | "v")
        } else {
            matches!(key, "," | "/" | "b" | "f" | "i" | "k" | "u")
        })
        || (!command && alt && !shift && matches!(key, "arrowdown" | "arrowleft" | "arrowup"))
        || (!command && alt && shift && matches!(key, "arrowdown" | "arrowup"))
        || (!command && !alt && shift && key == "f6")
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
fn unregister_desktop_shortcuts<I>(app: &AppHandle, shortcuts: I) -> Result<(), String>
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
fn replace_desktop_shortcut_entries(
    registry: &DesktopShortcutRegistry,
    entries: Vec<DesktopShortcutEntry>,
) {
    if let Ok(mut current_entries) = registry.entries.lock() {
        *current_entries = entries;
    }
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn desktop_shortcut_status(
    enabled: bool,
    entries: &[DesktopShortcutEntry],
) -> DesktopShortcutStatus {
    DesktopShortcutStatus {
        enabled,
        entries: desktop_shortcut_status_entries(entries),
        // Only what the OS actually accepted. The old bundle reads this list to decide which
        // keys it may advertise, and a refused combination advertised as working is worse than
        // one that is absent.
        registered: entries
            .iter()
            .filter(|entry| entry.registered)
            .filter_map(|entry| {
                entry.shortcut.map(|shortcut| DesktopShortcutRegistration {
                    action: entry.action.label(),
                    shortcut: shortcut.into_string(),
                })
            })
            .collect(),
    }
}

/// K7 — the row-per-assignment answer. Read from the live registry every time; nothing about a
/// conflict survives a restart, because the next launch asks the OS again.
#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn desktop_shortcut_status_entries(
    entries: &[DesktopShortcutEntry],
) -> Vec<DesktopShortcutStatusEntry> {
    entries
        .iter()
        .map(|entry| DesktopShortcutStatusEntry {
            action: entry.action.label(),
            conflict: entry.conflict(),
            keys: entry
                .accelerator
                .split('+')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect(),
            reason: entry.reason,
            registered: entry.registered,
        })
        .collect()
}

fn desktop_shortcut_registry_entries(
    registry: &DesktopShortcutRegistry,
) -> Vec<DesktopShortcutStatusEntry> {
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        let entries = registry
            .entries
            .lock()
            .map(|entries| entries.clone())
            .unwrap_or_default();

        desktop_shortcut_status_entries(&entries)
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = registry;
        Vec::new()
    }
}

fn desktop_shortcut_status_for_app(
    app: &AppHandle,
    registry: &DesktopShortcutRegistry,
) -> Result<DesktopShortcutStatus, String> {
    let settings = load_desktop_device_settings(app)?;

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    {
        let entries = registry
            .entries
            .lock()
            .map(|entries| entries.clone())
            .unwrap_or_default();

        if settings.voice_shortcuts.shortcuts_enabled && !entries.is_empty() {
            return Ok(desktop_shortcut_status(true, &entries));
        }

        Ok(desktop_shortcut_status(
            settings.voice_shortcuts.shortcuts_enabled,
            &inspect_desktop_shortcut_entries(&settings.voice_shortcuts),
        ))
    }

    #[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
    {
        let _ = (settings, registry);
        Ok(DesktopShortcutStatus {
            enabled: false,
            entries: Vec::new(),
            registered: Vec::new(),
        })
    }
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn dispatch_desktop_shortcut_event(
    app: &AppHandle,
    registry: &DesktopShortcutRegistry,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    use tauri_plugin_global_shortcut::ShortcutState;

    if app
        .get_webview_window("desktop-control")
        .and_then(|window| window.is_focused().ok())
        .unwrap_or(false)
    {
        return;
    }

    // Registered OS hotkeys must not execute while editing their assignments.
    if event.state == ShortcutState::Pressed
        && app
            .get_webview_window(DESKTOP_MAIN_WINDOW_LABEL)
            .is_some_and(|window| {
                window.is_focused().unwrap_or(false)
                    && window.url().is_ok_and(|url| {
                        is_same_origin(&url, &configured_app_url())
                            && url.path().trim_end_matches('/') == "/settings/desktop/shortcuts"
                    })
            })
    {
        return;
    }

    let action = registry.entries.lock().ok().and_then(|entries| {
        entries
            .iter()
            .find(|entry| {
                entry.registered
                    && entry
                        .shortcut
                        .is_some_and(|shortcut| shortcut.id() == event.id)
            })
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
    // Açılış penceresinde kapatılan native gölge geri gelir (bkz. `prepare_desktop_start_window`).
    let _ = window.set_shadow(true);

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

/// Açılış penceresi hiçbir koşulda kilitli kalmasın diye son çare.
///
/// Terfi artık web tarafındaki açılış ekranına bağlı: kabuk hazır olduğunda
/// `promote_desktop_main_window` çağrılır. Webview çökerse ya da bir hata o çağrıyı
/// hiç yaptırmazsa pencere 648 × 474'te ve **yeniden boyutlandırılamaz** kalırdı.
/// Bu bekçi o durumda pencereyi ana ölçüye çıkarır; normal açılışta hiç iş yapmaz.
const DESKTOP_STARTUP_PROMOTION_GUARD_MS: u64 = 30_000;

fn spawn_desktop_startup_promotion_guard(
    window: WebviewWindow,
    promotion_state: DesktopWindowPromotionState,
) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(DESKTOP_STARTUP_PROMOTION_GUARD_MS));

        if is_desktop_window_promoted(&promotion_state) {
            return;
        }

        let guarded_window = window.clone();
        let _ = window.run_on_main_thread(move || {
            promote_desktop_window(&guarded_window, &promotion_state);
        });
    });
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
    // Kabuğun köşesi (SPEC §4: 16px) CSS'ten çizilir ve pencere saydamdır. Native
    // gölge dikdörtgen pencere kutusunu takip ettiği için yuvarlatılmış köşelerin
    // dışında görünür kalırdı; açılışta kapatılır, pencere ana ölçüye terfi edince
    // (o zaman kabuk yeniden dikdörtgendir) geri açılır.
    let _ = window.set_shadow(false);
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

fn parse_desktop_device_settings(raw: &[u8]) -> Result<DesktopDeviceSettings, String> {
    let settings = serde_json::from_slice::<DesktopDeviceSettings>(raw)
        .map_err(|_| "Desktop device settings are invalid.".to_string())?;
    if settings.schema_version != DESKTOP_DEVICE_SETTINGS_SCHEMA_VERSION {
        return Err("Desktop device settings use an unsupported schema version.".to_string());
    }

    Ok(settings)
}

fn read_bounded_desktop_settings_file(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Unable to read desktop settings: {error}")),
    };
    if metadata.len() > DESKTOP_DEVICE_SETTINGS_MAX_BYTES {
        return Err("Desktop device settings exceed the size limit.".to_string());
    }

    std::fs::read(path)
        .map(Some)
        .map_err(|error| format!("Unable to read desktop settings: {error}"))
}

fn load_desktop_device_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<DesktopDeviceSettings, String> {
    let settings_path = desktop_device_settings_path(app)?;
    if let Some(raw) = read_bounded_desktop_settings_file(&settings_path)? {
        return parse_desktop_device_settings(&raw);
    }

    let settings = legacy_desktop_native_settings_path(app)
        .and_then(|legacy_path| {
            read_bounded_desktop_settings_file(&legacy_path)
                .ok()
                .flatten()
        })
        .and_then(|raw| serde_json::from_slice::<LegacyDesktopNativeSettings>(&raw).ok())
        .map(DesktopDeviceSettings::from)
        .unwrap_or_default();
    save_desktop_device_settings(app, &settings)?;
    Ok(settings)
}

fn save_desktop_device_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &DesktopDeviceSettings,
) -> Result<(), String> {
    let serialized = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Unable to serialize desktop settings: {error}"))?;
    write_desktop_device_settings_atomic(&desktop_device_settings_path(app)?, &serialized)
}

fn write_desktop_device_settings_atomic(path: &Path, serialized: &[u8]) -> Result<(), String> {
    if serialized.len() as u64 > DESKTOP_DEVICE_SETTINGS_MAX_BYTES {
        return Err("Desktop device settings exceed the size limit.".to_string());
    }
    let Some(parent) = path.parent() else {
        return Err("Desktop device settings directory is unavailable.".to_string());
    };
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Unable to save desktop settings: {error}"))?;

    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary_path = parent.join(format!(
        ".device-settings.{}.{}.tmp",
        std::process::id(),
        suffix
    ));
    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary_path)
            .map_err(|error| format!("Unable to save desktop settings: {error}"))?;
        file.write_all(serialized)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Unable to save desktop settings: {error}"))?;
        replace_desktop_settings_file(&temporary_path, path)
    })();

    if write_result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    write_result
}

#[cfg(windows)]
fn replace_desktop_settings_file(source: &Path, destination: &Path) -> Result<(), String> {
    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let replaced = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        return Err(format!(
            "Unable to replace desktop settings: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_desktop_settings_file(source: &Path, destination: &Path) -> Result<(), String> {
    std::fs::rename(source, destination)
        .map_err(|error| format!("Unable to replace desktop settings: {error}"))
}

fn desktop_device_settings_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|directory| directory.join(DESKTOP_DEVICE_SETTINGS_FILENAME))
        .map_err(|_| "Desktop device settings directory is unavailable.".to_string())
}

fn legacy_desktop_native_settings_path<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|directory| directory.join(DESKTOP_LEGACY_NATIVE_SETTINGS_FILENAME))
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn is_desktop_autostart_enabled(app: &AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;

    app.autolaunch()
        .is_enabled()
        .map_err(|error| format!("Unable to read desktop startup setting: {error}"))
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
fn is_desktop_autostart_enabled(_app: &AppHandle) -> Result<bool, String> {
    Ok(false)
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
fn set_desktop_autostart_from_native_menu(app: &AppHandle, enabled: bool) -> Result<bool, String> {
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
    is_desktop_autostart_enabled(app)
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
fn set_desktop_autostart_from_native_menu(
    _app: &AppHandle,
    _enabled: bool,
) -> Result<bool, String> {
    Ok(false)
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
    let labels = tray_menu::labels("en", false, false);
    let show_item = MenuItem::with_id(app, "show", labels[0], true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", labels[1], true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", labels[2], true, None::<&str>)?;
    let open_separator = PredefinedMenuItem::separator(app)?;
    let settings_separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &open_separator,
            &settings_item,
            &settings_separator,
            &quit_item,
        ],
    )?;
    app.manage(DesktopTrayItems {
        items: [show_item, settings_item, quit_item],
        locale: Mutex::new("en".to_string()),
    });
    let promotion_state_for_menu = promotion_state.clone();
    let mut tray_builder = TrayIconBuilder::with_id(DESKTOP_TRAY_ID)
        .tooltip(format!("{app_name} Desktop"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "settings" => schedule_desktop_control_window(app, "app"),
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
        if SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x.max(monitor_position.x),
            y.max(monitor_position.y),
            width_px.max(1),
            height_px.max(1),
            SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING | SWP_FRAMECHANGED,
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
    if !window
        .app_handle()
        .state::<DesktopCompanionSurfaceState>()
        .update_game_overlay(|lifecycle| lifecycle.can_show())?
    {
        return Ok(());
    }

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
    if !window
        .app_handle()
        .state::<DesktopCompanionSurfaceState>()
        .update_game_overlay(|lifecycle| lifecycle.can_show())?
    {
        return Ok(());
    }

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
        last_error: surface_state
            .last_error()
            .map(|error| sanitize_diagnostic_text(&error)),
        voice_mini: desktop_companion_surface_queued_info(app, DESKTOP_VOICE_MINI_WINDOW_LABEL),
    }
}

fn desktop_companion_surfaces_status(
    app: &tauri::AppHandle,
    surface_state: &DesktopCompanionSurfaceState,
) -> DesktopCompanionSurfacesStatus {
    DesktopCompanionSurfacesStatus {
        game_overlay: desktop_companion_surface_info(app, DESKTOP_GAME_OVERLAY_WINDOW_LABEL),
        last_error: surface_state
            .last_error()
            .map(|error| sanitize_diagnostic_text(&error)),
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

fn reset_desktop_main_window(
    app: &tauri::AppHandle,
    promotion_state: &DesktopWindowPromotionState,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(DESKTOP_MAIN_WINDOW_LABEL) else {
        return Err("Main window is unavailable.".to_string());
    };

    let _ = window.unmaximize();
    let _ = window.unminimize();
    window
        .set_min_size(Some(LogicalSize::new(
            DESKTOP_MIN_WINDOW_WIDTH,
            DESKTOP_MIN_WINDOW_HEIGHT,
        )))
        .map_err(|_| "Main window minimum size could not be restored.".to_string())?;
    window
        .set_size(LogicalSize::new(
            DESKTOP_MAIN_WINDOW_WIDTH,
            DESKTOP_MAIN_WINDOW_HEIGHT,
        ))
        .map_err(|_| "Main window size could not be restored.".to_string())?;
    window
        .center()
        .map_err(|_| "Main window position could not be restored.".to_string())?;
    window
        .show()
        .map_err(|_| "Main window could not be shown.".to_string())?;
    let _ = window.set_focus();
    set_desktop_window_promoted(promotion_state, true);
    save_desktop_main_window_state(app, promotion_state);
    Ok(())
}

fn desktop_control_section(section: Option<&str>) -> Result<&'static str, String> {
    match section.unwrap_or("overview") {
        "overview" => Ok("overview"),
        "app" => Ok("app"),
        "shortcuts" => Ok("shortcuts"),
        "diagnostics" => Ok("diagnostics"),
        "updates" => Ok("updates"),
        "permissions" => Ok("permissions"),
        "recovery" => Ok("recovery"),
        _ => Err("Desktop Control section is not allowed.".to_string()),
    }
}

async fn run_desktop_window_task<F>(
    app: AppHandle,
    label: &'static str,
    task: F,
) -> Result<(), String>
where
    F: FnOnce(AppHandle) -> Result<(), String> + Send + 'static,
{
    let tasks = app.state::<DesktopWindowTasks>().inner().clone();
    let app_for_task = app.clone();
    let result = tasks.run(move || task(app_for_task)).await;
    if let Err(error) = &result {
        record_desktop_native_log(&app, "error", "window_open", &format!("{label}: {error}"));
    }
    result
}

async fn open_desktop_control_window(app: AppHandle) -> Result<(), String> {
    run_desktop_window_task(app, "desktop-control", move |app| {
        show_or_create_desktop_control_window(&app)
    })
    .await
}

fn open_in_app_desktop_settings(app: &AppHandle, section: &str) -> Result<(), String> {
    let tab = match desktop_control_section(Some(section))? {
        "shortcuts" => "shortcuts",
        "permissions" => "permissions",
        "updates" | "diagnostics" | "recovery" | "overview" => "updates",
        _ => "app",
    };
    if app.get_webview_window(DESKTOP_MAIN_WINDOW_LABEL).is_none() {
        return Err("Whispr main window is unavailable.".to_string());
    }
    dispatch_desktop_command(app, "navigate", Some(&format!("/settings/desktop/{tab}")));
    Ok(())
}

fn schedule_desktop_control_window(app: &AppHandle, section: &'static str) {
    if let Err(error) = open_in_app_desktop_settings(app, section) {
        record_desktop_native_log(app, "error", "desktop_settings", &error);
    }
}

fn show_or_create_desktop_control_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DESKTOP_CONTROL_WINDOW_LABEL) {
        window
            .show()
            .map_err(|_| "Desktop Control could not be shown.".to_string())?;
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let control_url = Url::parse("desktop-control://localhost/index.html")
        .map_err(|_| "Desktop Control URL is invalid.".to_string())?;
    let window = WebviewWindowBuilder::new(
        app,
        DESKTOP_CONTROL_WINDOW_LABEL,
        WebviewUrl::CustomProtocol(control_url),
    )
    .title("Whispr Cihaz İzni")
    .inner_size(DESKTOP_CONTROL_WIDTH, DESKTOP_CONTROL_HEIGHT)
    .decorations(false)
    .transparent(true)
    .background_color(tauri::utils::config::Color(0, 0, 0, 0))
    .shadow(false)
    .resizable(false)
    .center()
    .on_navigation(is_desktop_control_url)
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .visible(false)
    .build()
    .map_err(|_| "Desktop Control could not be created.".to_string())?;

    let window_for_close = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_for_close.eval("window.whisprDesktopControlCancelMediaPermission?.();");
            let _ = window_for_close.hide();
        }
    });
    window
        .show()
        .map_err(|_| "Desktop Control could not be shown.".to_string())?;
    let _ = window.set_focus();
    Ok(())
}

fn hide_main_window_to_tray(app: &tauri::AppHandle, promotion_state: &DesktopWindowPromotionState) {
    save_desktop_main_window_state(app, promotion_state);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn hide_desktop_game_overlay_window(app: &tauri::AppHandle) -> Result<(), String> {
    app.state::<DesktopCompanionSurfaceState>()
        .update_game_overlay(|lifecycle| lifecycle.closed())?;
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

    let generation = app
        .state::<DesktopCompanionSurfaceState>()
        .update_game_overlay(|lifecycle| lifecycle.begin_load())?;
    let app_url = desktop_app_url_with_path(DESKTOP_GAME_OVERLAY_PATH);
    let allowed_origin = configured_app_origin_url();
    #[cfg(windows)]
    let initial_url = Url::parse("about:blank").map_err(|error| error.to_string())?;
    #[cfg(not(windows))]
    let initial_url = app_url.clone();
    let webview_data_directory = resolve_webview_data_directory_for_handle(app)
        .map_err(|error| format!("Unable to prepare desktop game overlay webview data: {error}"))?;

    let window = WebviewWindowBuilder::new(
        app,
        DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
        WebviewUrl::External(initial_url),
    )
    .title("")
    .shadow(false)
    .focused(false)
    .background_color(tauri::utils::config::Color(0, 0, 0, 0))
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
    .initialization_script(desktop_init_script(
        false,
        desktop_release_ring().as_str(),
        false,
    ))
    .on_navigation(move |url| {
        if url.as_str() == "about:blank" || is_same_origin(url, &allowed_origin) {
            return true;
        }

        open_external_url(url);
        false
    })
    .on_page_load(move |window, payload| {
        if payload.url().as_str() == "about:blank" {
            return;
        }
        let state = window.app_handle().state::<DesktopCompanionSurfaceState>();
        if matches!(payload.event(), PageLoadEvent::Started) {
            if let Err(error) = state.update_game_overlay(|lifecycle| lifecycle.loading(generation))
            {
                state.set_error(error);
            }
            if let Err(error) = park_desktop_game_overlay_window(&window) {
                state.set_error(error);
            }
            return;
        }
        // A redirect (for example, an expired session) must never expose an auth page as an overlay.
        if payload.url().path() != DESKTOP_GAME_OVERLAY_PATH {
            state.set_error("Desktop overlay did not load its application page.".to_string());
            return;
        }
        match state.update_game_overlay(|lifecycle| lifecycle.loaded(generation)) {
            Ok(true) => {
                let result = refresh_desktop_companion_surface_window(
                    window.app_handle(),
                    DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
                    overlay_width,
                    overlay_height,
                    overlay_bottom_offset,
                    overlay_anchor,
                    true,
                )
                .and_then(|_| show_desktop_game_overlay_window(&window));
                if let Err(error) = result {
                    state.set_error(error);
                }
                dispatch_desktop_surface_ready(
                    window.app_handle(),
                    DESKTOP_GAME_OVERLAY_WINDOW_LABEL,
                );
            }
            Ok(false) => {}
            Err(error) => state.set_error(error),
        }
    })
    .on_new_window(|url, _features| {
        open_external_url(&url);
        NewWindowResponse::Deny
    })
    .visible(false)
    .build()
    .map_err(|error| format!("Unable to create desktop game overlay window: {error}"))?;

    install_webview_media_permission_handler(&window, None, configured_app_origin_url(), app_url)?;

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
    #[cfg(windows)]
    let initial_url = Url::parse("about:blank").map_err(|error| error.to_string())?;
    #[cfg(not(windows))]
    let initial_url = app_url.clone();
    let webview_data_directory = resolve_webview_data_directory_for_handle(app)
        .map_err(|error| format!("Unable to prepare desktop voice mini webview data: {error}"))?;

    let window = WebviewWindowBuilder::new(
        app,
        DESKTOP_VOICE_MINI_WINDOW_LABEL,
        WebviewUrl::External(initial_url),
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
    .initialization_script(desktop_init_script(
        false,
        desktop_release_ring().as_str(),
        false,
    ))
    .on_navigation(move |url| {
        if url.as_str() == "about:blank" || is_same_origin(url, &allowed_origin) {
            return true;
        }

        open_external_url(url);
        false
    })
    .on_page_load(|window, payload| {
        if payload.url().as_str() != "about:blank"
            && matches!(payload.event(), PageLoadEvent::Finished)
        {
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
    .map_err(|error| format!("Unable to create desktop voice mini window: {error}"))?;
    install_webview_media_permission_handler(&window, None, configured_app_origin_url(), app_url)?;
    Ok(())
}

/// The console is a plain second window on the same web app — decorated,
/// resizable and taskbar-visible, unlike the floating voice mini. It carries no
/// capability permissions, so the main window stays the only caller of native
/// desktop commands even while this one is focused.
fn show_or_create_desktop_admin_console_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DESKTOP_ADMIN_CONSOLE_WINDOW_LABEL) {
        window
            .show()
            .map_err(|error| format!("Unable to show desktop admin console window: {error}"))?;
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let app_url = desktop_app_url_with_path(DESKTOP_ADMIN_CONSOLE_PATH);
    let allowed_origin = configured_app_origin_url();
    #[cfg(windows)]
    let initial_url = Url::parse("about:blank").map_err(|error| error.to_string())?;
    #[cfg(not(windows))]
    let initial_url = app_url.clone();
    let webview_data_directory =
        resolve_webview_data_directory_for_handle(app).map_err(|error| {
            format!("Unable to prepare desktop admin console webview data: {error}")
        })?;

    let window = WebviewWindowBuilder::new(
        app,
        DESKTOP_ADMIN_CONSOLE_WINDOW_LABEL,
        WebviewUrl::External(initial_url),
    )
    .title("Whispr Moderation")
    .inner_size(DESKTOP_ADMIN_CONSOLE_WIDTH, DESKTOP_ADMIN_CONSOLE_HEIGHT)
    .min_inner_size(
        DESKTOP_ADMIN_CONSOLE_MIN_WIDTH,
        DESKTOP_ADMIN_CONSOLE_MIN_HEIGHT,
    )
    .resizable(true)
    .center()
    .data_directory(webview_data_directory)
    .initialization_script(desktop_init_script(
        false,
        desktop_release_ring().as_str(),
        false,
    ))
    .on_navigation(move |url| {
        if url.as_str() == "about:blank" || is_same_origin(url, &allowed_origin) {
            return true;
        }

        open_external_url(url);
        false
    })
    .on_new_window(|url, _features| {
        open_external_url(&url);
        NewWindowResponse::Deny
    })
    .build()
    .map_err(|error| format!("Unable to create desktop admin console window: {error}"))?;
    install_webview_media_permission_handler(&window, None, configured_app_origin_url(), app_url)?;
    Ok(())
}

/// Routes a webview's media permission prompt through the desktop broker.
///
/// Only WebView2 exposes a permission-requested hook, so the bridge is wired on
/// Windows alone; WebKit on macOS and Linux keeps its native prompt and the
/// window is left untouched there. Every window goes through this one entry
/// point so the platform split lives here instead of at each call site.
#[cfg(windows)]
fn install_webview_media_permission_handler(
    window: &WebviewWindow,
    broker: Option<DesktopMediaPermissionBroker>,
    allowed_origin: Url,
    initial_url: Url,
) -> Result<(), String> {
    windows_media_permissions::install_webview2_media_permission_handler(
        window,
        broker,
        allowed_origin,
        initial_url,
    )
}

#[cfg(not(windows))]
fn install_webview_media_permission_handler(
    _window: &WebviewWindow,
    _broker: Option<DesktopMediaPermissionBroker>,
    _allowed_origin: Url,
    _initial_url: Url,
) -> Result<(), String> {
    Ok(())
}

fn close_desktop_admin_console_window(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DESKTOP_ADMIN_CONSOLE_WINDOW_LABEL) {
        window
            .close()
            .map_err(|error| format!("Unable to close desktop admin console window: {error}"))?;
    }

    Ok(())
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
        "oauth" => format!("/desktop/oauth/claim{path}"),
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
        if query.len() > 512 || query.contains('\\') {
            return None;
        }

        route.push('?');
        route.push_str(query);
    }

    if route.len() > MAX_DESKTOP_INTERNAL_PATH_LENGTH {
        return None;
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
        || route.starts_with("/desktop/oauth/claim/")
}

#[tauri::command]
fn get_desktop_app_info(window: WebviewWindow) -> Result<DesktopSupportAppInfo, String> {
    assert_desktop_main_command_window(&window)?;

    Ok(desktop_support_app_info())
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

fn desktop_navigation_dispatch_script(
    path: &str,
    target_url: &Url,
    issued_at_ms: u64,
) -> Option<String> {
    let path_json = serde_json::to_string(path).ok()?;
    let target_json = serde_json::to_string(target_url.as_str()).ok()?;

    Some(format!(
        "if (window.__WHISPR_DESKTOP_CLIENT_NAVIGATION_READY__ === true) {{ window.dispatchEvent(new CustomEvent('whispr:desktop-command', {{ detail: {{ command: 'navigate', path: {path_json}, issuedAtMs: {issued_at_ms} }} }})); }} else {{ window.location.assign({target_json}); }}"
    ))
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

    if command == "navigate" {
        if let Some(value) = path {
            let target_url = desktop_app_url_with_path(value);
            let Some(script) =
                desktop_navigation_dispatch_script(value, &target_url, current_unix_ms())
            else {
                return;
            };
            let _ = window.eval(&script);
            return;
        }
    }

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
    if let Some((route_path, query)) = path.split_once('?') {
        url.set_path(route_path);
        url.set_query(Some(query));
    } else {
        url.set_path(path);
        url.set_query(None);
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
        || path.starts_with("/desktop/oauth/")
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

fn is_loopback_http_url(url: &Url) -> bool {
    url.scheme() == "http"
        && matches!(
            url.host_str(),
            Some("localhost") | Some("127.0.0.1") | Some("::1")
        )
}

fn is_allowed_external_url_for_desktop_open(url: &Url) -> bool {
    matches!(url.scheme(), "https" | "mailto" | "tel")
        || (cfg!(debug_assertions) && is_loopback_http_url(url))
}

fn open_external_url(url: &Url) {
    if is_allowed_external_url_for_desktop_open(url) {
        if let Err(error) = open::that(url.as_str()) {
            eprintln!("Failed to open external URL in default browser: {error}");
        }
    } else {
        eprintln!("Blocked unsupported external URL scheme: {}", url.scheme());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_sentry_options_preserve_release_environment_and_pii_policy() {
        let options = desktop_sentry_options("uat".to_string());

        assert_eq!(options.environment.as_deref(), Some("uat"));
        assert_eq!(options.release, sentry::release_name!());
        assert!(!options.send_default_pii);
    }

    #[test]
    fn desktop_custom_commands_are_main_window_only() {
        assert!(is_authorized_desktop_command_window_label("main"));
        assert!(!is_authorized_desktop_command_window_label("voice-mini"));
        assert!(!is_authorized_desktop_command_window_label("game-overlay"));
        assert!(!is_authorized_desktop_command_window_label("settings"));
        assert!(!is_authorized_desktop_command_window_label(""));
        // F test 7: the moderation console is a second window on the same web
        // app, not a second privileged shell. The allowlist is not widened for
        // it — that is the whole point of the check.
        assert!(!is_authorized_desktop_command_window_label(
            DESKTOP_ADMIN_CONSOLE_WINDOW_LABEL
        ));
    }

    #[test]
    fn desktop_control_guard_requires_exact_label_and_local_protocol_origin() {
        let local = Url::parse("desktop-control://localhost/index.html").unwrap();
        let windows_local = Url::parse("http://desktop-control.localhost/index.html").unwrap();
        let spoofed_https_localhost =
            Url::parse("https://desktop-control.localhost/index.html").unwrap();
        let remote = Url::parse("https://whispr.team/desktop-control").unwrap();
        let spoofed = Url::parse("https://desktop-control.evil.example/index.html").unwrap();

        assert!(is_desktop_control_url_for_platform(&local, false));
        assert!(!is_desktop_control_url_for_platform(&windows_local, false));
        assert!(is_desktop_control_url_for_platform(&windows_local, true));

        assert!(is_authorized_desktop_control_command_window(
            DESKTOP_CONTROL_WINDOW_LABEL,
            &local,
        ));
        assert_eq!(
            is_authorized_desktop_control_command_window(
                DESKTOP_CONTROL_WINDOW_LABEL,
                &windows_local,
            ),
            cfg!(windows),
        );
        assert!(!is_authorized_desktop_control_command_window(
            "main", &local
        ));
        assert!(!is_authorized_desktop_control_command_window(
            DESKTOP_CONTROL_WINDOW_LABEL,
            &spoofed_https_localhost,
        ));
        assert!(!is_authorized_desktop_control_command_window(
            DESKTOP_CONTROL_WINDOW_LABEL,
            &remote,
        ));
        assert!(!is_authorized_desktop_control_command_window(
            DESKTOP_CONTROL_WINDOW_LABEL,
            &spoofed,
        ));
    }

    #[test]
    fn desktop_settings_require_the_main_window_and_exact_app_origin() {
        let app = Url::parse("https://whispr.team").unwrap();
        for url in [
            "https://whispr.team/settings/desktop/app",
            "https://whispr.team:443/settings/desktop/shortcuts",
        ] {
            assert!(is_authorized_desktop_settings_window(
                "main",
                &Url::parse(url).unwrap(),
                &app
            ));
        }
        for url in [
            "https://accounts.google.com",
            "https://github.com",
            "https://whispr.team.evil.test",
            "https://evil.test/whispr.team",
            "http://whispr.team",
            "https://whispr.team:444",
            "https://user@whispr.team",
            "https://user:pass@whispr.team",
        ] {
            assert!(
                !is_authorized_desktop_settings_window("main", &Url::parse(url).unwrap(), &app),
                "{url}"
            );
        }
        for label in [
            "game-overlay",
            "voice-mini",
            "settings",
            "desktop-control",
            "",
        ] {
            assert!(
                !is_authorized_desktop_settings_window(label, &app, &app),
                "{label}"
            );
        }
        let local = Url::parse("desktop-control://localhost/index.html").unwrap();
        assert!(is_authorized_desktop_settings_window(
            "desktop-control",
            &local,
            &app
        ));
        assert!(!is_authorized_desktop_settings_window("main", &local, &app));
        let windows_local = Url::parse("http://desktop-control.localhost/index.html").unwrap();
        assert_eq!(
            is_authorized_desktop_settings_window("desktop-control", &windows_local, &app),
            cfg!(windows),
        );
        assert!(!is_authorized_desktop_settings_window(
            "main",
            &windows_local,
            &app
        ));
        let development = Url::parse("http://localhost:3000").unwrap();
        assert!(is_authorized_desktop_settings_window(
            "main",
            &development,
            &development
        ));
        assert!(!is_authorized_desktop_settings_window(
            "main",
            &Url::parse("http://localhost:3001").unwrap(),
            &development
        ));
    }

    #[test]
    fn desktop_control_protocol_serves_only_allowlisted_static_assets() {
        let index = desktop_control_protocol_response("/index.html");
        let css = desktop_control_protocol_response("/app.css");
        let font = desktop_control_protocol_response("/font.woff2");
        let script = desktop_control_protocol_response("/app.js");
        let shortcut_editor = desktop_control_protocol_response("/shortcut-editor.mjs");
        let platform_keyboard = desktop_control_protocol_response("/platform-keyboard.mjs");
        let traversal = desktop_control_protocol_response("/../Cargo.toml");
        let unknown = desktop_control_protocol_response("/missing.js");

        assert_eq!(index.status(), tauri::http::StatusCode::OK);
        assert_eq!(css.status(), tauri::http::StatusCode::OK);
        assert_eq!(font.status(), tauri::http::StatusCode::OK);
        assert_eq!(font.body(), DESKTOP_CONTROL_FONT);
        assert!(font.body().starts_with(b"wOF2"));
        assert_eq!(script.status(), tauri::http::StatusCode::OK);
        assert_eq!(shortcut_editor.status(), tauri::http::StatusCode::OK);
        assert_eq!(platform_keyboard.status(), tauri::http::StatusCode::OK);
        assert_eq!(
            platform_keyboard.body(),
            DESKTOP_CONTROL_PLATFORM_KEYBOARD_SCRIPT
        );
        assert_eq!(traversal.status(), tauri::http::StatusCode::NOT_FOUND);
        assert_eq!(unknown.status(), tauri::http::StatusCode::NOT_FOUND);
        assert_eq!(
            index
                .headers()
                .get(tauri::http::header::CONTENT_SECURITY_POLICY),
            Some(&tauri::http::HeaderValue::from_static(DESKTOP_CONTROL_CSP)),
        );
        assert_eq!(
            script.headers().get(tauri::http::header::CONTENT_TYPE),
            Some(&tauri::http::HeaderValue::from_static(
                "text/javascript; charset=utf-8",
            )),
        );
        assert_eq!(
            shortcut_editor
                .headers()
                .get(tauri::http::header::CONTENT_TYPE),
            Some(&tauri::http::HeaderValue::from_static(
                "text/javascript; charset=utf-8",
            )),
        );
    }

    #[test]
    fn disabled_desktop_updater_does_not_build_or_call_the_plugin() {
        use std::cell::Cell;

        let called = Cell::new(false);
        let updater = resolve_desktop_updater(false, || {
            called.set(true);
            Ok::<_, String>("plugin")
        })
        .unwrap();

        assert_eq!(updater, None);
        assert!(!called.get());
    }

    #[test]
    fn desktop_updater_summary_reflects_a_configured_build() {
        let state = desktop_control_updater_state(true, false, None);

        assert!(state.enabled);
        assert!(!state.available);
        assert_eq!(state.latest_version, None);
        assert_eq!(state.message, "Signed update check has not run yet.");

        let checked_state = desktop_control_updater_state(true, true, None);
        assert_eq!(
            checked_state.message,
            "No newer signed desktop update is available."
        );
    }

    #[test]
    fn desktop_update_install_requires_explicit_confirmation_and_exact_bounded_version() {
        assert!(validate_desktop_update_install_request(false, "1.2.3").is_err());
        assert!(validate_desktop_update_install_request(true, "").is_err());
        assert!(validate_desktop_update_install_request(true, "1.2.3\nnext").is_err());
        assert_eq!(
            validate_desktop_update_install_request(true, " 1.2.3-uat.1 ").unwrap(),
            "1.2.3-uat.1",
        );
    }

    #[test]
    fn desktop_control_recovery_accepts_only_bounded_window_actions() {
        for action in [
            "reopen-voice-mini",
            "refresh-overlay",
            "hide-overlay",
            "reset-main-window",
        ] {
            assert!(serde_json::from_value::<DesktopControlRecoveryAction>(
                serde_json::Value::String(action.to_string()),
            )
            .is_ok());
        }

        assert!(
            serde_json::from_value::<DesktopControlRecoveryAction>(serde_json::Value::String(
                "kill-process".to_string()
            ),)
            .is_err()
        );
    }

    #[test]
    fn desktop_support_bundle_write_is_atomic_and_no_clobber() {
        let directory = std::env::temp_dir().join(format!(
            "whispr-desktop-control-test-{}-{}",
            std::process::id(),
            current_unix_ms(),
        ));
        fs::create_dir_all(&directory).unwrap();

        let first =
            write_desktop_support_bundle_atomic(&directory, 42, br#"{"bundle":1}"#).unwrap();
        let second =
            write_desktop_support_bundle_atomic(&directory, 42, br#"{"bundle":2}"#).unwrap();

        assert_ne!(first, second);
        assert_eq!(fs::read(&first).unwrap(), br#"{"bundle":1}"#);
        assert_eq!(fs::read(&second).unwrap(), br#"{"bundle":2}"#);
        assert!(fs::read_dir(&directory).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".tmp")));

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn desktop_diagnostic_text_redacts_full_user_home_paths() {
        let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))
        else {
            return;
        };
        let home = home.to_string_lossy();
        let sanitized =
            sanitize_diagnostic_text(format!("{}\\Documents\\trace.log", home).as_str());

        assert!(!sanitized.contains(home.as_ref()));
        assert!(sanitized.contains("[redacted-user-path]"));
    }

    /// Invalid input is rejected before the current OS registrations are touched.
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    #[test]
    fn a_reserved_shortcut_is_identified_before_registration() {
        let mixed = DesktopShortcutConfig {
            hide_game_overlay: None,
            // Reserved (`+space`): parsing refuses it, so the row survives without a shortcut.
            push_to_talk: Some("Alt+Space".to_string()),
            shortcuts_enabled: true,
            toggle_admin_console: None,
            toggle_deafen: Some("Alt+D".to_string()),
            toggle_mute: Some("Alt+M".to_string()),
        };

        let entries = inspect_desktop_shortcut_entries(&mixed);
        assert_eq!(entries.len(), 5);

        let push_to_talk = entries
            .iter()
            .find(|entry| entry.action == DesktopShortcutAction::PushToTalk)
            .expect("push-to-talk row is kept");
        assert!(push_to_talk.shortcut.is_none());
        assert!(push_to_talk.conflict());
        assert_eq!(
            push_to_talk.reason,
            Some(DesktopShortcutFailureReason::Reserved)
        );
        assert!(validate_desktop_shortcut_entries(&entries).is_err());

        assert!(entries
            .iter()
            .find(|entry| entry.action == DesktopShortcutAction::ToggleMute)
            .is_some_and(|entry| entry.shortcut.is_some()));
        assert!(entries
            .iter()
            .find(|entry| entry.action == DesktopShortcutAction::ToggleDeafen)
            .is_some_and(|entry| entry.shortcut.is_some()));

        assert!(entries.iter().all(|entry| !entry.registered));
    }

    /// Duplicate input is also rejected before native mutation.
    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    #[test]
    fn a_duplicate_shortcut_is_rejected_before_registration() {
        let duplicated = DesktopShortcutConfig {
            hide_game_overlay: None,
            push_to_talk: None,
            shortcuts_enabled: true,
            toggle_admin_console: None,
            toggle_deafen: Some("Alt+M".to_string()),
            toggle_mute: Some("Alt+M".to_string()),
        };

        let entries = prepare_desktop_shortcut_entries(&duplicated)
            .expect_err("duplicates must fail before current shortcuts are unregistered");

        assert!(entries.contains("duplicate"));
    }

    #[test]
    fn desktop_shortcut_defaults_are_valid_but_disabled() {
        let defaults = DesktopShortcutConfig::default();

        assert!(!defaults.shortcuts_enabled);
        assert_eq!(defaults.toggle_mute.as_deref(), Some("Alt+M"));
        assert_eq!(defaults.toggle_deafen.as_deref(), Some("Alt+D"));
        assert_eq!(defaults.push_to_talk.as_deref(), Some("Alt+V"));
        assert_eq!(defaults.hide_game_overlay.as_deref(), Some("Alt+H"));
        assert_eq!(
            defaults.toggle_admin_console.as_deref(),
            Some("Alt+Shift+K")
        );
    }

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    #[test]
    fn desktop_shortcut_status_reports_every_requested_row_and_reason() {
        let config = DesktopShortcutConfig {
            push_to_talk: Some("Alt+Space".to_string()),
            shortcuts_enabled: true,
            ..DesktopShortcutConfig::default()
        };
        let entries = inspect_desktop_shortcut_entries(&config);
        let serialized = serde_json::to_value(desktop_shortcut_status(true, &entries)).unwrap();
        let rows = serialized["entries"].as_array().expect("status entries");
        let push_to_talk = rows
            .iter()
            .find(|entry| entry["action"] == "pushToTalk")
            .expect("push-to-talk status");

        assert_eq!(rows.len(), 5);
        assert_eq!(push_to_talk["reason"], "reserved");
        assert_eq!(push_to_talk["registered"], false);
    }

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    #[test]
    fn enabling_shortcuts_without_any_assignment_still_fails() {
        let enabled_without_shortcuts = DesktopShortcutConfig {
            hide_game_overlay: None,
            push_to_talk: None,
            shortcuts_enabled: true,
            toggle_admin_console: None,
            toggle_deafen: None,
            toggle_mute: None,
        };

        assert!(prepare_desktop_shortcut_entries(&enabled_without_shortcuts).is_err());
    }

    /// K7 — the five actions the shell registers. The web contract names two of them
    /// differently (`hideOverlay`, `moderationConsole`); these labels are the wire values the
    /// old bundle already reads and must not move.
    #[test]
    fn five_shortcut_actions_keep_their_wire_labels() {
        assert_eq!(
            [
                DesktopShortcutAction::ToggleMute.label(),
                DesktopShortcutAction::ToggleDeafen.label(),
                DesktopShortcutAction::PushToTalk.label(),
                DesktopShortcutAction::HideGameOverlay.label(),
                DesktopShortcutAction::ToggleAdminConsole.label(),
            ],
            [
                "toggleMute",
                "toggleDeafen",
                "pushToTalk",
                "hideGameOverlay",
                "toggleAdminConsole",
            ]
        );
        assert_eq!(MAX_DESKTOP_SHORTCUTS, 5);
    }

    /// F test 8: the tray renders the number it is handed. There is no counting
    /// path on this side to disagree with the server's idea of "open".
    #[test]
    fn desktop_tray_badge_only_renders_the_count_it_is_given() {
        assert_eq!(
            compose_desktop_tray_tooltip("Whispr Desktop", 0),
            "Whispr Desktop"
        );
        assert_eq!(
            compose_desktop_tray_tooltip("Whispr Desktop", 1),
            "Whispr Desktop - 1 open case"
        );
        assert_eq!(
            compose_desktop_tray_tooltip("Whispr Desktop - In voice", 12),
            "Whispr Desktop - In voice - 12 open cases"
        );

        let badge_state = DesktopTrayBadgeState::default();
        assert_eq!(badge_state.open_case_count(), 0);
        badge_state.set_open_case_count(7);
        badge_state.set_activity(DesktopActivityStatus::Offline);
        assert_eq!(
            compose_desktop_tray_tooltip(
                badge_state.activity().tray_tooltip(),
                badge_state.open_case_count()
            ),
            "Whispr Desktop - Offline - 7 open cases"
        );
        // The activity half and the moderation half are independent: changing
        // one must not silently clear the other.
        badge_state.set_activity(DesktopActivityStatus::Idle);
        assert_eq!(badge_state.open_case_count(), 7);
    }

    #[test]
    fn desktop_console_shortcut_dispatches_only_on_key_press() {
        assert_eq!(
            DesktopShortcutAction::ToggleAdminConsole.command(true),
            Some("toggle-admin-console")
        );
        assert_eq!(
            DesktopShortcutAction::ToggleAdminConsole.command(false),
            None
        );
        assert_eq!(
            DesktopShortcutAction::ToggleAdminConsole.label(),
            "toggleAdminConsole"
        );
    }

    #[test]
    fn desktop_admin_console_loads_the_web_route_in_console_surface() {
        let url = desktop_app_url_with_path(DESKTOP_ADMIN_CONSOLE_PATH);

        // No desktop-only frontend: the console is the existing admin route
        // asked for its dense presentation.
        assert_eq!(url.path(), "/admin/moderation");
        assert_eq!(url.query(), Some("surface=console"));
    }

    #[test]
    fn desktop_admin_console_capability_grants_no_permissions() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/admin-console.json")).unwrap();

        assert_eq!(capability["identifier"], "admin-console");
        assert_eq!(
            capability["windows"],
            serde_json::json!([DESKTOP_ADMIN_CONSOLE_WINDOW_LABEL])
        );
        assert_eq!(capability["permissions"], serde_json::json!([]));
        // A window that loads a remote URL only renders at all if the origin is
        // on its own allowlist, so it has to carry the same one voice-mini does.
        let voice_mini: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/voice-mini.json")).unwrap();
        assert_eq!(capability["remote"]["urls"], voice_mini["remote"]["urls"]);
    }

    #[test]
    fn desktop_device_settings_are_versioned_local_and_typed() {
        let settings = parse_desktop_device_settings(
            br#"{"schemaVersion":1,"window":{"closeAction":"quit"},"unexpectedFutureField":"ignored"}"#,
        )
        .unwrap();

        assert_eq!(
            settings.schema_version,
            DESKTOP_DEVICE_SETTINGS_SCHEMA_VERSION
        );
        assert_eq!(settings.window.close_action, DesktopWindowCloseAction::Quit);
        assert!(
            !settings.game_detection_enabled,
            "legacy settings must not consent to scanning"
        );
        assert_eq!(
            DesktopDeviceSettings::default().window.close_action,
            DesktopWindowCloseAction::Tray
        );
        assert!(parse_desktop_device_settings(br#"{"schemaVersion":2}"#).is_err());
    }

    #[test]
    fn legacy_native_settings_migrate_into_the_bounded_device_schema() {
        let legacy = serde_json::from_slice::<LegacyDesktopNativeSettings>(
            br#"{"quit_on_close":true,"voice_shortcuts":{"shortcutsEnabled":false}}"#,
        )
        .unwrap();
        let settings = DesktopDeviceSettings::from(legacy);
        let json = serde_json::to_value(&settings).unwrap();

        assert_eq!(settings.window.close_action, DesktopWindowCloseAction::Quit);
        let keys = json
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<HashSet<_>>();
        assert_eq!(
            keys,
            HashSet::from([
                "schemaVersion".to_string(),
                "gameDetectionEnabled".to_string(),
                "registeredGames".to_string(),
                "voiceShortcuts".to_string(),
                "window".to_string(),
            ])
        );
    }

    #[test]
    fn desktop_initialization_exposes_the_native_os_for_presentation() {
        let script = desktop_init_script(false, "uat", false);
        assert!(script.contains(&format!("os: \"{}\"", std::env::consts::OS)));
        assert!(!script.contains("__WHISPR_DESKTOP_OS__"));
    }

    #[test]
    fn autostart_argument_is_exact_and_enters_hidden_launch_mode() {
        assert!(desktop_launched_from_autostart([
            "whispr.exe".to_string(),
            DESKTOP_AUTOSTART_ARG.to_string(),
        ]));
        assert!(!desktop_launched_from_autostart([
            "whispr.exe".to_string(),
            "--autostart-debug".to_string(),
        ]));
        assert!(desktop_init_script(false, "uat", true).contains("launchMode: \"autostart\""));
        assert!(desktop_init_script(false, "uat", false).contains("launchMode: \"interactive\""));
    }

    #[test]
    fn device_settings_replace_is_atomic_for_existing_files() {
        let directory = std::env::temp_dir().join(format!(
            "whispr-device-settings-test-{}-{}",
            std::process::id(),
            current_unix_ms()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join(DESKTOP_DEVICE_SETTINGS_FILENAME);
        std::fs::write(&path, b"old").unwrap();

        write_desktop_device_settings_atomic(&path, b"new").unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn desktop_companion_snapshot_requires_the_v1_typed_contract() {
        let valid = serde_json::json!({
            "active": true,
            "connection": { "quality": "good", "rttMs": null },
            "participants": [],
            "updatedAt": "2026-07-27T10:30:00.000Z",
            "version": 1
        });
        let invalid = serde_json::json!({
            "active": true,
            "connection": { "quality": "good", "rttMs": null },
            "participants": serde_json::Value::Array(
                (0..13)
                    .map(|index| serde_json::json!({
                        "audioLevel": 0.5,
                        "avatarUrl": null,
                        "displayName": "Whispr",
                        "isDeafened": false,
                        "isLocal": index == 0,
                        "isMuted": false,
                        "isSpeaking": false,
                        "userId": format!("user-{index}")
                    }))
                    .collect(),
            ),
            "updatedAt": "2026-07-27T10:30:00.000Z",
            "version": 1
        });
        let unknown_field = serde_json::json!({
            "active": true,
            "connection": { "quality": "good", "rttMs": null },
            "participants": [],
            "unexpected": true,
            "updatedAt": "2026-07-27T10:30:00.000Z",
            "version": 1
        });
        let unsupported_version = serde_json::json!({
            "active": true,
            "connection": { "quality": "good", "rttMs": null },
            "participants": [],
            "updatedAt": "2026-07-27T10:30:00.000Z",
            "version": 2
        });

        assert!(serde_json::from_value::<DesktopCompanionSnapshotV1>(valid).is_ok());
        assert!(serde_json::from_value::<DesktopCompanionSnapshotV1>(invalid).is_err());
        assert!(serde_json::from_value::<DesktopCompanionSnapshotV1>(unknown_field).is_err());
        assert!(serde_json::from_value::<DesktopCompanionSnapshotV1>(unsupported_version).is_err());
    }

    #[test]
    fn external_browser_open_policy_allows_only_safe_schemes() {
        assert!(is_allowed_external_url_for_desktop_open(
            &Url::parse("https://whispr.team/desktop/oauth/start").unwrap()
        ));
        assert!(is_allowed_external_url_for_desktop_open(
            &Url::parse("mailto:support@whispr.team").unwrap()
        ));
        assert!(is_allowed_external_url_for_desktop_open(
            &Url::parse("tel:+15555550100").unwrap()
        ));
        assert_eq!(
            is_allowed_external_url_for_desktop_open(
                &Url::parse("http://localhost:3000/desktop/oauth/start").unwrap()
            ),
            cfg!(debug_assertions)
        );
        assert!(!is_allowed_external_url_for_desktop_open(
            &Url::parse("http://example.com/desktop/oauth/start").unwrap()
        ));
        assert!(!is_allowed_external_url_for_desktop_open(
            &Url::parse("javascript:alert(1)").unwrap()
        ));
    }

    #[test]
    fn desktop_permission_settings_uri_allowlist_is_exact() {
        assert_eq!(
            desktop_permission_settings_uri("notifications"),
            Some("ms-settings:notifications")
        );
        assert_eq!(
            desktop_permission_settings_uri("microphone"),
            Some("ms-settings:privacy-microphone")
        );
        assert_eq!(
            desktop_permission_settings_uri("camera"),
            Some("ms-settings:privacy-webcam")
        );
        assert_eq!(desktop_permission_settings_uri("screenShare"), None);
        assert_eq!(desktop_permission_settings_uri("globalShortcuts"), None);
        assert_eq!(desktop_permission_settings_uri("javascript:alert(1)"), None);
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
    fn desktop_app_info_exposes_runtime_version_metadata() {
        let info = desktop_support_app_info();

        assert_eq!(info.app_version, env!("CARGO_PKG_VERSION"));
        assert!(!info.release_ring.trim().is_empty());
        assert_eq!(info.tauri_version, tauri::VERSION);
        assert!(!info.webview_version.trim().is_empty());
    }

    #[test]
    fn desktop_native_media_capabilities_stay_research_gated() {
        let capabilities = desktop_platform_capabilities();

        assert_eq!(capabilities.native_screen_capture.status, "research_gated");
        assert_eq!(
            capabilities.native_screen_capture.fallback,
            "browser_get_display_media"
        );
        assert_eq!(capabilities.system_audio_capture.status, "research_gated");
        assert_eq!(
            capabilities.system_audio_capture.fallback,
            "no_system_audio_capture"
        );
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

    #[test]
    fn desktop_deep_links_accept_safe_internal_routes() {
        assert_eq!(
            safe_desktop_deep_link_path("whispr://invite/ABCDEFGH"),
            Some("/invite/ABCDEFGH".to_string())
        );
        assert_eq!(
            safe_desktop_deep_link_path("whispr://invite/ABCDEFGH?desktop=1"),
            Some("/invite/ABCDEFGH?desktop=1".to_string())
        );
        assert_eq!(
            safe_desktop_deep_link_path("https://whispr.team/invite/ABCDEFGH"),
            None
        );
        assert_eq!(safe_desktop_deep_link_path("whispr://evil/ABCDEFGH"), None);
        assert_eq!(
            safe_desktop_deep_link_path("whispr://invite/..\\settings"),
            None
        );

        let path_segment = "a".repeat(500);
        let allowed_query_value = "b".repeat(255);
        let oversized_query_value = "b".repeat(256);
        let allowed = format!("whispr://channels/{path_segment}?q={allowed_query_value}");
        let oversized = format!("whispr://channels/{path_segment}?q={oversized_query_value}");

        assert_eq!(
            safe_desktop_deep_link_path(&allowed)
                .expect("768-byte internal path should remain valid")
                .len(),
            768
        );
        assert_eq!(safe_desktop_deep_link_path(&oversized), None);
    }

    #[test]
    fn desktop_deep_links_accept_oauth_handoff_claims_only_as_internal_routes() {
        assert_eq!(
            safe_desktop_deep_link_path(
                "whispr://oauth/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-?callbackUrl=%2Fchannels"
            ),
            Some(
                "/desktop/oauth/claim/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-?callbackUrl=%2Fchannels"
                    .to_string()
            )
        );
        assert_eq!(
            safe_desktop_deep_link_path("whispr://oauth/..\\settings"),
            None
        );
        assert_eq!(safe_desktop_deep_link_path("whispr://oauth"), None);
    }

    #[test]
    fn desktop_navigation_uses_spa_bridge_with_a_cold_start_fallback() {
        let target = Url::parse("https://whispr.team/channels/server-1?from=deeplink")
            .expect("valid app URL");
        let script =
            desktop_navigation_dispatch_script("/channels/server-1?from=deeplink", &target, 42)
                .expect("serializable navigation script");

        assert!(script.contains("__WHISPR_DESKTOP_CLIENT_NAVIGATION_READY__ === true"));
        assert!(script.contains("new CustomEvent('whispr:desktop-command'"));
        assert!(script.contains("command: 'navigate'"));
        assert!(script.contains("path: \"/channels/server-1?from=deeplink\""));
        assert!(script.contains("issuedAtMs: 42"));
        assert!(script.contains(
            "window.location.assign(\"https://whispr.team/channels/server-1?from=deeplink\")"
        ));
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
        assert!(is_reserved_desktop_shortcut("Alt+Space"));
        assert!(is_reserved_desktop_shortcut("Ctrl+Space"));
        assert!(is_reserved_desktop_shortcut("CmdOrCtrl+Shift+Space"));
        assert!(is_reserved_desktop_shortcut("Alt+Tab"));
        assert!(is_reserved_desktop_shortcut("Alt+F4"));
        assert!(is_reserved_desktop_shortcut("CmdOrCtrl+Shift+H"));
        assert!(is_reserved_desktop_shortcut("CmdOrCtrl+Shift+V"));
        assert!(is_reserved_desktop_shortcut("CmdOrCtrl+Shift+S"));
        assert!(!is_reserved_desktop_shortcut("Alt+V"));
        assert!(parse_desktop_shortcut("Alt+V").is_ok());
        assert!(parse_desktop_shortcut("Alt+Space").is_err());
    }
}
