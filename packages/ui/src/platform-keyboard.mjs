/** Presentation only. Never use these labels as native accelerator storage. */
export function normalizePlatform(value) {
  const platform = (value ?? "").toLowerCase();
  if (/^(windows|win32|win64|win)$/u.test(platform)) return "windows";
  if (/^(macos|mac os|mac os x|macintosh|macintel|darwin)$/u.test(platform)) return "macos";
  if (/^(chromeos|chrome os|cros)$/u.test(platform)) return "chromeos";
  if (/^(ios|iphone|ipad|ipod)$/u.test(platform)) return "ios";
  if (platform === "android") return "android";
  if (/^linux(?:\b|$)/u.test(platform)) return "linux";
  return "unknown";
}

export function detectPlatform(signals = {}) {
  const native = normalizePlatform(signals.nativePlatform);
  if (native !== "unknown") return native;
  const hints = normalizePlatform(signals.userAgentDataPlatform);
  if (hints === "macos" && (signals.maxTouchPoints ?? 0) > 1) return "ios";
  if (hints !== "unknown") return hints;
  const ua = signals.userAgent ?? "";
  // Mobile browsers can expose desktop platform strings; inspect these first.
  if (/iPad|iPhone|iPod/iu.test(ua)) return "ios";
  if (/Android/iu.test(ua)) return "android";
  if (/CrOS/iu.test(ua)) return "chromeos";
  const platform = normalizePlatform(signals.platform);
  if (
    (platform === "macos" || /Macintosh|Mac OS X/iu.test(ua)) &&
    (signals.maxTouchPoints ?? 0) > 1
  )
    return "ios";
  if (platform !== "unknown") return platform;
  if (/Windows NT/iu.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/iu.test(ua)) return "macos";
  if (/Linux/iu.test(ua)) return "linux";
  return "unknown";
}

export function keyboardPlatform(platform) {
  const normalized = normalizePlatform(platform);
  if (normalized === "ios") return "macos";
  if (normalized === "chromeos" || normalized === "android") return "linux";
  return normalized;
}

const ALIASES = {
  alt: "alt",
  option: "alt",
  control: "control",
  ctrl: "control",
  cmd: "meta",
  command: "meta",
  meta: "meta",
  super: "meta",
  win: "meta",
  cmdorctrl: "primary",
  commandorcontrol: "primary",
  shift: "shift",
};
const LABELS = {
  windows: { alt: "Alt", control: "Ctrl", meta: "Win", primary: "Ctrl", shift: "Shift" },
  macos: { alt: "⌥", control: "⌃", meta: "⌘", primary: "⌘", shift: "⇧" },
  linux: { alt: "Alt", control: "Ctrl", meta: "Super", primary: "Ctrl", shift: "Shift" },
  unknown: { alt: "Alt", control: "Ctrl", meta: "Meta", primary: "Ctrl/Cmd", shift: "Shift" },
};
const KEY_LABELS = { ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", Escape: "Esc" };
const READABLE_KEYS = {
  "⌥": "Option",
  "⌃": "Control",
  "⌘": "Command",
  "⇧": "Shift",
  "↓": "ArrowDown",
  "←": "ArrowLeft",
  "→": "ArrowRight",
  "↑": "ArrowUp",
};

export function formatShortcutParts(accelerator, platform = "unknown") {
  const labels = LABELS[keyboardPlatform(platform)];
  const parts = accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (accelerator.trimEnd().endsWith("+")) parts.push("+");
  return parts.map((part) => {
    const modifier = Object.hasOwn(ALIASES, part.toLowerCase())
      ? ALIASES[part.toLowerCase()]
      : null;
    return modifier ? labels[modifier] : Object.hasOwn(KEY_LABELS, part) ? KEY_LABELS[part] : part;
  });
}

export function formatShortcut(accelerator, platform = "unknown") {
  return formatShortcutParts(accelerator, platform).join(
    keyboardPlatform(platform) === "macos" ? "" : "+",
  );
}

export function readableShortcut(parts) {
  return parts
    .map((part) => (Object.hasOwn(READABLE_KEYS, part) ? READABLE_KEYS[part] : part))
    .join(" + ");
}
