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

const desktopControlMutationPermissions = [
  "allow-configure-desktop-voice-shortcuts",
  "allow-export-desktop-diagnostics-bundle",
];

const rawUpdaterPluginPermissions = [
  "process:allow-restart",
  "updater:allow-check",
  "updater:allow-download-and-install",
];

const retiredRemotePermissionOnboardingPermissions = ["notification:allow-request-permission"];

const desktopControlPermissions = [
  "allow-configure-desktop-voice-shortcuts",
  "allow-desktop-control-check-for-updates",
  "allow-desktop-control-install-update",
  "allow-desktop-control-recover",
  "allow-desktop-control-request-notification-permission",
  "allow-export-desktop-diagnostics-bundle",
  "allow-get-desktop-control-state",
];

describe("desktop trusted native control boundary", () => {
  it("keeps startup and close-behavior mutation behind native tray controls", async () => {
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

    assert.match(
      rustSource,
      /CheckMenuItem::with_id\([\s\S]*"autostart"[\s\S]*"Launch at startup"/,
      "Native tray must own the launch-at-startup control.",
    );
    assert.match(
      rustSource,
      /CheckMenuItem::with_id\([\s\S]*"quit_on_close"[\s\S]*"Quit when main window closes"/,
      "Native tray must own the close-behavior control.",
    );
    assert.match(
      rustSource,
      /save_desktop_native_settings\([\s\S]*quit_on_close/,
      "Native close behavior must persist without a remote renderer write.",
    );
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

  it("keeps privileged desktop mutations on one trusted local capability", async () => {
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
      desktopControlPermissions,
      "Desktop Control must expose only its guarded Rust commands, never raw plugin commands.",
    );

    for (const permission of desktopControlMutationPermissions) {
      assert.ok(
        !mainCapability.permissions.includes(permission),
        `Remote main must not own ${permission}.`,
      );
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
    const [html, css, script] = await Promise.all(
      ["index.html", "app.css", "app.js"].map((asset) =>
        readFile(path.join(assetRoot, asset), "utf8"),
      ),
    );
    const combined = `${html}\n${css}\n${script}`;

    assert.match(html, /<main[\s>]/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /<label[\s>]/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /prefers-color-scheme:\s*light/);
    assert.doesNotMatch(combined, /https?:\/\//);
    assert.doesNotMatch(script, /\bfetch\s*\(|\beval\s*\(/);
    assert.match(script, /window\.confirm\(/);
    assert.match(script, /desktop_control_install_update/);
    assert.match(script, /export_desktop_diagnostics_bundle/);
    assert.match(script, /configure_desktop_voice_shortcuts/);
    assert.match(script, /desktop_control_recover/);
  });

  it("routes remote web settings and updater actions to Desktop Control", async () => {
    const webRoot = path.resolve(desktopRoot, "..", "web", "src");
    const [controls, experience, diagnostics, updaterNotifier, voicePreferences] =
      await Promise.all([
        readFile(path.join(webRoot, "lib", "desktop", "controls.ts"), "utf8"),
        readFile(path.join(webRoot, "components", "desktop", "desktop-experience.tsx"), "utf8"),
        readFile(
          path.join(webRoot, "components", "desktop", "desktop-diagnostics-panel.tsx"),
          "utf8",
        ),
        readFile(
          path.join(webRoot, "components", "desktop", "desktop-native-update-notifier.tsx"),
          "utf8",
        ),
        readFile(path.join(webRoot, "components", "voice", "voice-preferences-panel.tsx"), "utf8"),
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
    assert.match(updaterNotifier, /launchDesktopControlSection\("updates"/);
    assert.doesNotMatch(updaterNotifier, /downloadInstallAndRelaunchDesktopUpdate/);
    assert.doesNotMatch(updaterNotifier, /@tauri-apps\/plugin-updater/);
    assert.match(voicePreferences, /launchDesktopControlSection\([\s\S]{0,80}"shortcuts"/);
    assert.doesNotMatch(voicePreferences, /<DesktopShortcutInputRow/);
  });
});
