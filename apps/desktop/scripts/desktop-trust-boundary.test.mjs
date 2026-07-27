import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const remoteMutationPermissions = [
  "allow-get-desktop-autostart-enabled",
  "allow-set-desktop-autostart-enabled",
  "allow-get-desktop-quit-on-close-enabled",
  "allow-set-desktop-quit-on-close-enabled",
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

    for (const permission of remoteMutationPermissions) {
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
});
