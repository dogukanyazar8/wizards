import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const retiredRemoteMutationPermissions = [
  "allow-get-desktop-autostart-enabled",
  "allow-set-desktop-autostart-enabled",
  "allow-get-desktop-quit-on-close-enabled",
  "allow-set-desktop-quit-on-close-enabled",
];

const rawUpdaterPluginPermissions = [
  "process:allow-restart",
  "updater:allow-check",
  "updater:allow-download-and-install",
];

const retiredRemotePermissionOnboardingPermissions = [
  "notification:allow-request-permission",
  "notification:allow-is-permission-granted",
  "notification:allow-notify",
];

const desktopControlPermissions = [
  "allow-configure-desktop-voice-shortcuts",
  "allow-desktop-control-check-for-updates",
  "allow-desktop-control-install-update",
  "allow-desktop-control-recover",
  "allow-desktop-control-request-notification-permission",
  "allow-get-desktop-notification-permission",
  "allow-send-desktop-notification",
  "allow-desktop-control-set-app-settings",
  "allow-export-desktop-diagnostics-bundle",
  "allow-get-desktop-control-state",
  "allow-resolve-desktop-media-permission",
];

const requestDesktopMediaPermission = "allow-request-desktop-media-permission";
const resolveDesktopMediaPermission = "allow-resolve-desktop-media-permission";
const openDesktopPermissionSettings = "allow-open-desktop-permission-settings";

