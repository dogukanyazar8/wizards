/**
 * Pure DM call state helpers. The React layer owns sockets and LiveKit; everything that
 * decides *what the call state should be* lives here so it can be tested without a browser.
 */

export type DMCallPeer = {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  username: string;
};

export type DMCallStatus = "connected" | "connecting" | "ringing-in" | "ringing-out";

export type DMCallSession = {
  conversationId: string;
  /** True when the call was started as (or upgraded to) a video call. */
  isVideo: boolean;
  peer: DMCallPeer | null;
  /** Ring deadline in epoch millis; null once the call is answered. */
  ringExpiresAt: number | null;
  status: DMCallStatus;
};

/** How long an unanswered call keeps ringing. Mirrors DM_CALL_RING_TTL_MS on the server. */
export const DM_CALL_RING_TTL_MS = 45_000;

export function createOutgoingCall(input: {
  conversationId: string;
  now: number;
  peer: DMCallPeer | null;
  video: boolean;
}): DMCallSession {
  return {
    conversationId: input.conversationId,
    isVideo: input.video,
    peer: input.peer,
    ringExpiresAt: input.now + DM_CALL_RING_TTL_MS,
    status: "ringing-out",
  };
}

export function createIncomingCall(input: {
  conversationId: string;
  expiresAt: string;
  peer: DMCallPeer;
  video: boolean;
}): DMCallSession {
  const parsed = Date.parse(input.expiresAt);

  return {
    conversationId: input.conversationId,
    isVideo: input.video,
    peer: input.peer,
    ringExpiresAt: Number.isNaN(parsed) ? null : parsed,
    status: "ringing-in",
  };
}

export function markCallConnected(session: DMCallSession, video?: boolean): DMCallSession {
  return {
    ...session,
    isVideo: video ?? session.isVideo,
    ringExpiresAt: null,
    status: "connected",
  };
}

export function markCallConnecting(session: DMCallSession, video?: boolean): DMCallSession {
  return {
    ...session,
    isVideo: video ?? session.isVideo,
    ringExpiresAt: null,
    status: "connecting",
  };
}

export function isRinging(session: DMCallSession | null): boolean {
  return session?.status === "ringing-in" || session?.status === "ringing-out";
}

export function hasRingExpired(session: DMCallSession | null, now: number): boolean {
  return isRinging(session) && session?.ringExpiresAt !== null && (session?.ringExpiresAt ?? 0) <= now;
}

/**
 * A signal only applies when it names the conversation the local session is on. Signals for
 * other conversations belong to a call the user is not in and must be ignored.
 */
export function signalMatchesSession(
  session: DMCallSession | null,
  conversationId: string,
): session is DMCallSession {
  return session?.conversationId === conversationId;
}
