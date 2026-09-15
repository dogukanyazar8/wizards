import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_DESKTOP_SHORTCUTS,
  captureDesktopShortcut,
  validateDesktopShortcutAssignments,
} from "../src-tauri/assets/desktop-control/shortcut-editor.mjs";
import { formatShortcut } from "../../../packages/ui/src/platform-keyboard.mjs";

function keyEvent(overrides = {}) {
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("Desktop Control shortcut editor", () => {
  it("formats physical key captures without changing the accelerator sent to native", () => {
    const captured = captureDesktopShortcut(
      keyEvent({ ctrlKey: true, altKey: true, code: "Digit1", key: "1" }),
    );
    assert.equal(captured.kind, "captured");
    assert.equal(formatShortcut(captured.accelerator, "macos"), "⌃⌥1");
    assert.equal(formatShortcut(captured.accelerator, "windows"), "Ctrl+Alt+1");
    assert.equal(captured.accelerator, "Control+Alt+1");
    assert.deepEqual(validateDesktopShortcutAssignments({ toggleMute: captured.accelerator }), {});
  });
  it("starts disabled with five valid device-local defaults", () => {
    assert.deepEqual(DEFAULT_DESKTOP_SHORTCUTS, {
      hideGameOverlay: "Alt+H",
      pushToTalk: "Alt+V",
      toggleAdminConsole: "Alt+Shift+K",
      toggleDeafen: "Alt+D",
      toggleMute: "Alt+M",
    });
    assert.deepEqual(validateDesktopShortcutAssignments(DEFAULT_DESKTOP_SHORTCUTS), {});
  });

  it("captures physical keys and supports cancel and clear", () => {
    assert.deepEqual(captureDesktopShortcut(keyEvent({ altKey: true, code: "KeyM", key: "µ" })), {
      accelerator: "Alt+M",
      kind: "captured",
    });
    assert.deepEqual(captureDesktopShortcut(keyEvent({ code: "Escape", key: "Escape" })), {
      kind: "cancel",
    });
    assert.deepEqual(captureDesktopShortcut(keyEvent({ code: "Delete", key: "Delete" })), {
      kind: "clear",
    });
  });

  it("reports reserved, invalid, and duplicate rows before native mutation", () => {
    assert.deepEqual(
      validateDesktopShortcutAssignments({
        ...DEFAULT_DESKTOP_SHORTCUTS,
        pushToTalk: "Alt+Space",
        toggleDeafen: "Alt+M",
      }),
      {
        pushToTalk: "reserved",
        toggleDeafen: "duplicate",
        toggleMute: "duplicate",
      },
    );
    assert.deepEqual(
      validateDesktopShortcutAssignments({
        ...DEFAULT_DESKTOP_SHORTCUTS,
        toggleMute: "M",
      }),
      { toggleMute: "invalid" },
    );
    assert.deepEqual(
      validateDesktopShortcutAssignments({
        ...DEFAULT_DESKTOP_SHORTCUTS,
        toggleMute: "CmdOrCtrl+Shift+V",
      }),
      { toggleMute: "reserved" },
    );
  });
});
