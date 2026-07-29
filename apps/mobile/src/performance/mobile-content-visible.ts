import { completeMobileNavigationSpan } from "./mobile-navigation-timing";
import { getMobileStartupPhaseTimeline, markMobileStartupPhase } from "./mobile-startup-phases";

export interface MobileContentVisibleInput {
  readonly closeWarmResume?: boolean;
  readonly completedAtMs?: number;
  readonly startupElapsedMs?: number;
}

/**
 * Records a frame that has reached the reader. A warm resume only ends here,
 * rather than at AppState `active`, because foregrounding alone is not content.
 */
export function signalMobileContentVisible({
  closeWarmResume,
  completedAtMs,
  startupElapsedMs,
}: MobileContentVisibleInput = {}): {
  readonly resumeDurationMs: number | null;
  readonly startupElapsedMs: number | null;
} {
  const resumeDurationMs = closeWarmResume
    ? completeMobileNavigationSpan("Resume", completedAtMs)
    : null;

  return {
    resumeDurationMs,
    startupElapsedMs:
      getMobileStartupPhaseTimeline()["auth-resolved"] === undefined
        ? null
        : markMobileStartupPhase("content-visible", startupElapsedMs),
  };
}
