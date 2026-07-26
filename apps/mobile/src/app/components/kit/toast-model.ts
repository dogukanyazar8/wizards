import type { MobileLineIconName } from "../../../design/mobile-line-icons";
import type {
  MobileTheme,
  MobileToastVariantId,
  MobileToastVariantPalette,
} from "../../../design/themes";

/**
 * Handoff 3a-3c. Every temporary message in the app is one of these six; there
 * is no second toast shape and no second trigger. The union is declared beside
 * the palettes it keys so a new variant cannot ship without its colours.
 */
export type MobileToastVariant = MobileToastVariantId;

/**
 * The tone vocabulary the pre-3b toast used. Kept only so the migration has a
 * single mapping table instead of a `danger`→`error` guess at each call site.
 */
export type ToastTone = "danger" | "info" | "success" | "warning";

export interface MobileToastActionInput {
  readonly label: string;
  readonly onPress: () => void;
}

export interface MobileToastInput {
  /** Renders in place of the ✕; a toast never shows both. */
  readonly action?: MobileToastActionInput;
  readonly duration?: number;
  readonly subtitle?: string;
  readonly title: string;
  readonly variant?: MobileToastVariant;
}

export interface MobileToastEntry {
  readonly action: MobileToastActionInput | null;
  /** `null` on loading: the card waits for its own resolution instead of a clock. */
  readonly duration: number | null;
  readonly id: string;
  /** Bumped when a card morphs in place so the countdown restarts without a remount. */
  readonly revision: number;
  readonly subtitle: string | null;
  readonly title: string;
  readonly variant: MobileToastVariant;
}

export interface MobileToastState {
  readonly entry: MobileToastEntry | null;
}

export type MobileToastStateAction =
  | { readonly id: string; readonly input: MobileToastInput; readonly type: "resolve" }
  | { readonly id: string; readonly input: MobileToastInput; readonly type: "show" }
  | { readonly id: string; readonly type: "dismiss" };

export const MOBILE_TOAST_DEFAULT_DURATION_MS = 3_000;
export const MOBILE_TOAST_ACTION_DURATION_MS = 6_000;
export const MOBILE_TOAST_MIN_DURATION_MS = 1_500;
export const MOBILE_TOAST_MAX_DURATION_MS = 10_000;

export const MOBILE_TOAST_TONE_VARIANTS: Readonly<Record<ToastTone, MobileToastVariant>> = {
  danger: "error",
  info: "info",
  success: "success",
  warning: "warning",
};

export const MOBILE_TOAST_VARIANT_ICONS: Readonly<Record<MobileToastVariant, MobileLineIconName>> =
  {
    action: "trash",
    error: "close",
    info: "info",
    loading: "loader-arc",
    success: "check",
    warning: "alert-triangle",
  };

/** Handoff 3b draws each glyph at its own weight inside the same 38px tile. */
export const MOBILE_TOAST_VARIANT_STROKE_WIDTHS: Readonly<Record<MobileToastVariant, number>> = {
  action: 2,
  error: 2.4,
  info: 2.2,
  loading: 2.4,
  success: 2.6,
  warning: 2.2,
};

/**
 * Three seconds is enough to read a confirmation; six is what an offered action
 * needs before it disappears out from under a thumb. A loading card has no
 * duration at all — an upload that takes twelve seconds must not lose its toast
 * at three.
 */
export function resolveMobileToastDuration(input: MobileToastInput): number | null {
  if ((input.variant ?? "info") === "loading") {
    return null;
  }

  const fallback = input.action
    ? MOBILE_TOAST_ACTION_DURATION_MS
    : MOBILE_TOAST_DEFAULT_DURATION_MS;

  if (input.duration === undefined || !Number.isFinite(input.duration)) {
    return fallback;
  }

  return Math.min(
    MOBILE_TOAST_MAX_DURATION_MS,
    Math.max(MOBILE_TOAST_MIN_DURATION_MS, Math.round(input.duration)),
  );
}

export function getMobileToastVariantPalette(
  theme: MobileTheme,
  variant: MobileToastVariant,
): MobileToastVariantPalette {
  return theme.toast.variants[variant];
}

export function createMobileToastState(): MobileToastState {
  return { entry: null };
}

function createEntry(id: string, input: MobileToastInput, revision: number): MobileToastEntry {
  const subtitle = input.subtitle?.trim();

  return {
    action: input.action ?? null,
    duration: resolveMobileToastDuration(input),
    id,
    revision,
    subtitle: subtitle ? subtitle : null,
    title: input.title,
    variant: input.variant ?? "info",
  };
}

export function mobileToastReducer(
  state: MobileToastState,
  action: MobileToastStateAction,
): MobileToastState {
  switch (action.type) {
    // No queue. A second confirmation while the first is still on screen means
    // the first is stale; stacking them would bury the newest message.
    case "show":
      return { entry: createEntry(action.id, action.input, 0) };
    case "resolve": {
      const current = state.entry;
      // A resolution lands only on the card it was started from. Once the user
      // moved on and something else replaced it, a finished upload must not
      // reopen a toast for a screen that is no longer there.
      if (!current || current.id !== action.id) {
        return state;
      }

      return { entry: createEntry(action.id, action.input, current.revision + 1) };
    }
    default:
      return state.entry && state.entry.id === action.id ? { entry: null } : state;
  }
}
