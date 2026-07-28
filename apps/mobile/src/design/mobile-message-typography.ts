/**
 * Message body typography (handoff PROMPT.md §3). The redesign gives the message
 * body its own four-step size preference, deliberately separate from the app's
 * five-step interface text scale (`MOBILE_FONT_SCALE_STEPS`): the interface
 * scale resizes every typography token, this one resizes nothing but the DM,
 * channel and thread message body.
 *
 * React Native has no CSS custom properties, so the handoff's `--msg-size`
 * variable is expressed here as one pure resolver plus the
 * `useMobileMessageBodyStyle()` hook in the theme provider. Both read the same
 * three preferences, so a size change lands in the same frame everywhere.
 */

export const MOBILE_MESSAGE_FONT_SIZES = ["small", "medium", "large", "xlarge"] as const;
export type MobileMessageFontSize = (typeof MOBILE_MESSAGE_FONT_SIZES)[number];
export const MOBILE_DEFAULT_MESSAGE_FONT_SIZE: MobileMessageFontSize = "medium";

/** §3.1 step table. */
const MOBILE_MESSAGE_FONT_SIZE_PX: Record<MobileMessageFontSize, number> = {
  small: 14,
  medium: 15,
  large: 16.5,
  xlarge: 18,
};

/** The two body surfaces the redesign scales; everything else stays fixed. */
export type MobileMessageSurface = "channel" | "dm";

/**
 * §3.1/§3.2 line-height multipliers. `xlarge` tightens by one notch because the
 * step is the largest jump in the table, and "compact" tightens both surfaces.
 */
const MOBILE_MESSAGE_LINE_HEIGHT: Record<
  MobileMessageSurface,
  { readonly compact: number; readonly default: number; readonly xlarge: number }
> = {
  channel: { compact: 1.36, default: 1.45, xlarge: 1.42 },
  dm: { compact: 1.34, default: 1.42, xlarge: 1.4 },
};

/** §0: the body carries `letter-spacing: -.005em`, which is em-relative. */
const MOBILE_MESSAGE_LETTER_SPACING_EM = -0.005;

/** §3.2: following the OS text size clamps the effective body size to 14–22px. */
export const MOBILE_MESSAGE_FONT_SIZE_MIN = 14;
export const MOBILE_MESSAGE_FONT_SIZE_MAX = 22;

export interface MobileMessageBodyStyle {
  readonly fontSize: number;
  readonly letterSpacing: number;
  readonly lineHeight: number;
}

export function normalizeMobileMessageFontSize(value: unknown): MobileMessageFontSize {
  return MOBILE_MESSAGE_FONT_SIZES.includes(value as MobileMessageFontSize)
    ? (value as MobileMessageFontSize)
    : MOBILE_DEFAULT_MESSAGE_FONT_SIZE;
}

export function getMobileMessageFontSizePx(size: MobileMessageFontSize): number {
  return MOBILE_MESSAGE_FONT_SIZE_PX[normalizeMobileMessageFontSize(size)];
}

export function clampMobileMessageFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return MOBILE_MESSAGE_FONT_SIZE_PX[MOBILE_DEFAULT_MESSAGE_FONT_SIZE];
  }

  return Math.min(MOBILE_MESSAGE_FONT_SIZE_MAX, Math.max(MOBILE_MESSAGE_FONT_SIZE_MIN, value));
}

/** Keeps derived px off the float-noise edge without rounding away the .5 steps. */
function toRenderablePx(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The single source for message body text. `fontScale` is the OS text scale and
 * is only ever passed as something other than 1 when "follow system text size"
 * is on — the interface scale never reaches this function (§3.2, decision K5).
 */
export function getMobileMessageBodyStyle({
  compact = false,
  fontScale = 1,
  size,
  surface,
}: {
  readonly compact?: boolean;
  readonly fontScale?: number;
  readonly size: MobileMessageFontSize;
  readonly surface: MobileMessageSurface;
}): MobileMessageBodyStyle {
  const step = normalizeMobileMessageFontSize(size);
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const fontSize = toRenderablePx(
    clampMobileMessageFontSize(MOBILE_MESSAGE_FONT_SIZE_PX[step] * scale),
  );
  const multipliers = MOBILE_MESSAGE_LINE_HEIGHT[surface];
  const multiplier = compact
    ? multipliers.compact
    : step === "xlarge"
      ? multipliers.xlarge
      : multipliers.default;

  return {
    fontSize,
    // RN takes letter spacing in px, so the em value is resolved against the
    // effective size instead of being frozen at the default step. It keeps a
    // third decimal: -.005em is already sub-pixel and 2dp would swallow it.
    letterSpacing: Math.round(fontSize * MOBILE_MESSAGE_LETTER_SPACING_EM * 1000) / 1000,
    // RN rejects unitless line heights; the multiplier is resolved here.
    lineHeight: toRenderablePx(fontSize * multiplier),
  };
}

/**
 * §3.2 "compact layout": the same preference that tightens line height also
 * tightens the surrounding block, so both come from one place.
 */
export function getMobileMessageSpacing(compact: boolean): {
  readonly bubblePaddingBottom: number;
  readonly bubblePaddingTop: number;
  readonly channelRowPaddingVertical: number;
  readonly groupGap: number;
} {
  return {
    bubblePaddingBottom: compact ? 6 : 8,
    bubblePaddingTop: compact ? 7 : 9,
    channelRowPaddingVertical: compact ? 4 : 6,
    groupGap: compact ? 6 : 10,
  };
}
