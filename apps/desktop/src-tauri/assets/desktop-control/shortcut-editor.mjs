export const DEFAULT_DESKTOP_SHORTCUTS = Object.freeze({
  hideGameOverlay: "Alt+H",
  pushToTalk: "Alt+V",
  toggleAdminConsole: "Alt+Shift+K",
  toggleDeafen: "Alt+D",
  toggleMute: "Alt+M",
});

const RESERVED_ACCELERATORS = new Set([
  "alt+escape",
  "alt+f4",
  "alt+space",
  "alt+tab",
  "cmdorctrl+space",
  "control+space",
  "ctrl+alt+delete",
  "ctrl+space",
  "meta+space",
  "super+space",
]);
const MODIFIERS = new Set([
  "alt",
  "cmd",
  "cmdorctrl",
  "command",
  "commandorcontrol",
  "control",
  "ctrl",
  "meta",
  "option",
  "shift",
  "super",
]);
const CAPTURE_MODIFIERS = new Set(["Alt", "Control", "Meta", "Shift"]);

function normalizeAccelerator(value) {
  return value.replace(/\s+/gu, "").toLowerCase();
}

function isApplicationShortcutAccelerator(value) {
  const parts = normalizeAccelerator(value).split("+");
  const key = parts.pop();
  const commandModifiers = new Set([
    "cmd",
    "cmdorctrl",
    "command",
    "commandorcontrol",
    "control",
    "ctrl",
    "meta",
    "super",
  ]);
  const command = parts.some((part) => commandModifiers.has(part));
  const alt = parts.includes("alt") || parts.includes("option");
  const shift = parts.includes("shift");
  const known = parts.every(
    (part) => commandModifiers.has(part) || part === "alt" || part === "option" || part === "shift",
  );
  if (!key || !known) return false;

  if (command && !alt && !shift && [",", "/", "b", "f", "i", "k", "u"].includes(key)) {
    return true;
  }
  if (command && !alt && shift && ["b", "d", "h", "i", "m", "o", "s", "u", "v"].includes(key)) {
    return true;
  }
  if (!command && alt && !shift && ["arrowdown", "arrowleft", "arrowup"].includes(key)) {
    return true;
  }
  if (!command && alt && shift && ["arrowdown", "arrowup"].includes(key)) return true;

  return !command && !alt && shift && key === "f6";
}

function isReservedAccelerator(value) {
  const normalized = normalizeAccelerator(value);
  return (
    RESERVED_ACCELERATORS.has(normalized) ||
    normalized.endsWith("+space") ||
    isApplicationShortcutAccelerator(normalized)
  );
}

function isValidAccelerator(value) {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 64 ||
    /[\0\r\n]/u.test(trimmed) ||
    isReservedAccelerator(trimmed)
  ) {
    return false;
  }

  const parts = trimmed.split("+").map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) return false;
  if (parts.length === 1) return /^F(?:1[3-9]|2[0-4])$/u.test(parts[0]);
  return parts.slice(0, -1).every((part) => MODIFIERS.has(part.toLowerCase()));
}

export function validateDesktopShortcutAssignments(assignments) {
  const errors = {};
  const actionsByAccelerator = new Map();

  for (const [action, rawValue] of Object.entries(assignments)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) continue;
    if (isReservedAccelerator(value)) {
      errors[action] = "reserved";
      continue;
    }
    if (!isValidAccelerator(value)) {
      errors[action] = "invalid";
      continue;
    }

    const normalized = normalizeAccelerator(value);
    const actions = actionsByAccelerator.get(normalized) ?? [];
    actions.push(action);
    actionsByAccelerator.set(normalized, actions);
  }

  for (const actions of actionsByAccelerator.values()) {
    if (actions.length < 2) continue;
    for (const action of actions) errors[action] = "duplicate";
  }

  return errors;
}

function toAcceleratorKey(code, key) {
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/u.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/u.test(code)) return code;
  if (code === "Space") return "Space";
  return key.length === 1 ? key.toUpperCase() : null;
}

export function captureDesktopShortcut(event) {
  if (event.key === "Escape") return { kind: "cancel" };
  if (event.key === "Backspace" || event.key === "Delete") return { kind: "clear" };
  if (CAPTURE_MODIFIERS.has(event.key)) return { kind: "pending" };

  const key = toAcceleratorKey(event.code, event.key);
  if (!key) return { kind: "pending" };

  const parts = [];
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  parts.push(key);

  return { accelerator: parts.join("+"), kind: "captured" };
}
