import { darkTheme, lightTheme, type MobileTheme } from "./themes";

export const MOBILE_ACCENT_PREFERENCE_KEY = "whispr.mobile.accent-preference";
export const MOBILE_FONT_SCALE_PREFERENCE_KEY = "whispr.mobile.font-scale-preference";
export const MOBILE_VOICE_APPEARANCE_PREFERENCE_KEY = "whispr.mobile.voice-appearance-preference";

/**
 * Messaging redesign (§3). These three drive the message body only; they are
 * deliberately independent of `MOBILE_FONT_SCALE_PREFERENCE_KEY`, which keeps
 * scaling the whole interface.
 */
export const MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY = "whispr.mobile.message-font-size";
export const MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY = "whispr.mobile.message-compact";
export const MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY =
  "whispr.mobile.message-follow-system-font";

/** Both message toggles ship off (§2 "1i"). */
export const MOBILE_DEFAULT_MESSAGE_COMPACT = false;
export const MOBILE_DEFAULT_MESSAGE_FOLLOW_SYSTEM_FONT = false;

export function normalizeMobileMessageBooleanPreference(
  value: unknown,
  fallback: boolean,
): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  return fallback;
}

/**
 * Voice-room canvas appearance, independent of the app theme. "system" follows
 * the resolved app theme; "dark" is the canonical #5g design; "light" is the
 * light-surface variant. Default follows the app theme.
 */
export const MOBILE_VOICE_APPEARANCE_OPTIONS = ["system", "dark", "light"] as const;
export type MobileVoiceRoomAppearance = (typeof MOBILE_VOICE_APPEARANCE_OPTIONS)[number];
export const MOBILE_DEFAULT_VOICE_APPEARANCE: MobileVoiceRoomAppearance = "system";

export function normalizeMobileVoiceRoomAppearance(value: unknown): MobileVoiceRoomAppearance {
  return MOBILE_VOICE_APPEARANCE_OPTIONS.includes(value as MobileVoiceRoomAppearance)
    ? (value as MobileVoiceRoomAppearance)
    : MOBILE_DEFAULT_VOICE_APPEARANCE;
}

/**
 * Resolves the base theme the voice room should render with, honouring the
 * dedicated voice appearance preference over the active app theme.
 */
export function resolveMobileVoiceRoomBaseTheme(
  appearance: MobileVoiceRoomAppearance,
  appTheme: MobileTheme,
): MobileTheme {
  if (appearance === "dark") {
    return darkTheme;
  }
  if (appearance === "light") {
    return lightTheme;
  }
  return appTheme.dark ? darkTheme : lightTheme;
}

/** Handoff 4c swatch row, left to right; indigo is the reference default. */
export const MOBILE_ACCENT_OPTIONS = [
  { color: "#4F46E5", id: "indigo" },
  { color: "#8B5CF6", id: "violet" },
  { color: "#3B82F6", id: "blue" },
  { color: "#22A366", id: "green" },
  { color: "#E0527E", id: "pink" },
  { color: "#C77A2B", id: "amber" },
] as const;

export type MobileAccentId = (typeof MOBILE_ACCENT_OPTIONS)[number]["id"];

export const MOBILE_FONT_SCALE_STEPS = [0.85, 0.925, 1, 1.075, 1.15] as const;
export type MobileFontScaleStep = 0 | 1 | 2 | 3 | 4;
export const MOBILE_DEFAULT_FONT_SCALE_STEP: MobileFontScaleStep = 2;
export const MOBILE_DEFAULT_ACCENT_ID: MobileAccentId = "indigo";

/** Handoff 4c positions the default 1x text scale at 45 percent of its track. */
const MOBILE_FONT_SCALE_SLIDER_PROGRESS = [0, 0.225, 0.45, 0.725, 1] as const;

export function getMobileFontScaleSliderProgress(step: MobileFontScaleStep): number {
  return MOBILE_FONT_SCALE_SLIDER_PROGRESS[step];
}

export function getMobileFontScaleStepForSliderProgress(progress: number): MobileFontScaleStep {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return MOBILE_FONT_SCALE_SLIDER_PROGRESS.reduce<MobileFontScaleStep>(
    (closestStep, candidateProgress, candidateStep) =>
      Math.abs(candidateProgress - clampedProgress) <
      Math.abs(MOBILE_FONT_SCALE_SLIDER_PROGRESS[closestStep] - clampedProgress)
        ? (candidateStep as MobileFontScaleStep)
        : closestStep,
    0,
  );
}

