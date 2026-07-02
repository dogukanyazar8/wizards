export const MOBILE_REALTIME_SERVER_EVENTS = [
  "message:new",
  "message:updated",
  "message:deleted",
  "message:removed",
  "message:history_cleared",
  "message:reaction_updated",
  "server:unread:update",
  "server:membership:added",
  "server:membership:removed",
  "server:settings:updated",
  "dm:message:new",
  "dm:message:updated",
  "dm:message:deleted",
  "dm:message:removed",
  "dm:message:reaction_updated",
  "dm:typing:update",
  "dm:conversation:updated",
  "presence:update",
  "typing:update",
  "notification:new",
  "voice:state:update",
  "voice:screenshare:update",
  "voice:audio-level:update",
] as const;

export type MobileRealtimeServerEventName = (typeof MOBILE_REALTIME_SERVER_EVENTS)[number];

export type MobileRealtimeConnectionStatus =
  | "background"
  | "connected"
  | "connecting"
  | "disconnected"
  | "error"
  | "idle";

export type MobileRealtimeRefreshSource =
  | "bootstrap"
  | "channel"
  | "dm"
  | "notification"
  | "presence"
  | "workspace";

export type MobileRealtimeVisibility = "background" | "foreground";

export type MobileRealtimeEventEnvelope = {
  channelId: string | null;
  conversationId: string | null;
  eventName: MobileRealtimeServerEventName;
  payload: unknown | null;
  receivedAt: number;
  refreshSources: readonly MobileRealtimeRefreshSource[];
  serverId: string | null;
};

export type MobileRealtimeConnectionSnapshot = {
  connectedAt: number | null;
  disconnectedAt: number | null;
  eventCount: number;
  lastErrorCode: string | null;
  lastEvent: MobileRealtimeEventEnvelope | null;
  lastSeenAt: number | null;
  reconnectAttempt: number;
  status: MobileRealtimeConnectionStatus;
  visibility: MobileRealtimeVisibility;
};

export const MOBILE_REALTIME_RECONNECT_POLICY = Object.freeze({
  maxAttempts: 8,
  timeoutMs: 10_000,
  initialDelayMs: 750,
  maxDelayMs: 8_000,
});

const CHANNEL_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "message:new",
  "message:updated",
  "message:deleted",
  "message:removed",
  "message:history_cleared",
  "message:reaction_updated",
  "typing:update",
]);

const DM_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "dm:message:new",
  "dm:message:updated",
  "dm:message:deleted",
  "dm:message:removed",
  "dm:message:reaction_updated",
  "dm:typing:update",
]);

const WORKSPACE_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "server:membership:added",
  "server:membership:removed",
  "server:settings:updated",
  "voice:state:update",
  "voice:screenshare:update",
]);

const BOOTSTRAP_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "server:unread:update",
  "dm:conversation:updated",
  "presence:update",
  "notification:new",
]);

export function isMobileRealtimeServerEventName(
  value: string,
): value is MobileRealtimeServerEventName {
  return (MOBILE_REALTIME_SERVER_EVENTS as readonly string[]).includes(value);
}

function getStringProperty(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getMobileRealtimeRefreshSources(
  eventName: MobileRealtimeServerEventName,
): readonly MobileRealtimeRefreshSource[] {
  const sources = new Set<MobileRealtimeRefreshSource>();

  if (BOOTSTRAP_REFRESH_EVENTS.has(eventName)) {
    sources.add("bootstrap");
  }

  if (CHANNEL_REFRESH_EVENTS.has(eventName)) {
    sources.add("channel");
  }

  if (DM_REFRESH_EVENTS.has(eventName)) {
    sources.add("dm");
  }

  if (WORKSPACE_REFRESH_EVENTS.has(eventName)) {
    sources.add("workspace");
  }

  if (eventName === "presence:update") {
    sources.add("presence");
  }

  if (eventName === "notification:new") {
    sources.add("notification");
  }

  if (eventName === "voice:audio-level:update") {
    sources.add("workspace");
  }

  if (sources.size === 0) {
    sources.add("bootstrap");
  }

  return [...sources];
}

export function createMobileRealtimeEventEnvelope(
  eventName: MobileRealtimeServerEventName,
  payload: unknown,
  now = Date.now(),
): MobileRealtimeEventEnvelope {
  return {
    channelId: getStringProperty(payload, "channelId"),
    conversationId: getStringProperty(payload, "conversationId"),
    eventName,
    payload: eventName.startsWith("voice:") ? payload : null,
    receivedAt: now,
    refreshSources: getMobileRealtimeRefreshSources(eventName),
    serverId: getStringProperty(payload, "serverId"),
  };
}

export function validateMobileRealtimeContract(): string[] {
  const issues: string[] = [];
  const uniqueEvents = new Set(MOBILE_REALTIME_SERVER_EVENTS);

  if (uniqueEvents.size !== MOBILE_REALTIME_SERVER_EVENTS.length) {
    issues.push("Mobile realtime server events must be unique.");
  }

  for (const eventName of MOBILE_REALTIME_SERVER_EVENTS) {
    if (!eventName.includes(":") && eventName !== "notification:new") {
      issues.push(`Mobile realtime event ${eventName} should use the Whispr socket namespace.`);
    }

    const sources = getMobileRealtimeRefreshSources(eventName);
    if (sources.length === 0) {
      issues.push(`Mobile realtime event ${eventName} must map to at least one refresh source.`);
    }
  }

  if (MOBILE_REALTIME_RECONNECT_POLICY.timeoutMs < 5_000) {
    issues.push("Mobile realtime timeout must leave room for high-latency mobile networks.");
  }

  if (MOBILE_REALTIME_RECONNECT_POLICY.maxAttempts > 12) {
    issues.push("Mobile realtime reconnect attempts must remain bounded for battery safety.");
  }

  return issues;
}
