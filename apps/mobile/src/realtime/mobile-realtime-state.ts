import type { MobileNetworkStatus } from "../network/mobile-network-contract";
import type {
  MobileRealtimeConnectionSnapshot,
  MobileRealtimeEventEnvelope,
  MobileRealtimeRefreshSource,
  MobileRealtimeVisibility,
} from "./mobile-realtime-contract";
import {
  MOBILE_REALTIME_RECONNECT_POLICY,
  isMobileRealtimeChannelMessagePayloadEvent,
  isMobileRealtimeDMMessagePayloadEvent,
} from "./mobile-realtime-contract";

export const MOBILE_REALTIME_FOREGROUND_BACKFILL_GAP_MS = 10_000;

export type MobileRealtimeActiveTargets = {
  channelId: string | null;
  conversationId: string | null;
  serverId: string | null;
  voiceChannelId: string | null;
};

export type MobileRealtimeAction =
  | { now?: number; type: "connect-started" }
  | { now?: number; type: "connected" }
  | { code?: string | null; now?: number; type: "connection-error" }
  | { now?: number; type: "disconnected" }
  | { event: MobileRealtimeEventEnvelope; type: "event-received" }
  | { now?: number; type: "reset" }
  | { now?: number; type: "reconnect-attempt" }
  | { now?: number; type: "visibility-changed"; visibility: MobileRealtimeVisibility };

export function createInitialMobileRealtimeSnapshot(): MobileRealtimeConnectionSnapshot {
  return {
    connectedAt: null,
    disconnectedAt: null,
    eventCount: 0,
    lastErrorCode: null,
    lastEvent: null,
    lastSeenAt: null,
    reconnectAttempt: 0,
    status: "idle",
    visibility: "foreground",
  };
}

export function redactMobileRealtimeEventForSnapshot(
  event: MobileRealtimeEventEnvelope,
): MobileRealtimeEventEnvelope {
  if (
    !isMobileRealtimeChannelMessagePayloadEvent(event.eventName) &&
    !isMobileRealtimeDMMessagePayloadEvent(event.eventName)
  ) {
    return event;
  }

  return {
    ...event,
    payload: null,
  };
}

export function mobileRealtimeReducer(
  state: MobileRealtimeConnectionSnapshot,
  action: MobileRealtimeAction,
): MobileRealtimeConnectionSnapshot {
  const now = "now" in action ? (action.now ?? Date.now()) : Date.now();

  switch (action.type) {
    case "connect-started":
      return {
        ...state,
        lastErrorCode: null,
        lastSeenAt: now,
        status: "connecting",
      };
    case "connected":
      return {
        ...state,
        connectedAt: now,
        disconnectedAt: null,
        lastErrorCode: null,
        lastSeenAt: now,
        reconnectAttempt: 0,
        status: "connected",
      };
    case "connection-error":
      return {
        ...state,
        disconnectedAt: now,
        lastErrorCode: action.code ?? "connection_error",
        lastSeenAt: now,
        status: "error",
      };
    case "disconnected":
      return {
        ...state,
        disconnectedAt: now,
        lastSeenAt: now,
        status: state.visibility === "background" ? "background" : "disconnected",
      };
    case "event-received":
      // Event-rate diagnostics do not belong to connection state. Returning a
      // new snapshot here used to publish every socket packet through the root
      // provider even when connection status and visibility were unchanged.
      return state;
    case "reconnect-attempt":
      return {
        ...state,
        lastSeenAt: now,
        reconnectAttempt: state.reconnectAttempt + 1,
      };
    case "visibility-changed":
      return {
        ...state,
        lastSeenAt: now,
        status:
          action.visibility === "background" && state.status !== "idle"
            ? "background"
            : state.status === "background"
              ? "disconnected"
              : state.status,
        visibility: action.visibility,
      };
    case "reset":
      return createInitialMobileRealtimeSnapshot();
    default:
      return state;
  }
}

export function shouldConnectMobileRealtime(input: {
  authStatus: string;
  hasSession: boolean;
  visibility: MobileRealtimeVisibility;
}) {
  return input.authStatus === "signed-in" && input.hasSession && input.visibility === "foreground";
}

export function getMobileRealtimeVisibilityFromAppState(
  appState: string,
  previousVisibility: MobileRealtimeVisibility = "foreground",
): MobileRealtimeVisibility {
  if (appState === "active") {
    return "foreground";
  }

  if (appState === "inactive") {
    return previousVisibility;
  }

  return "background";
}