describe("desktop trusted native control boundary", () => {
  it("permits the fixed IPC transports without disabling the application CSP", async () => {
    const config = JSON.parse(
      await readFile(path.join(desktopRoot, "src-tauri", "tauri.conf.json"), "utf8"),
    );
    const csp = config.app.security.csp;
    const sources = csp
      .split(";")
      .find((part) => part.trim().startsWith("connect-src "))
      .trim()
      .split(/\s+/);
    for (const source of ["ipc:", "http://ipc.localhost", "https://ipc.localhost"]) {
      assert.ok(sources.includes(source), `missing ${source}`);
    }
    assert.ok(!sources.includes("*"));
    assert.ok(!sources.includes("http:"));
    assert.ok(!sources.includes("https:"));
  });
  it("keeps startup and close-behavior mutation behind trusted local controls", async () => {
    const staticCapability = JSON.parse(
      await readFile(path.join(desktopRoot, "src-tauri", "capabilities", "main.json"), "utf8"),
    );
    const runTauriSource = await readFile(
      path.join(desktopRoot, "scripts", "run-tauri.mjs"),
      "utf8",
    );
    const rustSource = await readFile(path.join(desktopRoot, "src-tauri", "src", "lib.rs"), "utf8");
    const snapshotSource = await readFile(
      path.join(desktopRoot, "src-tauri", "src", "ipc", "companion_snapshot.rs"),
      "utf8",
    );
    const buildScript = await readFile(path.join(desktopRoot, "src-tauri", "build.rs"), "utf8");

    for (const permission of retiredRemoteMutationPermissions) {
      assert.ok(
        !staticCapability.permissions.includes(permission),
        `Checked-in main capability must not receive ${permission}.`,
      );
      assert.doesNotMatch(
        runTauriSource,
        new RegExp(`"${permission}"`),
        `Generated main capability must not receive ${permission}.`,
      );
      assert.doesNotMatch(buildScript, new RegExp(`"${permission.replace("allow-", "")}"`));
    }

    const settingsCommand = rustSource.slice(
      rustSource.indexOf("fn desktop_control_set_app_settings("),
      rustSource.indexOf("fn desktop_control_check_for_updates("),
    );
    assert.match(settingsCommand, /assert_desktop_settings_command_window\(&window\)\?/);
    assert.match(settingsCommand, /set_desktop_autostart_from_native_menu/);
    assert.match(settingsCommand, /save_desktop_device_settings/);
    assert.match(settingsCommand, /set_desktop_quit_on_close/);
    assert.match(
      rustSource,
      /DESKTOP_DEVICE_SETTINGS_FILENAME:\s*&str\s*=\s*"device-settings\.json"/,
      "Device settings must use a dedicated local-data file.",
    );
    assert.match(rustSource, /\.arg\(DESKTOP_AUTOSTART_ARG\)/);
    assert.match(rustSource, /fn desktop_control_set_app_settings\(/);
    assert.match(rustSource, /write_desktop_device_settings_atomic\(/);
    assert.doesNotMatch(rustSource, /fn set_desktop_autostart_enabled\(/);
    assert.doesNotMatch(rustSource, /fn set_desktop_quit_on_close_enabled\(/);
    assert.match(
      rustSource,
      /fn publish_desktop_game_overlay_snapshot\([\s\S]*snapshot: DesktopCompanionSnapshotV1/,
      "Overlay snapshots must enter Rust through a typed v1 contract.",
    );
    assert.match(
      rustSource,
      /fn publish_desktop_voice_mini_snapshot\([\s\S]*snapshot: DesktopCompanionSnapshotV1/,
      "Voice-mini snapshots must enter Rust through a typed v1 contract.",
    );
    assert.doesNotMatch(
      rustSource,
      /fn publish_desktop_(?:game_overlay|voice_mini)_snapshot\([\s\S]{0,400}serde_json::Value/,
      "Companion snapshot commands must not accept untyped JSON.",
    );
    assert.match(snapshotSource, /deny_unknown_fields/);
    assert.match(snapshotSource, /MAX_DESKTOP_COMPANION_PARTICIPANTS: usize = 12/);
    assert.match(snapshotSource, /DESKTOP_COMPANION_SNAPSHOT_VERSION: u8 = 1/);
  });

  it("grants only guarded settings commands to main and keeps media consent local", async () => {
    const [mainCapability, controlCapability, voiceMiniCapability, overlayCapability] =
      await Promise.all(
        ["main", "desktop-control", "voice-mini", "game-overlay"].map((identifier) =>
          readFile(
            path.join(desktopRoot, "src-tauri", "capabilities", `${identifier}.json`),
            "utf8",
          ).then(JSON.parse),
        ),
      );

    assert.equal(controlCapability.identifier, "desktop-control");
    assert.deepEqual(controlCapability.windows, ["desktop-control"]);
    assert.equal(controlCapability.remote, undefined);

    assert.deepEqual(
      controlCapability.permissions,
      ["allow-get-desktop-control-state", resolveDesktopMediaPermission],
      "The local consent surface must have only read and consent commands.",
    );
    assert.ok(mainCapability.permissions.includes(requestDesktopMediaPermission));
    assert.ok(mainCapability.permissions.includes(openDesktopPermissionSettings));
    assert.ok(!mainCapability.permissions.includes(resolveDesktopMediaPermission));
    assert.ok(!controlCapability.permissions.includes(requestDesktopMediaPermission));
    assert.ok(controlCapability.permissions.includes(resolveDesktopMediaPermission));
    assert.ok(!controlCapability.permissions.includes(openDesktopPermissionSettings));

    for (const permission of desktopControlPermissions.filter(
      (value) => value !== resolveDesktopMediaPermission,
    )) {
      assert.ok(
        mainCapability.permissions.includes(permission),
        `Main settings must receive ${permission}.`,
      );
      const command = permission.slice(6).replaceAll("-", "_");
      const rust = await readFile(path.join(desktopRoot, "src-tauri", "src", "lib.rs"), "utf8");
      assert.match(
        rust,
        new RegExp(
          `fn ${command}\\([\\s\\S]*?assert_desktop_settings_command_window\\(&window\\)\\?;`,
        ),
      );
      const generator = await readFile(path.join(desktopRoot, "scripts", "run-tauri.mjs"), "utf8");
      assert.ok(generator.includes(`"${permission}"`));
    }

    for (const permission of retiredRemotePermissionOnboardingPermissions) {
      assert.ok(
        !mainCapability.permissions.includes(permission),
        `Remote main must not own permission onboarding through ${permission}.`,
      );
    }

    for (const permission of rawUpdaterPluginPermissions) {
      assert.ok(
        !mainCapability.permissions.includes(permission) &&
          !controlCapability.permissions.includes(permission),
        `Frontend capabilities must not bypass the confirmed Rust updater wrapper via ${permission}.`,
      );
    }

    assert.deepEqual(voiceMiniCapability.permissions, ["core:window:allow-start-dragging"]);
    assert.deepEqual(overlayCapability.permissions, []);
  });

  it("ships a network-free accessible Desktop Control surface", async () => {
    const assetRoot = path.join(desktopRoot, "src-tauri", "assets", "desktop-control");
    const [html, css, script, shortcutEditor] = await Promise.all(
      ["index.html", "app.css", "app.js", "shortcut-editor.mjs"].map((asset) =>
        readFile(path.join(assetRoot, asset), "utf8"),
      ),
    );
    const platformKeyboard = await readFile(
      path.join(desktopRoot, "../../packages/ui/src/platform-keyboard.mjs"),
      "utf8",
    );
    const combined = `${html}\n${css}\n${script}\n${shortcutEditor}\n${platformKeyboard}`;

    assert.match(html, /<main[\s>]/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /aria-labelledby="media-permission-title"/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /prefers-color-scheme:\s*light/);
    assert.doesNotMatch(combined, /https?:\/\//);
    assert.doesNotMatch(
      `${script}\n${shortcutEditor}\n${platformKeyboard}`,
      /\bfetch\s*\(|\beval\s*\(/,
    );
    assert.doesNotMatch(
      script,
      /desktop_control_install_update|desktop_control_set_app_settings|configure_desktop_voice_shortcuts|desktop_control_recover|export_desktop_diagnostics_bundle/,
    );
    assert.match(script, /resolve_desktop_media_permission/);
    assert.match(script, /whisprDesktopControlCancelMediaPermission/);
    assert.match(
      await readFile(path.join(desktopRoot, "src-tauri", "src", "lib.rs"), "utf8"),
      /fn desktop_control_request_notification_permission\([\s\S]*?notifications::send\(/,
    );
    assert.doesNotMatch(html, /id="app-settings-form"|id="shortcut-form"/);
    assert.match(html, /<dialog[^>]+id="media-permission-dialog"/);
  });

  it("routes desktop entry points to integrated settings without raw updater access", async () => {
    const webRoot = path.resolve(desktopRoot, "..", "web", "src");
    const [controls, experience, diagnostics, settingsLaunch, desktopSettings] = await Promise.all([
      readFile(path.join(webRoot, "lib", "desktop", "controls.ts"), "utf8"),
      readFile(path.join(webRoot, "components", "desktop", "desktop-experience.tsx"), "utf8"),
      readFile(
        path.join(webRoot, "components", "desktop", "desktop-diagnostics-panel.tsx"),
        "utf8",
      ),
      readFile(path.join(webRoot, "components", "desktop", "desktop-control-launch.ts"), "utf8"),
      readFile(
        path.join(webRoot, "components", "settings", "sections", "desktop", "desktop-section.tsx"),
        "utf8",
      ),
    ]);

    assert.match(controls, /show_desktop_control/);
    assert.doesNotMatch(controls, /"configure_desktop_voice_shortcuts"/);
    assert.doesNotMatch(controls, /"export_desktop_diagnostics_bundle"/);
    assert.doesNotMatch(experience, /configureDesktopVoiceShortcuts/);
    assert.doesNotMatch(
      experience,
      /requestNotificationPermissionOnInteraction|\.requestPermission\(/,
    );
    assert.match(experience, /getDesktopVoiceShortcutStatus/);
    assert.match(experience, /setDesktopGlobalShortcutsEnabled/);
    assert.match(diagnostics, /launchDesktopControlSection\([\s\S]{0,80}"diagnostics"/);
    assert.doesNotMatch(diagnostics, /exportDesktopDiagnosticsBundle/);
    assert.match(settingsLaunch, /return "updates"/);
    assert.doesNotMatch(desktopSettings, /downloadInstallAndRelaunchDesktopUpdate/);
    assert.doesNotMatch(desktopSettings, /@tauri-apps\/plugin-updater/);
    assert.match(desktopSettings, /desktopControlSectionForSettingsAction/);
    assert.doesNotMatch(desktopSettings, /writeDesktopShortcutStatus/);
    assert.doesNotMatch(desktopSettings, /configure_desktop_shortcuts/);
  });
});

it("native screen permission testing is main-only and never captures frames", async () => {
  const main = JSON.parse(
    await readFile(path.join(desktopRoot, "src-tauri/capabilities/main.json"), "utf8"),
  );
  const local = JSON.parse(
    await readFile(path.join(desktopRoot, "src-tauri/capabilities/desktop-control.json"), "utf8"),
  );
  assert.ok(main.permissions.includes("allow-test-desktop-screen-capture"));
  assert.ok(!local.permissions.includes("allow-test-desktop-screen-capture"));
  const rust = await readFile(path.join(desktopRoot, "src-tauri/src/lib.rs"), "utf8");
  assert.match(
    rust,
    /fn test_desktop_screen_capture\([\s\S]*?assert_desktop_main_command_window\(&window\)\?;/,
  );
  const picker = await readFile(
    path.join(desktopRoot, "src-tauri/src/screen_capture_picker.rs"),
    "utf8",
  );
  assert.match(picker, /PickSingleItemAsync/);
  assert.doesNotMatch(picker, /CreateCaptureSession|StartCapture/);
});

it("native identity and permission handlers are installed before remote navigation", async () => {
  const source = await readFile(
    path.join(desktopRoot, "src-tauri/src/windows_media_permissions.rs"),
    "utf8",
  );
  assert.ok(source.indexOf("SetUserAgent") < source.indexOf("webview.Navigate"));
  assert.ok(source.indexOf("add_PermissionRequested") < source.indexOf("webview.Navigate"));
  assert.match(source, /WhisprDesktop\//);
  assert.match(source, /SetIsPasswordAutosaveEnabled\(false\)/);
});

it("native paste is bounded and restricted to the main application", async () => {
  const source = await readFile(path.join(desktopRoot, "src-tauri/src/lib.rs"), "utf8");
  assert.match(
    source,
    /fn read_desktop_clipboard_text\([\s\S]*?assert_desktop_main_command_window\(&window\)\?;/,
  );
  const local = JSON.parse(
    await readFile(path.join(desktopRoot, "src-tauri/capabilities/desktop-control.json"), "utf8"),
  );
  assert.ok(!local.permissions.includes("allow-read-desktop-clipboard-text"));
});

it("companion windows install native identity and deny device permissions before loading", async () => {
  const rust = await readFile(path.join(desktopRoot, "src-tauri/src/lib.rs"), "utf8");
  for (const name of ["game_overlay", "voice_mini", "admin_console"]) {
    const start = rust.indexOf(`fn show_or_create_desktop_${name}_window(`);
    const body = rust.slice(start, rust.indexOf("\n}", start) + 2);
    assert.match(body, /Url::parse\("about:blank"\)/);
    assert.match(body, /WebviewUrl::External\(initial_url\)/);
    assert.match(body, /install_webview2_media_permission_handler\([\s\S]*?&window,\s*None,/);
  }
  const policy = await readFile(
    path.join(desktopRoot, "src-tauri/src/windows_media_permissions.rs"),
    "utf8",
  );
  assert.match(policy, /None => apply_webview_media_permission_decision\([\s\S]*?DenyEphemeral/);
});

it("native controls use the same Outfit asset as the application", async () => {
  const [rust, css] = await Promise.all([
    readFile(path.join(desktopRoot, "src-tauri/src/lib.rs"), "utf8"),
    readFile(path.join(desktopRoot, "src-tauri/assets/desktop-control/app.css"), "utf8"),
  ]);
  assert.match(
    rust,
    /include_bytes!\("\.\.\/\.\.\/\.\.\/web\/src\/app\/fonts\/outfit-latin\.woff2"\)/,
  );
  assert.match(css, /font-family: Outfit;/);
  assert.doesNotMatch(css, /Figtree/);
});
