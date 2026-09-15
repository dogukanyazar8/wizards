import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectPlatform,
  formatShortcut,
  formatShortcutParts,
  keyboardPlatform,
  readableShortcut,
} from "./platform-keyboard.mjs";

describe("platform keyboard presentation", () => {
  it("uses native OS before conflicting browser signals", () => {
    assert.equal(
      detectPlatform({
        nativePlatform: "macos",
        userAgentDataPlatform: "Windows",
        platform: "Win32",
      }),
      "macos",
    );
    assert.equal(
      detectPlatform({ nativePlatform: "linux", userAgent: "Windows NT 10.0" }),
      "linux",
    );
    assert.equal(
      detectPlatform({ nativePlatform: "invalid", userAgentDataPlatform: "Windows" }),
      "windows",
    );
  });

  it("recognizes browser platforms with and without client hints", () => {
    for (const [signal, expected] of [
      ["Windows", "windows"],
      ["macOS", "macos"],
      ["Linux", "linux"],
      ["Chrome OS", "chromeos"],
      ["Android", "android"],
    ] as const) {
      assert.equal(detectPlatform({ userAgentDataPlatform: signal }), expected);
    }
    assert.equal(
      detectPlatform({
        userAgent: "Mozilla/5.0 (X11; CrOS x86_64 16093.68.0)",
        platform: "Linux x86_64",
      }),
      "chromeos",
    );
    assert.equal(
      detectPlatform({
        userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
        platform: "Linux armv8l",
      }),
      "android",
    );
    assert.equal(
      detectPlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }),
      "ios",
    );
    assert.equal(detectPlatform({ platform: "MacIntel", maxTouchPoints: 5 }), "ios");
    assert.equal(detectPlatform({ userAgentDataPlatform: "macOS", maxTouchPoints: 5 }), "ios");
    assert.equal(detectPlatform({ platform: "MacIntel", maxTouchPoints: 0 }), "macos");
    assert.equal(
      detectPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }),
      "windows",
    );
  });

  it("keeps missing or unrecognized platforms neutral", () => {
    assert.equal(detectPlatform(), "unknown");
    assert.equal(detectPlatform({ platform: "OtherOS", userAgent: "OtherBrowser" }), "unknown");
    assert.equal(formatShortcut("CmdOrCtrl+K"), "Ctrl/Cmd+K");
    assert.equal(formatShortcut("Control+Alt+Meta+K", null), "Ctrl+Alt+Meta+K");
  });

  it("distinguishes the primary modifier from literal Control and Meta", () => {
    for (const [platform, primary, control, meta] of [
      ["windows", "Ctrl+K", "Ctrl+K", "Win+K"],
      ["macos", "⌘K", "⌃K", "⌘K"],
      ["linux", "Ctrl+K", "Ctrl+K", "Super+K"],
    ] as const) {
      assert.equal(formatShortcut("CmdOrCtrl+K", platform), primary);
      assert.equal(formatShortcut("CommandOrControl+K", platform), primary);
      assert.equal(formatShortcut("Control+K", platform), control);
      assert.equal(formatShortcut("Meta+K", platform), meta);
    }
    assert.equal(keyboardPlatform("ios"), "macos");
    assert.equal(formatShortcut("CmdOrCtrl+K", "ios"), "⌘K");
    assert.equal(formatShortcut("CmdOrCtrl+K", "chromeos"), "Ctrl+K");
    assert.equal(formatShortcut("CmdOrCtrl+K", "android"), "Ctrl+K");
  });

  it("preserves literal plus, unknown key names, and readable modifier names", () => {
    assert.equal(formatShortcut("+", "windows"), "+");
    assert.equal(formatShortcut("Control++", "macos"), "⌃+");
    assert.deepEqual(formatShortcutParts("Hyper+K", "macos"), ["Hyper", "K"]);
    assert.deepEqual(formatShortcutParts("toString+K"), ["toString", "K"]);
    assert.equal(formatShortcut("", "macos"), "");
    assert.equal(
      readableShortcut(formatShortcutParts("Control+Alt+Shift+Meta+K", "macos")),
      "Control + Option + Shift + Command + K",
    );
  });
});
