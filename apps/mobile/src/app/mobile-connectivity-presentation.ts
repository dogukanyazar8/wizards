import type { MobileNetworkStatus } from "../network/mobile-network-contract";
import type { MobileRealtimeConnectionSnapshot } from "../realtime/mobile-realtime-contract";
import { getMobileRealtimeBannerState } from "../realtime/mobile-realtime-state";

/**
 * Connectivity is one story told by two sources — the OS network state and the
 * socket — so it gets one bar and one state machine.
 *
 * Two separate banners raced each other on the airplane-mode-off path: the
 * offline bar left, the realtime bar arrived, and every socket retry flipped it
 * again. What the user saw was flicker. The fix is not more copy but timing:
 * nothing appears until the bad state has *lasted*, and once it appears it stays
 * long enough to be read, then closes itself with a confirmation.
 */
export type MobileConnectivityHealth = "degraded" | "healthy" | "irrelevant" | "offline";

export type MobileConnectivityPhase = "hidden" | "offline" | "reconnecting" | "restored";

export interface MobileConnectivityPresentation {
  /** ms until this phase must be re-planned, or null when it is stable. */
  readonly nextCheckInMs: number | null;
  readonly phase: MobileConnectivityPhase;
  readonly since: number;
}

/**
 * The user flipped airplane mode themselves, so the confirmation can be quick —
 * but not instant, or a cell handover blinks the bar.
 */
export const MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS = 400;

/**
 * A reconnect nobody asked for stays silent this long. socket.io's first retry
 * lands well inside the window on a healthy network, so the common case shows
 * nothing at all.
 */
export const MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS = 2_000;

/** Long enough to read "back online", short enough not to linger. */
export const MOBILE_CONNECTIVITY_RESTORED_HOLD_MS = 1_600;

export function getMobileConnectivityHealth(input: {
  authStatus: string;
  networkStatus: MobileNetworkStatus;
  realtime: MobileRealtimeConnectionSnapshot;
}): MobileConnectivityHealth {
  // Background first: the socket is torn down deliberately there, and a bar the
  // user cannot see must not survive into the resume frame.
  if (input.realtime.visibility === "background") {
    return "irrelevant";
  }

  // Checked before auth so the auth screens explain a dead network too.
  if (input.networkStatus === "offline") {
    return "offline";
  }

  if (input.authStatus !== "signed-in") {
    return "healthy";
  }

  return getMobileRealtimeBannerState({
    authStatus: input.authStatus,
    networkStatus: input.networkStatus,
    realtime: input.realtime,
  }) === "hidden"
    ? "healthy"
    : "degraded";
}

export function createInitialMobileConnectivityPresentation(
  now = Date.now(),
): MobileConnectivityPresentation {
  return { nextCheckInMs: null, phase: "hidden", since: now };
}

/**
 * Returns the *same object* whenever nothing actionable changed, so a caller can
 * re-plan on every render without churning state. A shrinking `nextCheckInMs` is
 * deliberately not a change: the wait was already scheduled when the phase was
 * entered, and re-reporting the remainder would re-arm the timer forever.
 */
function enter(
  phase: MobileConnectivityPhase,
  now: number,
  previous: MobileConnectivityPresentation,
  nextCheckInMs: number | null = null,
): MobileConnectivityPresentation {
  if (previous.phase === phase && (previous.nextCheckInMs === null) === (nextCheckInMs === null)) {
    return previous;
  }

  return {
    nextCheckInMs,
    phase,
    since: previous.phase === phase ? previous.since : now,
  };
}

function isVisible(phase: MobileConnectivityPhase): boolean {
  return phase !== "hidden";
}

export function planMobileConnectivityPresentation(input: {
  health: MobileConnectivityHealth;
  /** When the current health verdict was first observed. */
  healthSince: number;
  now: number;
  previous: MobileConnectivityPresentation;
}): MobileConnectivityPresentation {
  const { health, healthSince, now, previous } = input;

  switch (health) {
    case "irrelevant":
      return enter("hidden", now, previous);

    case "offline": {
      // A bar that is already up only changes its words — that is not a flash.
      if (isVisible(previous.phase)) {
        return enter("offline", now, previous);
      }

      const waited = now - healthSince;
      return waited >= MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS
        ? enter("offline", now, previous)
        : enter("hidden", now, previous, MOBILE_CONNECTIVITY_OFFLINE_GRACE_MS - waited);
    }

    case "degraded": {
      if (isVisible(previous.phase)) {
        return enter("reconnecting", now, previous);
      }

      const waited = now - healthSince;
      return waited >= MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS
        ? enter("reconnecting", now, previous)
        : enter("hidden", now, previous, MOBILE_CONNECTIVITY_RECONNECT_GRACE_MS - waited);
    }

    default: {
      if (previous.phase === "offline" || previous.phase === "reconnecting") {
        return enter("restored", now, previous, MOBILE_CONNECTIVITY_RESTORED_HOLD_MS);
      }

      if (previous.phase === "restored") {
        const held = now - previous.since;
        return held >= MOBILE_CONNECTIVITY_RESTORED_HOLD_MS
          ? enter("hidden", now, previous)
          : enter("restored", now, previous, MOBILE_CONNECTIVITY_RESTORED_HOLD_MS - held);
      }

      return enter("hidden", now, previous);
    }
  }
}
