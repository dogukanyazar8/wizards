export const MOBILE_REALTIME_SERVER_EVENTS = [
  "message:new",
  "message:updated",
  "message:deleted",
  "message:removed",
  "message:history_cleared",
  "message:reaction_updated",
  "channel:messages:stale",
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
  "dm:conversation:read",
  "dm:call:incoming",
  "dm:call:accepted",
  "dm:call:declined",
  "dm:call:cancelled",
  "dm:call:ended",
  "friends:updated",
  "presence:update",
  "user:profile:updated",
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
  "presence",
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
  "dm:conversation:updated",
  "dm:conversation:read",
  "dm:message:new",
  "dm:message:updated",
  "dm:message:deleted",
  "dm:message:removed",
  "dm:message:reaction_updated",
]);

const WORKSPACE_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "channel:messages:stale",
  "server:membership:added",
  "server:membership:removed",
  "server:settings:updated",
  "voice:state:update",
  "voice:screenshare:update",
]);

const BOOTSTRAP_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "server:unread:update",
  "notification:new",
]);

const SOCIAL_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "friends:updated",
  "presence:update",
  "user:profile:updated",
]);

type MobileValidatedRealtimePayload = {
  channelId: string | null;
  conversationId?: string | null;
  payload: unknown;
  serverId: string | null;
};

type MobileRealtimePayloadParser = (payload: unknown) => MobileValidatedRealtimePayload | null;

/** Decline, cancel and end all carry the same {conversationId, userId} shape. */
function parseMobileDMCallSignal(payload: unknown): MobileValidatedRealtimePayload | null {
  const parsed = MobileDMCallSignalEventSchema.safeParse(payload);
  return parsed.success
    ? {
        channelId: null,
        conversationId: parsed.data.conversationId,
        payload: parsed.data,
        serverId: null,
      }
    : null;
}

const MOBILE_REALTIME_PAYLOAD_PARSERS = {
  "dm:call:incoming": (payload) => {
    const parsed = MobileDMCallIncomingEventSchema.safeParse(payload);
    return parsed.success
      ? {
          channelId: null,
          conversationId: parsed.data.conversationId,
          payload: parsed.data,
          serverId: null,
        }
      : null;
  },
  "dm:call:accepted": (payload) => {
    const parsed = MobileDMCallAcceptedEventSchema.safeParse(payload);
    return parsed.success
      ? {
          channelId: null,
          conversationId: parsed.data.conversationId,
          payload: parsed.data,
          serverId: null,
        }
      : null;
  },
  "dm:call:declined": (payload) => parseMobileDMCallSignal(payload),
  "dm:call:cancelled": (payload) => parseMobileDMCallSignal(payload),
  "dm:call:ended": (payload) => parseMobileDMCallSignal(payload),
  "dm:conversation:read": (payload) => {
    const parsed = MobileDMReadUpdatedEventSchema.safeParse(payload);
    return parsed.success
      ? {
          channelId: null,
          conversationId: parsed.data.conversationId,
          payload: parsed.data,
          serverId: null,
        }
      : null;
  },
  "channel:messages:stale": (payload) => {
    const parsed = MobileChannelMessagesStaleEventSchema.safeParse(payload);
    return parsed.success
      ? { channelId: parsed.data.channelId, payload: parsed.data, serverId: parsed.data.serverId }
      : null;
  },
  "message:history_cleared": (payload) => {
    const parsed = MobileMessageHistoryClearedEventSchema.safeParse(payload);
    return parsed.success
      ? { channelId: parsed.data.channelId, payload: parsed.data, serverId: null }
      : null;
  },
  "presence:update": (payload) => {
    const parsed = MobilePresenceUpdateEventSchema.safeParse(payload);
    return parsed.success ? { channelId: null, payload: parsed.data, serverId: null } : null;
  },
  "server:unread:update": (payload) => {
    const parsed = MobileServerUnreadUpdateEventSchema.safeParse(payload);
    return parsed.success
      ? { channelId: null, payload: parsed.data, serverId: parsed.data.serverId }
      : null;
  },
  "server:membership:added": (payload) => {
    const parsed = MobileServerMembershipAddedEventSchema.safeParse(payload);
    return parsed.success
      ? { channelId: null, payload: parsed.data, serverId: parsed.data.serverId }
      : null;
  },
  "server:membership:removed": (payload) => {
    const parsed = MobileServerMembershipRemovedEventSchema.safeParse(payload);
    return parsed.success
      ? { channelId: null, payload: parsed.data, serverId: parsed.data.serverId }
      : null;
  },
  "server:settings:updated": (payload) => {
    const parsed = MobileServerSettingsUpdatedEventSchema.safeParse(payload);
    return parsed.success
      ? { channelId: null, payload: parsed.data, serverId: parsed.data.serverId }
      : null;
  },
  "user:profile:updated": (payload) => {
    const parsed = MobileUserProfileUpdatedEventSchema.safeParse(payload);
    return parsed.success ? { channelId: null, payload: parsed.data, serverId: null } : null;
  },
  "voice:state:update": (payload) => {
    const parsed = MobileVoiceStateUpdateEventSchema.safeParse(payload);
    return parsed.success
      ? { channelId: parsed.data.channelId, payload: parsed.data, serverId: parsed.data.serverId }
      : null;
  },
  "voice:screenshare:update": (payload) => {
    const parsed = MobileVoiceScreenShareUpdateEventSchema.safeParse(payload);
    return parsed.success
      ? { channelId: parsed.data.channelId, payload: parsed.data, serverId: parsed.data.serverId }
      : null;
  },
} satisfies Partial<Record<MobileRealtimeServerEventName, MobileRealtimePayloadParser>>;

