function normalizeSpacing(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Keeps a surface's design spacing in gesture mode while respecting the larger
 * system-bar inset reported for three-button Android navigation.
 */
export function resolveMobileBottomSystemSpacing(
  systemInset: number,
  minimumSpacing: number,
): number {
  return Math.max(normalizeSpacing(systemInset), normalizeSpacing(minimumSpacing));
}
