import {
  formatShortcut,
  formatShortcutParts,
  readableShortcut,
  type KeyboardPlatform,
} from "@wizards/ui/platform-keyboard.mjs";

export const APP_SHORTCUT_IDS = [
  "commandPalette.toggle",
  "settings.open",
  "voice.toggleMute",
  "voice.toggleDeafen",
  "overlay.hide",
  "navigation.back",
  "mentions.next",
  "mentions.previous",
  "mentions.reply",
  "mentions.toggleRead",
  "mentions.close",
  "composer.bold",
  "composer.italic",
  "composer.underline",
  "chat.search",
  "shortcuts.help",
  "navigation.next",
  "navigation.previous",
  "navigation.nextUnread",
  "navigation.previousUnread",
  "navigation.nextRegion",
  "navigation.previousRegion",
  "message.reply",
  "message.editLast",
  "message.addReaction",
  "context.close",
  "voice.leave",
  "voice.toggleCamera",
  "voice.toggleScreenShare",
] as const;

export type AppShortcutId = (typeof APP_SHORTCUT_IDS)[number];
export type AppShortcutPlatform = KeyboardPlatform;
export type AppShortcutScope = "app" | "context" | "global";
export type AppShortcutHandler =
  | "ChatArea"
  | "AppShortcutController"
  | "ContextualOverlay"
  | "DesktopExperience"
  | "MessageItem"
  | "MessageInput"
  | "isCommandPaletteShortcut"
  | "isSettingsShortcut"
  | "resolveMentionShortcut";

type AppShortcutBinding = {
  readonly allowShift?: boolean;
  readonly alt?: boolean;
  readonly commandOrControl?: boolean;
  readonly key: string;
  readonly meta?: boolean;
  readonly platform?: AppShortcutPlatform;
  readonly shift?: boolean;
};

type AppShortcutDefinition = {
  readonly bindings: readonly AppShortcutBinding[];
  readonly category: "accessibility" | "composer" | "mentions" | "message" | "navigation" | "voice";
  readonly handler: AppShortcutHandler;
  readonly labelKey: string;
  readonly scope: AppShortcutScope;
  readonly typingTarget: "allow" | "ignore";
};

