type MessageAppearance = {
  readonly messageSizePx: number;
  readonly messageDisplayCompact: boolean;
};

/** Shared by persisted shell preferences and the settings live preview. */
export function applyMessageAppearance(
  root: { readonly style: { setProperty(name: string, value: string): void } },
  preferences: MessageAppearance,
): void {
  const size = Number.isFinite(preferences.messageSizePx)
    ? Math.min(22, Math.max(12, preferences.messageSizePx))
    : 15;
  const compact = preferences.messageDisplayCompact;
  root.style.setProperty("--message-body-size", `${size / 16}rem`);
  root.style.setProperty("--message-body-line-height", compact ? "1.35" : "1.55");
  // `initial` activates the consumer's fallback, where the shell's density variable exists.
  root.style.setProperty("--message-compact-padding", compact ? "0.25rem" : "initial");
  root.style.setProperty("--message-avatar-size", compact ? "1.5rem" : "initial");
}