export function getMobileRealtimeForegroundBackfillSources(input: {
  authStatus: string;
  minGapMs?: number;
  backgroundedAt?: number | null;
  nextVisibility: MobileRealtimeVisibility;
  now?: number;
  previousVisibility: MobileRealtimeVisibility;
  realtime: MobileRealtimeConnectionSnapshot;
  targets: MobileRealtimeActiveTargets;
}): readonly MobileRealtimeRefreshSource[] {
  if (
    input.authStatus !== "signed-in" ||
    input.previousVisibility !== "background" ||
    input.nextVisibility !== "foreground"
  ) {
    return [];
  }

  const now = input.now ?? Date.now();
  const lastSeenAt = input.backgroundedAt ?? input.realtime.lastSeenAt;
  const minGapMs = input.minGapMs ?? MOBILE_REALTIME_FOREGROUND_BACKFILL_GAP_MS;

  if (lastSeenAt !== null && now - lastSeenAt < minGapMs) {
    return [];
  }

  // "notification" belongs in every backfill: the socket is torn down in the
  // background, so anything that arrived while the app was away exists only as a
  // push and the feed would otherwise sit stale until its own staleTime expired.
  const sources: MobileRealtimeRefreshSource[] = ["notification"];

  if (input.targets.conversationId) {
    sources.push("dm");
  }

  if (input.targets.serverId) {
    sources.push("workspace");
  }

  if (input.targets.channelId) {
    sources.push("channel");
  }

  return sources;
}

/**
 * Socket errors the retry loop cannot fix. The server rejects the handshake with
 * `new Error("Unauthorized")` (and "Missing AUTH_SECRET"), and the client raises
 * "missing_token" itself, so retrying only burns the budget silently.
 */
const MOBILE_REALTIME_FATAL_ERROR_CODES = ["unauthorized", "missing_token", "missing auth_secret"];

export type MobileRealtimeBannerState = "failed" | "hidden" | "reconnecting";

function isFatalMobileRealtimeErrorCode(code: string | null): boolean {
  if (code === null) {
    return false;
  }

  const normalized = code.toLowerCase();
  return MOBILE_REALTIME_FATAL_ERROR_CODES.some((fatal) => normalized.includes(fatal));
}

/**
 * Whether the live connection is worth a word on screen.
 *
 * The socket dropping is only news when the user can still act on the stale
 * feed: signed in, foreground, and with a network the OS believes works. The
 * first connect stays silent because the startup and bootstrap notices already
 * own that moment — this banner exists for the case where the app looks healthy
 * but new messages have stopped arriving.
 */
export function getMobileRealtimeBannerState(input: {
  authStatus: string;
  networkStatus: MobileNetworkStatus;
  realtime: MobileRealtimeConnectionSnapshot;
}): MobileRealtimeBannerState {
  if (input.authStatus !== "signed-in") {
    return "hidden";
  }

  // Offline has its own banner. Two bars saying the same outage is noise.
  if (input.networkStatus === "offline" || input.realtime.visibility === "background") {
    return "hidden";
  }

  switch (input.realtime.status) {
    case "connecting":
      return input.realtime.connectedAt === null ? "hidden" : "reconnecting";
    case "disconnected":
      return "reconnecting";
    case "error":
      return isFatalMobileRealtimeErrorCode(input.realtime.lastErrorCode) ||
        input.realtime.reconnectAttempt >= MOBILE_REALTIME_RECONNECT_POLICY.maxAttempts
        ? "failed"
        : "reconnecting";
    default:
      return "hidden";
  }
}

/**
 * Whether a connect attempt should be forced right now.
 *
 * socket.io stops retrying after `maxAttempts`, and a handshake rejected during
 * an outage lands there fast — which used to leave the app permanently deaf with
 * only a banner button to save it. The OS reporting a working network again is
 * new information the socket's own backoff never sees, so it is worth one fresh
 * attempt. "unknown" is not enough: that is the state the OS reports when it has
 * not decided yet, and connecting into it just burns the budget again.
 */
export function shouldForceMobileRealtimeReconnect(input: {
  networkStatus: MobileNetworkStatus;
  realtime: MobileRealtimeConnectionSnapshot;
}): boolean {
  if (input.networkStatus !== "online") {
    return false;
  }

  return input.realtime.status === "disconnected" || input.realtime.status === "error";
}

export function summarizeMobileRealtimeConnection(state: MobileRealtimeConnectionSnapshot) {
  return {
    eventCount: state.eventCount,
    hasRecentEvent: state.lastEvent !== null,
    lastErrorCode: state.lastErrorCode,
    reconnectAttempt: state.reconnectAttempt,
    status: state.status,
    visibility: state.visibility,
  };
}
