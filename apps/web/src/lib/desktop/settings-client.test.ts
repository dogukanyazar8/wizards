import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNativeSettingsClient } from "./settings-client";
import {
  DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
  desktopShortcutDraftError,
  nativeDesktopShortcutAssignments,
} from "./shortcuts";

describe("integrated desktop settings", () => {
  it("sends typed app settings through the guarded command and preserves native results", async () => {
    const calls: unknown[] = [];
    const application = {
      launchOnStartup: true,
      closeAction: "tray" as const,
      gameDetectionEnabled: false,
    };
    const client = createNativeSettingsClient(
      async <T>(command: string, args?: Record<string, unknown>) => {
        calls.push([command, args]);
        return application as T;
      },
    );
    assert.deepEqual(await client.application(application), application);
    assert.deepEqual(calls, [["desktop_control_set_app_settings", { settings: application }]]);
  });
  it("preserves cleared shortcuts and maps each action to the native contract", async () => {
    let payload: Record<string, unknown> | undefined;
    const client = createNativeSettingsClient(
      async <T>(command: string, args?: Record<string, unknown>) => {
        assert.equal(command, "configure_desktop_voice_shortcuts");
        payload = args;
        return { enabled: true, entries: [] } as T;
      },
    );
    const assignments = { ...DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, toggleMute: "" };
    await client.shortcuts(assignments, true);
    assert.deepEqual(payload, {
      config: {
        shortcutsEnabled: true,
        toggleMute: "",
        toggleDeafen: assignments.toggleDeafen,
        pushToTalk: assignments.pushToTalk,
        hideGameOverlay: assignments.hideOverlay,
        toggleAdminConsole: assignments.moderationConsole,
      },
    });
    assert.equal(
      nativeDesktopShortcutAssignments({
        enabled: false,
        entries: [{ action: "toggleMute", keys: [], registered: false, conflict: false }],
      }).toggleMute,
      "",
    );
  });
  it("rejects duplicate aliases, reserved combinations and invalid keys before saving", () => {
    assert.equal(desktopShortcutDraftError(DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, "windows"), null);
    assert.equal(
      desktopShortcutDraftError(
        {
          ...DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS,
          toggleMute: "Ctrl+Alt+M",
          toggleDeafen: "Alt+Control+M",
        },
        "windows",
      ),
      "duplicate",
    );
    assert.equal(
      desktopShortcutDraftError(
        { ...DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, toggleMute: "Alt+F4" },
        "windows",
      ),
      "invalid",
    );
    assert.equal(
      desktopShortcutDraftError(
        { ...DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, toggleMute: "M" },
        "macos",
      ),
      "invalid",
    );
    assert.equal(
      desktopShortcutDraftError(
        { ...DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, toggleMute: "" },
        "linux",
      ),
      null,
    );
  });
  it("pins installation to the confirmed version and passes no download URL or path", async () => {
    const calls: unknown[] = [];
    const client = createNativeSettingsClient(
      async <T>(command: string, args?: Record<string, unknown>) => {
        calls.push([command, args]);
        return undefined as T;
      },
    );
    await client.install("1.2.3");
    await client.diagnostics();
    await client.recovery("reset-main-window");
    assert.deepEqual(calls, [
      ["desktop_control_install_update", { confirmed: true, expectedVersion: "1.2.3" }],
      ["export_desktop_diagnostics_bundle", undefined],
      ["desktop_control_recover", { action: "reset-main-window" }],
    ]);
  });
  it("propagates native failures without claiming a successful save", async () => {
    const client = createNativeSettingsClient(async () => {
      throw new Error("disk full");
    });
    await assert.rejects(
      client.application({
        launchOnStartup: false,
        closeAction: "quit",
        gameDetectionEnabled: false,
      }),
      /disk full/,
    );
    await assert.rejects(client.shortcuts(DEFAULT_DESKTOP_SHORTCUT_ASSIGNMENTS, true), /disk full/);
    await assert.rejects(client.install("1.2.3"), /disk full/);
  });
});

it("notification delivery and status use guarded app commands", async () => {
  const calls: unknown[] = [];
  const client = createNativeSettingsClient(
    async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return "granted" as T;
    },
  );
  assert.equal(await client.notificationPermission(), "granted");
  await client.sendNotification("Ada", "Merhaba");
  assert.deepEqual(calls, [
    ["get_desktop_notification_permission", undefined],
    ["send_desktop_notification", { title: "Ada", body: "Merhaba" }],
  ]);
});
