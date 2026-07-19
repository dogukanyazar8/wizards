import {
  MobileDMCallAcceptedEventSchema,
  MobileDMCallIncomingEventSchema,
  MobileDMCallSignalEventSchema,
  type MobileDMCallAcceptedEvent,
  type MobileDMCallIncomingEvent,
  type MobileDMCallSignalEvent,
} from "@wizards/types";

/** Ring lifetime shared with the server and the web client. */
export const MOBILE_DM_CALL_RING_TTL_MS = 45_000;

export type MobileDMCallStatus = "connected" | "ringing-in" | "ringing-out";

export type MobileDMCallSession = {
  readonly conversationId: string;
  readonly isVideo: boolean;
  readonly peer: MobileDMCallIncomingEvent["fromUser"] | null;
  /** Ring deadline in epoch millis, or null once the call is answered. */
  readonly ringExpiresAt: number | null;
  readonly status: MobileDMCallStatus;
  readonly title: string;
};

export function getMobileDMCallIncomingPayload(payload: unknown): MobileDMCallIncomingEvent | null {
  const parsed = MobileDMCallIncomingEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function getMobileDMCallSignalPayload(payload: unknown): MobileDMCallSignalEvent | null {
  const parsed = MobileDMCallSignalEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function getMobileDMCallAcceptedPayload(payload: unknown): MobileDMCallAcceptedEvent | null {
  const parsed = MobileDMCallAcceptedEventSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function createMobileOutgoingCall(input: {
  conversationId: string;
  now: number;
  title: string;
  video: boolean;
}): MobileDMCallSession {
  return {
    conversationId: input.conversationId,
    isVideo: input.video,
    peer: null,
    ringExpiresAt: input.now + MOBILE_DM_CALL_RING_TTL_MS,
    status: "ringing-out",
    title: input.title,
  };
}

export function createMobileIncomingCall(event: MobileDMCallIncomingEvent): MobileDMCallSession {
  const expiresAt = Date.parse(event.expiresAt);

  return {
    conversationId: event.conversationId,
    isVideo: event.video,
    peer: event.fromUser,
    ringExpiresAt: Number.isNaN(expiresAt) ? null : expiresAt,
    status: "ringing-in",
    title: event.fromUser.displayName ?? event.fromUser.username,
  };
}

export function markMobileCallConnected(
  session: MobileDMCallSession,
  video?: boolean,
): MobileDMCallSession {
  return {
    ...session,
    isVideo: video ?? session.isVideo,
    ringExpiresAt: null,
    status: "connected",
  };
}

export function hasMobileRingExpired(
  session: MobileDMCallSession | null,
  now: number,
): boolean {
  if (!session || session.ringExpiresAt === null) {
    return false;
  }

  return session.status !== "connected" && session.ringExpiresAt <= now;
}

/** Signals for a conversation the local session is not on belong to somebody else's call. */
export function isMobileCallSignalForSession(
  session: MobileDMCallSession | null,
  conversationId: string,
): boolean {
  return session?.conversationId === conversationId;
}
