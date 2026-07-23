import type { AppStateStatus } from "react-native";

/**
 * Every AppState the OS can snapshot is covered. Android only reports `active`
 * and `background` (`AppStateModule.onHostResume` / `onHostPause`); `inactive`
 * is iOS-only and is what the app-switcher gesture, Control Centre and an
 * incoming call report before the snapshot is taken.
 */
export function shouldShowMobilePrivacyShield(status: AppStateStatus | null): boolean {
  return status !== null && status !== "active";
}

/**
 * Uncover duration. The shield is the last frame drawn before the surface
 * freezes, so it is exactly what the OS restores on resume — the fade is what
 * the user reads as "the app came back", and anything longer reads as a reload.
 */
export const MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS = 120;

export interface MobilePrivacyShieldTransition {
  readonly covered: boolean;
  /** Covering is never animated: the snapshot follows the event within a frame. */
  readonly durationMs: number;
}

export function planMobilePrivacyShieldTransition(
  status: AppStateStatus | null,
): MobilePrivacyShieldTransition {
  const covered = shouldShowMobilePrivacyShield(status);

  return { covered, durationMs: covered ? 0 : MOBILE_PRIVACY_SHIELD_UNCOVER_DURATION_MS };
}
