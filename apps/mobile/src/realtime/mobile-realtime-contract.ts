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
  "dm:conversation:delivered",
  "dm:conversation:created",
  "dm:conversation:members_changed",
  "dm:conversation:removed",
  "dm:call:incoming",
  "dm:call:accepted",
  "dm:call:declined",
  "dm:call:cancelled",
  "dm:call:ended",
  "friends:updated",
  "friends:voice:update",
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
  "background" | "connected" | "connecting" | "disconnected" | "error" | "idle";

export type MobileRealtimeRefreshSource =
  | "bootstrap"
  | "channel"
  | "dm"
  | "notification"
  /** Feeds already written from the event; only the server counters need a read. */
  | "notification-badge"
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

/**
 * The subset of channel events that can move something the server-detail read
 * owns: the channel's last-message preview and its unread/mention counts. A
 * reaction changes neither, so it must never drag the heaviest read on the
 * backend behind it — that refetch is what made the open message list jump
 * every time someone tapped an emoji.
 */
const CHANNEL_WORKSPACE_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "message:new",
  "message:updated",
  "message:deleted",
  "message:removed",
  "message:history_cleared",
]);

const DM_REFRESH_EVENTS = new Set<MobileRealtimeServerEventName>([
  "dm:conversation:updated",
  "dm:conversation:read",
  // Faz 5 §17.2: a group appearing, changing hands, or losing the viewer each
  // rewrites the inbox row, and none of them ride a message event.
  "dm:conversation:created",
  "dm:conversation:members_changed",
  "dm:conversation:removed",
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
  // The bootstrap payload carries the DM inventory, so a conversation gained or
  // lost has to reach it too.
  "dm:conversation:created",
  "dm:conversation:removed",
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
  "dm:conversation:delivered": (payload) => {
    const parsed = MobileDMDeliveredUpdatedEventSchema.safeParse(payload);
    return parsed.success
      ? {
          channelId: null,
          conversationId: parsed.data.conversationId,
          payload: parsed.data,
          serverId: null,
        }
      : null;
  },
  "friends:voice:update": (payload) => {
    const parsed = MobileFriendVoiceRoomUpdateEventSchema.safeParse(payload);
    return parsed.success ? { channelId: null, payload: parsed.data, serverId: null } : null;
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
  }

  if (CHANNEL_WORKSPACE_REFRESH_EVENTS.has(eventName)) {
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
  if (source === "notification" || source === "notification-badge") {
    return "bootstrap";
  }

  return source;
}

export function isMobileRealtimeChannelMessagePayloadEvent(
  eventName: MobileRealtimeServerEventName,
): boolean {
  return CHANNEL_REFRESH_EVENTS.has(eventName);
}

/** True when the event can change what the server-detail read reports for a channel. */
export function isMobileRealtimeWorkspaceAffectingChannelEvent(
  eventName: MobileRealtimeServerEventName,
): boolean {
  return CHANNEL_WORKSPACE_REFRESH_EVENTS.has(eventName);
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
            eventName === "dm:typing:update" ||
            // The bridge validates this one itself: it writes the row into the
            // cached feeds and, for a BADGE row, invalidates the badge reads
            // (07 §4). Dropping the payload here left both paths dead. It is
            // carried rather than parsed so an unrecognised shape still falls
            // back to a refresh instead of being discarded outright.
            eventName === "notification:new"
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
  MobileDMDeliveredUpdatedEventSchema,
  MobileDMReadUpdatedEventSchema,
  MobileFriendVoiceRoomUpdateEventSchema,
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
