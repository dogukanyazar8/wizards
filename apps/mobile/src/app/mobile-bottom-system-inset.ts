function normalizeSpacing(value: number): number {
  "worklet";
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
  "worklet";
  return Math.max(normalizeSpacing(systemInset), normalizeSpacing(minimumSpacing));
}

/**
 * Extra spacing a surface that already paints its own design padding needs so the
 * three-button Android navigation bar cannot cover it. Adding this on top of the
 * design padding lands on the same total as
 * {@link resolveMobileBottomSystemSpacing}, which keeps gesture navigation — where
 * the reported inset stays under the design padding — pixel-identical.
 *
 * The IME is drawn over the navigation bar, and the app shell already lifts the
 * tree above the keyboard, so an open keyboard drops the top-up to zero instead of
 * stacking a second gap above the IME.
 */
export function resolveMobileBottomSystemTopUp(input: {
  readonly keyboardHeight: number;
  readonly minimumSpacing: number;
  readonly systemInset: number;
}): number {
  "worklet";
  if (normalizeSpacing(input.keyboardHeight) > 0) {
    return 0;
  }

  return Math.max(0, normalizeSpacing(input.systemInset) - normalizeSpacing(input.minimumSpacing));
}

/**
 * Distance a bottom-anchored surface has to travel to clear the keyboard. The
 * surface already pads itself past the system bar, and the IME covers that bar,
 * so only the difference is real movement.
 */
export function resolveMobileKeyboardLift(input: {
  readonly keyboardHeight: number;
  readonly systemInset: number;
}): number {
  "worklet";
  return Math.max(0, normalizeSpacing(input.keyboardHeight) - normalizeSpacing(input.systemInset));
}

/**
 * Bottom spacing for the surface that owns the screen's bottom edge while the
 * software keyboard can cover it. The IME is drawn over the Android navigation
 * bar in edge-to-edge mode, so the two insets never stack — the keyboard simply
 * takes over the bottom edge for as long as it is open.
 */
export function resolveMobileBottomKeyboardSpacing(input: {
  readonly keyboardHeight: number;
  readonly minimumSpacing: number;
  readonly systemInset: number;
}): number {
  "worklet";
  const keyboardHeight = normalizeSpacing(input.keyboardHeight);

  return keyboardHeight > 0
    ? Math.max(keyboardHeight, normalizeSpacing(input.minimumSpacing))
    : resolveMobileBottomSystemSpacing(input.systemInset, input.minimumSpacing);
}
