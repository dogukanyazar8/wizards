import type { AppStateStatus } from "react-native";

/**
 * How long the resume refetch wave waits behind the frame that brings the app
 * back. `focusManager.setFocused(true)` marks every stale query for refetch and
 * re-renders every screen holding one; run in the same tick as the AppState
 * event it lands in the same React commit as the privacy shield's removal, so
 * the restored blank frame stays on screen for that whole render. One uncover
 * animation later the content is already visible and the refetch costs nothing
 * the user can see. Data is never dropped by waiting — cached data keeps
 * rendering, this only moves when the background refresh starts.
 */
export const MOBILE_QUERY_RESUME_FOCUS_DELAY_MS = 160;

export interface MobileQueryFocusPlan {
  /** 0 means apply synchronously — losing focus must never be deferred. */
  readonly delayMs: number;
  readonly focused: boolean;
}

export function planMobileQueryFocus(status: AppStateStatus | null): MobileQueryFocusPlan {
  return status === "active"
    ? { delayMs: MOBILE_QUERY_RESUME_FOCUS_DELAY_MS, focused: true }
    : { delayMs: 0, focused: false };
}
