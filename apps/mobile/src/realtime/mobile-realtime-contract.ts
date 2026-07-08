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
  "voice:invite:accepted",
  "voice:invite:error",
  "voice:invite:received",
  "voice:invite:sent",
  "voice:invite:status",
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

export const MOBILE_REALTIME_REFRESH_DEBOUNCE_MS = 350;

export const MOBILE_REALTIME_REFRESH_TIMER_SOURCES = [
  "bootstrap",
  "channel",
  "dm",
  "workspace",
] as const;

export type MobileRealtimeRefreshTimerSource =
  (typeof MOBILE_REALTIME_REFRESH_TIMER_SOURCES)[number];

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
]);

const DM_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "dm:message:new",
  "dm:message:updated",
  "dm:message:deleted",
  "dm:message:removed",
  "dm:message:reaction_updated",
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
  if (
    eventName === "voice:audio-level:update" ||
    eventName === "voice:invite:accepted" ||
    eventName === "voice:invite:error" ||
    eventName === "voice:invite:received" ||
    eventName === "voice:invite:sent" ||
    eventName === "voice:invite:status" ||
    eventName === "typing:update" ||
    eventName === "dm:typing:update"
  ) {
    return [];
  }

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

  if (sources.size === 0) {
    sources.add("bootstrap");
  }

  return [...sources];
}

export function getMobileRealtimeRefreshTimerSource(
  source: MobileRealtimeRefreshSource,
): MobileRealtimeRefreshTimerSource {
  if (source === "presence" || source === "notification") {
    return "bootstrap";
  }

  return source;
}

export function isMobileRealtimeChannelMessagePayloadEvent(
  eventName: MobileRealtimeServerEventName,
): boolean {
  return CHANNEL_REFRESH_EVENTS.has(eventName);
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
    payload:
      eventName.startsWith("voice:") ||
      isMobileRealtimeChannelMessagePayloadEvent(eventName) ||
      eventName === "typing:update" ||
      eventName === "dm:typing:update"
        ? payload
        : null,
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
    const isLocalOnlyEvent =
      eventName === "voice:audio-level:update" ||
      eventName === "voice:invite:accepted" ||
      eventName === "voice:invite:error" ||
      eventName === "voice:invite:received" ||
      eventName === "voice:invite:sent" ||
      eventName === "voice:invite:status" ||
      eventName === "typing:update" ||
      eventName === "dm:typing:update";

    if (sources.length === 0 && !isLocalOnlyEvent) {
      issues.push(`Mobile realtime event ${eventName} must map to at least one refresh source.`);
    }
  }

  if (MOBILE_REALTIME_RECONNECT_POLICY.timeoutMs < 5_000) {
    issues.push("Mobile realtime timeout must leave room for high-latency mobile networks.");
  }

  if (MOBILE_REALTIME_RECONNECT_POLICY.maxAttempts > 12) {
    issues.push("Mobile realtime reconnect attempts must remain bounded for battery safety.");
  }

  const uniqueTimerSources = new Set(MOBILE_REALTIME_REFRESH_TIMER_SOURCES);
  if (uniqueTimerSources.size !== MOBILE_REALTIME_REFRESH_TIMER_SOURCES.length) {
    issues.push("Mobile realtime refresh timer sources must be unique.");
  }

  if (MOBILE_REALTIME_REFRESH_TIMER_SOURCES.length > 4) {
    issues.push("Mobile realtime refresh timer sources must remain bounded.");
  }

  if (
    MOBILE_REALTIME_REFRESH_DEBOUNCE_MS < 250 ||
    MOBILE_REALTIME_REFRESH_DEBOUNCE_MS > 1_000
  ) {
    issues.push("Mobile realtime refresh debounce must stay within mobile-safe bounds.");
  }

  return issues;
}