export const APP_SHORTCUT_CATALOG = {
  "commandPalette.toggle": {
    bindings: [{ commandOrControl: true, key: "k" }],
    category: "navigation",
    handler: "isCommandPaletteShortcut",
    labelKey: "shortcuts.app.commandPalette",
    scope: "app",
    typingTarget: "ignore",
  },
  "settings.open": {
    bindings: [{ commandOrControl: true, key: "," }],
    category: "navigation",
    handler: "isSettingsShortcut",
    labelKey: "shortcuts.app.settings",
    scope: "app",
    typingTarget: "ignore",
  },
  "voice.toggleMute": {
    bindings: [{ commandOrControl: true, key: "m", shift: true }],
    category: "voice",
    handler: "DesktopExperience",
    labelKey: "shortcuts.app.toggleMute",
    scope: "app",
    typingTarget: "ignore",
  },
  "voice.toggleDeafen": {
    bindings: [{ commandOrControl: true, key: "d", shift: true }],
    category: "voice",
    handler: "DesktopExperience",
    labelKey: "shortcuts.app.toggleDeafen",
    scope: "app",
    typingTarget: "ignore",
  },
  "overlay.hide": {
    bindings: [{ commandOrControl: true, key: "o", shift: true }],
    category: "voice",
    handler: "DesktopExperience",
    labelKey: "shortcuts.app.hideOverlay",
    scope: "app",
    typingTarget: "ignore",
  },
  "navigation.back": {
    bindings: [
      { alt: true, key: "ArrowLeft" },
      { key: "[", meta: true, platform: "macos" },
    ],
    category: "navigation",
    handler: "DesktopExperience",
    labelKey: "shortcuts.app.back",
    scope: "app",
    typingTarget: "ignore",
  },
  "mentions.next": {
    bindings: [
      { allowShift: true, key: "j" },
      { allowShift: true, key: "ArrowDown" },
    ],
    category: "mentions",
    handler: "resolveMentionShortcut",
    labelKey: "shortcuts.app.nextMention",
    scope: "context",
    typingTarget: "ignore",
  },
  "mentions.previous": {
    bindings: [
      { allowShift: true, key: "k" },
      { allowShift: true, key: "ArrowUp" },
    ],
    category: "mentions",
    handler: "resolveMentionShortcut",
    labelKey: "shortcuts.app.previousMention",
    scope: "context",
    typingTarget: "ignore",
  },
  "mentions.reply": {
    bindings: [{ allowShift: true, key: "r" }],
    category: "mentions",
    handler: "resolveMentionShortcut",
    labelKey: "shortcuts.app.replyToMention",
    scope: "context",
    typingTarget: "ignore",
  },
  "mentions.toggleRead": {
    bindings: [{ allowShift: true, key: "e" }],
    category: "mentions",
    handler: "resolveMentionShortcut",
    labelKey: "shortcuts.app.toggleMentionRead",
    scope: "context",
    typingTarget: "ignore",
  },
  "mentions.close": {
    bindings: [{ allowShift: true, key: "Escape" }],
    category: "mentions",
    handler: "resolveMentionShortcut",
    labelKey: "shortcuts.app.closeMentionContext",
    scope: "context",
    typingTarget: "ignore",
  },
  "composer.bold": {
    bindings: [{ allowShift: true, commandOrControl: true, key: "b" }],
    category: "composer",
    handler: "MessageInput",
    labelKey: "shortcuts.app.bold",
    scope: "context",
    typingTarget: "allow",
  },
  "composer.italic": {
    bindings: [{ allowShift: true, commandOrControl: true, key: "i" }],
    category: "composer",
    handler: "MessageInput",
    labelKey: "shortcuts.app.italic",
    scope: "context",
    typingTarget: "allow",
  },
  "composer.underline": {
    bindings: [{ allowShift: true, commandOrControl: true, key: "u" }],
    category: "composer",
    handler: "MessageInput",
    labelKey: "shortcuts.app.underline",
    scope: "context",
    typingTarget: "allow",
  },
  "chat.search": {
    bindings: [{ commandOrControl: true, key: "f" }],
    category: "navigation",
    handler: "ChatArea",
    labelKey: "shortcuts.app.searchConversation",
    scope: "context",
    typingTarget: "ignore",
  },
  "shortcuts.help": {
    bindings: [{ allowShift: true, commandOrControl: true, key: "/" }],
    category: "navigation",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.help",
    scope: "app",
    typingTarget: "ignore",
  },
  "navigation.next": {
    bindings: [{ alt: true, key: "ArrowDown" }],
    category: "navigation",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.nextConversation",
    scope: "app",
    typingTarget: "ignore",
  },
  "navigation.previous": {
    bindings: [{ alt: true, key: "ArrowUp" }],
    category: "navigation",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.previousConversation",
    scope: "app",
    typingTarget: "ignore",
  },
  "navigation.nextUnread": {
    bindings: [{ alt: true, key: "ArrowDown", shift: true }],
    category: "navigation",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.nextUnread",
    scope: "app",
    typingTarget: "ignore",
  },
  "navigation.previousUnread": {
    bindings: [{ alt: true, key: "ArrowUp", shift: true }],
    category: "navigation",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.previousUnread",
    scope: "app",
    typingTarget: "ignore",
  },
  "navigation.nextRegion": {
    bindings: [{ key: "F6" }],
    category: "accessibility",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.nextRegion",
    scope: "app",
    typingTarget: "allow",
  },
  "navigation.previousRegion": {
    bindings: [{ key: "F6", shift: true }],
    category: "accessibility",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.previousRegion",
    scope: "app",
    typingTarget: "allow",
  },
  "message.reply": {
    bindings: [{ key: "r" }],
    category: "message",
    handler: "MessageItem",
    labelKey: "shortcuts.app.replyToMessage",
    scope: "context",
    typingTarget: "ignore",
  },
  "message.editLast": {
    bindings: [{ key: "ArrowUp" }],
    category: "message",
    handler: "MessageInput",
    labelKey: "shortcuts.app.editLastMessage",
    scope: "context",
    typingTarget: "allow",
  },
  "message.addReaction": {
    bindings: [{ allowShift: true, key: "+" }],
    category: "message",
    handler: "MessageItem",
    labelKey: "shortcuts.app.addReaction",
    scope: "context",
    typingTarget: "ignore",
  },
  "context.close": {
    bindings: [{ key: "Escape" }],
    category: "accessibility",
    handler: "ContextualOverlay",
    labelKey: "shortcuts.app.closeContext",
    scope: "context",
    typingTarget: "allow",
  },
  "voice.leave": {
    bindings: [{ commandOrControl: true, key: "h", shift: true }],
    category: "voice",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.leaveVoice",
    scope: "app",
    typingTarget: "ignore",
  },
  "voice.toggleCamera": {
    bindings: [{ commandOrControl: true, key: "v", shift: true }],
    category: "voice",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.toggleCamera",
    scope: "app",
    typingTarget: "ignore",
  },
  "voice.toggleScreenShare": {
    bindings: [{ commandOrControl: true, key: "s", shift: true }],
    category: "voice",
    handler: "AppShortcutController",
    labelKey: "shortcuts.app.toggleScreenShare",
    scope: "app",
    typingTarget: "ignore",
  },
} as const satisfies Readonly<Record<AppShortcutId, AppShortcutDefinition>>;

