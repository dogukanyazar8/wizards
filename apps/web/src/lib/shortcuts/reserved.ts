const COMMAND_MODIFIERS = new Set([
  "cmd",
  "cmdorctrl",
  "command",
  "commandorcontrol",
  "control",
  "ctrl",
  "meta",
  "super",
]);

export function isApplicationShortcutAccelerator(value: string): boolean {
  const parts = value.replace(/\s+/gu, "").toLowerCase().split("+");
  const key = parts.pop();
  if (!key) return false;

  const command = parts.some((part) => COMMAND_MODIFIERS.has(part));
  const alt = parts.includes("alt") || parts.includes("option");
  const shift = parts.includes("shift");
  const known = parts.every(
    (part) =>
      COMMAND_MODIFIERS.has(part) || part === "alt" || part === "option" || part === "shift",
  );
  if (!known) return false;

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