/** Accessible foreground tone per accent; dark themes read text on dark cards. */
const ACCENT_STRONG_LIGHT_TONES: Record<MobileAccentId, string> = {
  amber: "#A85F1B",
  blue: "#2563EB",
  green: "#1B8A55",
  indigo: "#3F38C9",
  pink: "#C2185B",
  violet: "#7C3AED",
};

export function normalizeMobileAccentId(value: unknown): MobileAccentId {
  return MOBILE_ACCENT_OPTIONS.some((option) => option.id === value)
    ? (value as MobileAccentId)
    : MOBILE_DEFAULT_ACCENT_ID;
}

export function normalizeMobileFontScaleStep(value: unknown): MobileFontScaleStep {
  const parsed = typeof value === "string" ? Number(value) : value;
  return parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4
    ? parsed
    : MOBILE_DEFAULT_FONT_SCALE_STEP;
}

export function getMobileAccentColor(id: MobileAccentId): string {
  const option = MOBILE_ACCENT_OPTIONS.find((candidate) => candidate.id === id);
  return option?.color ?? MOBILE_ACCENT_OPTIONS[0].color;
}

function mixHexColors(foreground: string, background: string, backgroundWeight: number): string {
  const parse = (hex: string): readonly [number, number, number] => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
  const [fr, fg, fb] = parse(foreground);
  const [br, bg, bb] = parse(background);
  const channel = (f: number, b: number) =>
    Math.round(f * (1 - backgroundWeight) + b * backgroundWeight)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(fr, br)}${channel(fg, bg)}${channel(fb, bb)}`.toUpperCase();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }

  return value;
}

type MutableTypography = {
  [K in keyof MobileTheme["typography"]]: MobileTheme["typography"][K] extends string
    ? string
    : {
        fontFamily: string;
        fontSize: number;
        letterSpacing: number;
        lineHeight: number;
      };
};

function scaleTypography(
  typography: MobileTheme["typography"],
  factor: number,
): MobileTheme["typography"] {
  const scaled = {} as MutableTypography;
  for (const [key, token] of Object.entries(typography)) {
    if (typeof token === "string") {
      (scaled as Record<string, unknown>)[key] = token;
      continue;
    }

    (scaled as Record<string, unknown>)[key] = {
      ...token,
      fontSize: token.fontSize * factor,
      lineHeight: token.lineHeight * factor,
    };
  }

  return scaled as MobileTheme["typography"];
}

function applyAccent(theme: MobileTheme, accentId: MobileAccentId): MobileTheme {
  const color = getMobileAccentColor(accentId);
  const strong = theme.dark ? color : ACCENT_STRONG_LIGHT_TONES[accentId];
  const soft = theme.dark
    ? mixHexColors(color, theme.surface.card, 0.85)
    : mixHexColors(color, "#FFFFFF", 0.93);
  const softBorder = theme.dark
    ? mixHexColors(color, theme.surface.card, 0.68)
    : mixHexColors(color, "#FFFFFF", 0.86);

  return {
    ...theme,
    accent: {
      ...theme.accent,
      action: color,
      default: color,
      soft,
      softBorder,
      strong,
    },
    border: {
      ...theme.border,
      focus: color,
    },
    elevation: {
      ...theme.elevation,
      primaryAction: {
        ...theme.elevation.primaryAction,
        shadowColor: color,
      },
    },
    gradients: {
      ...theme.gradients,
      primaryAction: [color, strong] as const,
    },
  };
}

const composedThemeCache = new Map<string, MobileTheme>();

/**
 * Composes the resolved base theme with the user's accent and text-size
 * preferences. The default pair returns the base object untouched so the
 * pixel-locked redesign goldens keep their reference identity.
 */
export function composeMobileTheme(
  base: MobileTheme,
  accentId: MobileAccentId,
  fontScaleStep: MobileFontScaleStep,
): MobileTheme {
  if (accentId === MOBILE_DEFAULT_ACCENT_ID && fontScaleStep === MOBILE_DEFAULT_FONT_SCALE_STEP) {
    return base;
  }

  const cacheKey = `${base.id}:${accentId}:${fontScaleStep}`;
  const cached = composedThemeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let composed = accentId === MOBILE_DEFAULT_ACCENT_ID ? base : applyAccent(base, accentId);
  const factor = MOBILE_FONT_SCALE_STEPS[fontScaleStep];
  if (factor !== 1) {
    composed = {
      ...composed,
      typography: scaleTypography(composed.typography, factor),
    };
  }

  const frozen = deepFreeze(composed === base ? { ...base } : composed);
  composedThemeCache.set(cacheKey, frozen);
  return frozen;
}
