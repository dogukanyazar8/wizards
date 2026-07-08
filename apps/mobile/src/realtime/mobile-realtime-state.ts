import type {
  MobileRealtimeConnectionSnapshot,
  MobileRealtimeEventEnvelope,
  MobileRealtimeRefreshSource,
  MobileRealtimeVisibility,
} from "./mobile-realtime-contract";
import { isMobileRealtimeChannelMessagePayloadEvent } from "./mobile-realtime-contract";

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
  if (!isMobileRealtimeChannelMessagePayloadEvent(event.eventName)) {
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
      return {
        ...state,
        eventCount: state.eventCount + 1,
        lastEvent: redactMobileRealtimeEventForSnapshot(action.event),
        lastSeenAt: action.event.receivedAt,
      };
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
  return (
    input.authStatus === "signed-in" &&
    input.hasSession &&
    input.visibility === "foreground"
  );
}

export function getMobileRealtimeVisibilityFromAppState(
  appState: string,
): MobileRealtimeVisibility {
  return appState === "active" ? "foreground" : "background";
}

export function getMobileRealtimeForegroundBackfillSources(input: {
  authStatus: string;
  minGapMs?: number;
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
  const lastSeenAt = input.realtime.lastSeenAt;
  const minGapMs = input.minGapMs ?? MOBILE_REALTIME_FOREGROUND_BACKFILL_GAP_MS;

  if (lastSeenAt !== null && now - lastSeenAt < minGapMs) {
    return [];
  }

  const sources: MobileRealtimeRefreshSource[] = ["bootstrap"];

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

export function summarizeMobileRealtimeConnection(
  state: MobileRealtimeConnectionSnapshot,
) {
  return {
    eventCount: state.eventCount,
    hasRecentEvent: state.lastEvent !== null,
    lastErrorCode: state.lastErrorCode,
    reconnectAttempt: state.reconnectAttempt,
    status: state.status,
    visibility: state.visibility,
  };
}
