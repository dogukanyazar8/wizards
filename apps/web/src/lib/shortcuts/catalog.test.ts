import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "@/lib/locale/messages/en";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

import {
  APP_SHORTCUT_CATALOG,
  APP_SHORTCUT_IDS,
  getAppShortcutLabels,
  getAppShortcutAccessibleLabels,
  getAppShortcutAriaKeyShortcuts,
  matchesAppShortcut,
  resolveAppShortcut,
} from "./catalog";

it("ignores keydown events without a usable key, including synthetic autofill events", () => {
  for (const key of [undefined, null, 42, {}, ""]) {
    const event = { key, ctrlKey: true } as unknown as Parameters<typeof matchesAppShortcut>[1];
    assert.equal(matchesAppShortcut("commandPalette.toggle", event), false);
    assert.equal(resolveAppShortcut(APP_SHORTCUT_IDS, event), null);
  }
  const event = new Event("keydown") as unknown as Parameters<typeof matchesAppShortcut>[1];
  assert.equal(resolveAppShortcut(APP_SHORTCUT_IDS, event), null);
});

function press(
  key: string,
  modifiers: Partial<{
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    target: unknown;
  }> = {},
) {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

describe("application shortcut catalog", () => {
  it("keeps every discoverable in-app shortcut in one typed catalog", () => {
    assert.equal(APP_SHORTCUT_IDS.length, 29);
    assert.deepEqual(Object.keys(APP_SHORTCUT_CATALOG), [...APP_SHORTCUT_IDS]);

    for (const shortcut of Object.values(APP_SHORTCUT_CATALOG)) {
      assert.ok(shortcut.labelKey.length > 0);
      assert.equal(typeof EN_MESSAGES[shortcut.labelKey], "string");
      assert.equal(typeof TR_MESSAGES[shortcut.labelKey], "string");
      assert.ok(["app", "context"].includes(shortcut.scope));
      assert.ok(shortcut.bindings.length > 0);
      assert.ok(shortcut.handler.length > 0);
    }
  });

  it("renders platform defaults without showing macOS glyphs on Windows", () => {
    assert.deepEqual(getAppShortcutLabels("commandPalette.toggle", "macos"), ["⌘K"]);
    assert.deepEqual(getAppShortcutLabels("commandPalette.toggle", "windows"), ["Ctrl+K"]);
    assert.deepEqual(getAppShortcutLabels("navigation.back", "macos"), ["⌥←", "⌘["]);
    assert.deepEqual(getAppShortcutLabels("navigation.back", "windows"), ["Alt+←"]);
  });

  it("keeps every catalog binding visible across platforms, including the literal plus key", () => {
    for (const platform of ["windows", "macos", "linux", "unknown"] as const) {
      for (const id of APP_SHORTCUT_IDS) {
        const labels = getAppShortcutLabels(id, platform);
        assert.ok(labels.length > 0, `${platform}: ${id}`);
        assert.ok(
          labels.every((label) => label.length > 0),
          `${platform}: ${id}`,
        );
      }
      assert.deepEqual(getAppShortcutLabels("message.addReaction", platform), ["+"]);
    }
    assert.deepEqual(getAppShortcutLabels("commandPalette.toggle", "unknown"), ["Ctrl/Cmd+K"]);
    assert.deepEqual(getAppShortcutAccessibleLabels("navigation.back", "macos"), [
      "Option + ArrowLeft",
      "Command + [",
    ]);
    assert.equal(getAppShortcutAriaKeyShortcuts("commandPalette.toggle", "macos"), "Meta+k");
    assert.equal(getAppShortcutAriaKeyShortcuts("commandPalette.toggle", "windows"), "Control+k");
    assert.equal(
      getAppShortcutAriaKeyShortcuts("commandPalette.toggle", "unknown"),
      "Control+k Meta+k",
    );
  });

  it("matches modifiers exactly and respects typing-target policy", () => {
    assert.equal(matchesAppShortcut("commandPalette.toggle", press("K", { ctrlKey: true })), true);
    assert.equal(matchesAppShortcut("commandPalette.toggle", press("k", { metaKey: true })), true);
    assert.equal(
      matchesAppShortcut("commandPalette.toggle", press("k", { ctrlKey: true, shiftKey: true })),
      false,
    );
    assert.equal(
      matchesAppShortcut(
        "commandPalette.toggle",
        press("k", { ctrlKey: true, target: { tagName: "INPUT" } }),
      ),
      false,
    );
    assert.equal(
      matchesAppShortcut(
        "commandPalette.toggle",
        press("k", { ctrlKey: true, target: { tagName: "INPUT" } }),
        { allowInTypingTarget: true },
      ),
      true,
    );
    assert.equal(
      matchesAppShortcut(
        "composer.bold",
        press("B", { ctrlKey: true, shiftKey: true, target: { tagName: "TEXTAREA" } }),
      ),
      true,
    );
  });

  it("preserves mention aliases and resolves one semantic action", () => {
    assert.equal(
      resolveAppShortcut(["mentions.next", "mentions.previous"], press("J", { shiftKey: true })),
      "mentions.next",
    );
    assert.equal(
      resolveAppShortcut(["mentions.next", "mentions.previous"], press("ArrowUp")),
      "mentions.previous",
    );
    assert.equal(
      resolveAppShortcut(["mentions.reply", "mentions.toggleRead"], press("r", { ctrlKey: true })),
      null,
    );
  });

  it("reserves Ctrl/Cmd+K for quick switch and Ctrl/Cmd+F for chat search", () => {
    assert.equal(matchesAppShortcut("chat.search", press("f", { ctrlKey: true })), true);
    assert.equal(matchesAppShortcut("chat.search", press("k", { ctrlKey: true })), false);
    assert.equal(matchesAppShortcut("commandPalette.toggle", press("k", { ctrlKey: true })), true);
  });

  it("matches the phase 3 navigation, message, help, and voice chords", () => {
    assert.equal(matchesAppShortcut("shortcuts.help", press("/", { ctrlKey: true })), true);
    assert.equal(matchesAppShortcut("navigation.next", press("ArrowDown", { altKey: true })), true);
    assert.equal(
      matchesAppShortcut(
        "navigation.previousUnread",
        press("ArrowUp", { altKey: true, shiftKey: true }),
      ),
      true,
    );
    assert.equal(matchesAppShortcut("navigation.nextRegion", press("F6")), true);
    assert.equal(
      matchesAppShortcut("navigation.previousRegion", press("F6", { shiftKey: true })),
      true,
    );
    assert.equal(matchesAppShortcut("message.reply", press("r")), true);
    assert.equal(matchesAppShortcut("message.editLast", press("ArrowUp")), true);
    assert.equal(matchesAppShortcut("message.addReaction", press("+", { shiftKey: true })), true);
    assert.equal(matchesAppShortcut("context.close", press("Escape")), true);
    assert.equal(
      matchesAppShortcut("voice.leave", press("h", { ctrlKey: true, shiftKey: true })),
      true,
    );
    assert.equal(
      matchesAppShortcut("voice.toggleCamera", press("v", { metaKey: true, shiftKey: true })),
      true,
    );
    assert.equal(
      matchesAppShortcut("voice.toggleScreenShare", press("s", { ctrlKey: true, shiftKey: true })),
      true,
    );
  });

  it("has no duplicate app binding or duplicate binding within one contextual handler", () => {
    for (const platform of ["macos", "windows", "linux"] as const) {
      const seen = new Map<string, string>();

      for (const id of APP_SHORTCUT_IDS) {
        const shortcut = APP_SHORTCUT_CATALOG[id];
        for (const label of getAppShortcutLabels(id, platform)) {
          const collisionKey =
            shortcut.scope === "app" ? `app:${label}` : `${shortcut.handler}:${label}`;
          assert.equal(
            seen.get(collisionKey),
            undefined,
            `${label} duplicates ${seen.get(collisionKey)} on ${platform}`,
          );
          seen.set(collisionKey, id);
        }
      }
    }
  });

  it("owns chords used by every cataloged handler", () => {
    const root = process.cwd();
    const sources = {
      chat: readFileSync(join(root, "src/components/chat/chat-area.tsx"), "utf8"),
      composer: readFileSync(join(root, "src/components/chat/message-input.tsx"), "utf8"),
      desktop: readFileSync(join(root, "src/components/desktop/desktop-experience.tsx"), "utf8"),
      mentions: readFileSync(join(root, "src/lib/mentions/keyboard.ts"), "utf8"),
      palette: readFileSync(join(root, "src/lib/home/command-palette.ts"), "utf8"),
      paletteChip: readFileSync(
        join(root, "src/components/screens/app-screen-top-bar.tsx"),
        "utf8",
      ),
      settings: readFileSync(join(root, "src/components/shell/user-bar-menu.tsx"), "utf8"),
      shortcutController: readFileSync(
        join(root, "src/components/shortcuts/app-shortcut-controller.tsx"),
        "utf8",
      ),
      shortcutShell: readFileSync(join(root, "src/components/shell/wizards-shell.tsx"), "utf8"),
      messageItem: readFileSync(join(root, "src/components/chat/message-item.tsx"), "utf8"),
    };

    assert.match(sources.palette, /matchesAppShortcut\("commandPalette\.toggle", event/);
    assert.match(sources.settings, /matchesAppShortcut\("settings\.open", event/);
    assert.match(sources.desktop, /matchesAppShortcut\("voice\.toggleMute", event/);
    assert.match(sources.mentions, /resolveAppShortcut\(MENTION_SHORTCUT_IDS, input/);
    assert.match(sources.composer, /resolveAppShortcut\(COMPOSER_FORMATTING_SHORTCUT_IDS, event/);
    assert.match(sources.chat, /matchesAppShortcut\("chat\.search", event/);
    assert.match(sources.chat, /useAppShortcutLabel\("chat\.search"\)/);
    assert.match(sources.paletteChip, /useAppShortcutLabel\("commandPalette\.toggle"\)/);
    assert.match(sources.settings, /useAppShortcutLabel\("settings\.open"\)/);
    assert.match(
      sources.shortcutController,
      /resolveAppShortcut\(CONTROLLER_SHORTCUT_IDS, event\)/,
    );
    assert.match(
      sources.shortcutController,
      /leaveChannel, sessionMode, toggleCamera, toggleScreenShare/u,
    );
    assert.match(sources.shortcutShell, /<AppShortcutController/u);
    assert.match(sources.messageItem, /\["message\.reply", "message\.addReaction"\]/u);
    assert.match(sources.composer, /matchesAppShortcut\("message\.editLast", event/u);
    assert.doesNotMatch(sources.chat, /event\.key === "k"/);
    assert.doesNotMatch(sources.chat, />\s*Ctrl K\s*</);
  });
});