type MobileValidatedRealtimeEventName = keyof typeof MOBILE_REALTIME_PAYLOAD_PARSERS;

export function isMobileRealtimeServerEventName(
  value: string,
): value is MobileRealtimeServerEventName {
  return (MOBILE_REALTIME_SERVER_EVENTS as readonly string[]).includes(value);
}

export function isMobileRealtimeValidatedPayloadEvent(
  eventName: MobileRealtimeServerEventName,
): eventName is MobileValidatedRealtimeEventName {
  return eventName in MOBILE_REALTIME_PAYLOAD_PARSERS;
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
    eventName === "dm:call:incoming" ||
    eventName === "dm:call:accepted" ||
    eventName === "dm:call:declined" ||
    eventName === "dm:call:cancelled" ||
    eventName === "dm:call:ended" ||
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
    sources.add("workspace");
  }

  if (DM_REFRESH_EVENTS.has(eventName)) {
    sources.add("dm");
  }

  if (WORKSPACE_REFRESH_EVENTS.has(eventName)) {
    sources.add("workspace");
  }

  if (SOCIAL_REFRESH_EVENTS.has(eventName)) {
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
  if (source === "notification") {
    return "bootstrap";
  }

  return source;
}

export function isMobileRealtimeChannelMessagePayloadEvent(
  eventName: MobileRealtimeServerEventName,
): boolean {
  return CHANNEL_REFRESH_EVENTS.has(eventName);
}

export function isMobileRealtimeDMMessagePayloadEvent(
  eventName: MobileRealtimeServerEventName,
): boolean {
  return DM_REFRESH_EVENTS.has(eventName);
}

export function createMobileRealtimeEventEnvelope(
  eventName: MobileRealtimeServerEventName,
  payload: unknown,
  now = Date.now(),
): MobileRealtimeEventEnvelope {
  const parser = isMobileRealtimeValidatedPayloadEvent(eventName)
    ? MOBILE_REALTIME_PAYLOAD_PARSERS[eventName]
    : null;
  const parsedPayload = parser?.(payload) ?? null;

  return {
    channelId:
      parsedPayload?.channelId ?? (parser ? null : getStringProperty(payload, "channelId")),
    conversationId:
      parsedPayload && "conversationId" in parsedPayload
        ? (parsedPayload.conversationId ?? null)
        : parser
          ? null
          : getStringProperty(payload, "conversationId"),
    eventName,
    payload: parsedPayload
      ? parsedPayload.payload
      : parser
        ? null
        : eventName.startsWith("voice:") ||
            isMobileRealtimeChannelMessagePayloadEvent(eventName) ||
            isMobileRealtimeDMMessagePayloadEvent(eventName) ||
            eventName === "typing:update" ||
            eventName === "dm:typing:update"
          ? payload
          : null,
    receivedAt: now,
    refreshSources: getMobileRealtimeRefreshSources(eventName),
    serverId: parsedPayload?.serverId ?? (parser ? null : getStringProperty(payload, "serverId")),
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
      eventName === "dm:call:incoming" ||
    eventName === "dm:call:accepted" ||
    eventName === "dm:call:declined" ||
    eventName === "dm:call:cancelled" ||
    eventName === "dm:call:ended" ||
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

  if (MOBILE_REALTIME_REFRESH_TIMER_SOURCES.length > 5) {
    issues.push("Mobile realtime refresh timer sources must remain bounded.");
  }

  if (MOBILE_REALTIME_REFRESH_DEBOUNCE_MS < 250 || MOBILE_REALTIME_REFRESH_DEBOUNCE_MS > 1_000) {
    issues.push("Mobile realtime refresh debounce must stay within mobile-safe bounds.");
  }

  return issues;
}
import {
  MobileChannelMessagesStaleEventSchema,
  MobileDMCallAcceptedEventSchema,
  MobileDMCallIncomingEventSchema,
  MobileDMCallSignalEventSchema,
  MobileDMReadUpdatedEventSchema,
  MobileMessageHistoryClearedEventSchema,
  MobilePresenceUpdateEventSchema,
  MobileServerUnreadUpdateEventSchema,
  MobileServerMembershipAddedEventSchema,
  MobileServerMembershipRemovedEventSchema,
  MobileServerSettingsUpdatedEventSchema,
  MobileUserProfileUpdatedEventSchema,
  MobileVoiceScreenShareUpdateEventSchema,
  MobileVoiceStateUpdateEventSchema,
} from "@wizards/types";