export type AppShortcutEvent = {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly key: string;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly target?: unknown;
};

type MatchOptions = {
  readonly allowInTypingTarget?: boolean;
  readonly platform?: AppShortcutPlatform;
};

const TYPING_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

export function isAppShortcutTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;

  const element = target as { readonly isContentEditable?: boolean; readonly tagName?: string };
  return (
    element.isContentEditable === true ||
    (typeof element.tagName === "string" && TYPING_TAGS.has(element.tagName.toUpperCase()))
  );
}

function matchesBinding(
  binding: AppShortcutBinding,
  event: AppShortcutEvent,
  platform?: AppShortcutPlatform,
): boolean {
  if (binding.platform && platform && binding.platform !== platform) return false;
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;

  const commandOrControl = event.ctrlKey === true || event.metaKey === true;
  if (binding.commandOrControl ? !commandOrControl : commandOrControl && binding.meta !== true) {
    return false;
  }
  if (binding.meta === true && (event.metaKey !== true || event.ctrlKey === true)) return false;
  if ((event.altKey === true) !== (binding.alt === true)) return false;
  if (!binding.allowShift && (event.shiftKey === true) !== (binding.shift === true)) return false;

  return true;
}

export function matchesAppShortcut(
  id: AppShortcutId,
  event: AppShortcutEvent,
  options: MatchOptions = {},
): boolean {
  // Synthetic keydown events (for example from browser integrations) may not
  // carry KeyboardEvent.key despite the listener's static TypeScript type.
  if (typeof event.key !== "string" || event.key.length === 0) return false;

  const shortcut = APP_SHORTCUT_CATALOG[id];

  if (
    shortcut.typingTarget === "ignore" &&
    !options.allowInTypingTarget &&
    isAppShortcutTypingTarget(event.target)
  ) {
    return false;
  }

  return shortcut.bindings.some((binding) => matchesBinding(binding, event, options.platform));
}

export function resolveAppShortcut<const TIds extends readonly AppShortcutId[]>(
  ids: TIds,
  event: AppShortcutEvent,
  options: MatchOptions = {},
): TIds[number] | null {
  return ids.find((id) => matchesAppShortcut(id, event, options)) ?? null;
}

function bindingAccelerator(binding: AppShortcutBinding): string {
  return [
    binding.commandOrControl ? "CmdOrCtrl" : null,
    binding.meta ? "Meta" : null,
    binding.alt ? "Alt" : null,
    binding.shift ? "Shift" : null,
    binding.key.length === 1 ? binding.key.toUpperCase() : binding.key,
  ]
    .filter(Boolean)
    .join("+");
}

export function getAppShortcutLabels(id: AppShortcutId, platform: AppShortcutPlatform): string[] {
  const shortcut: AppShortcutDefinition = APP_SHORTCUT_CATALOG[id];

  return shortcut.bindings
    .filter((binding) => !binding.platform || binding.platform === platform)
    .map((binding) => formatShortcut(bindingAccelerator(binding), platform));
}

export function getAppShortcutAccessibleLabels(
  id: AppShortcutId,
  platform: AppShortcutPlatform,
): string[] {
  const shortcut: AppShortcutDefinition = APP_SHORTCUT_CATALOG[id];
  return shortcut.bindings
    .filter((binding) => !binding.platform || binding.platform === platform)
    .map((binding) => readableShortcut(formatShortcutParts(bindingAccelerator(binding), platform)));
}

export function getAppShortcutAriaKeyShortcuts(
  id: AppShortcutId,
  platform: AppShortcutPlatform,
): string {
  const shortcut: AppShortcutDefinition = APP_SHORTCUT_CATALOG[id];
  return shortcut.bindings
    .filter((binding) => !binding.platform || binding.platform === platform)
    .flatMap((binding) => {
      const modifiers = binding.commandOrControl
        ? platform === "unknown"
          ? ["Control", "Meta"]
          : [platform === "macos" ? "Meta" : "Control"]
        : [binding.meta ? "Meta" : ""];
      return modifiers.map((modifier) =>
        [
          modifier,
          binding.alt ? "Alt" : "",
          binding.shift ? "Shift" : "",
          binding.key === "+" ? "plus" : binding.key,
        ]
          .filter(Boolean)
          .join("+"),
      );
    })
    .join(" ");
}
