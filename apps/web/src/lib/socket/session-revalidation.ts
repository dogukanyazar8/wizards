import {
  isDurableAuthSessionActive,
  isSessionGloballyRevoked,
} from "@/lib/auth/session-revocation";
import { logError } from "@/lib/logger";
import type { AppSocketServer } from "@/lib/socket/runtime";

export const SOCKET_SESSION_REVALIDATION_INTERVAL_MS = 30_000;

type RevalidationSocket = {
  data: {
    authSessionClientType?: "MOBILE" | "WEB";
    authSessionId?: string;
    userId?: string;
  };
  disconnect(close: boolean): unknown;
};

export type SocketSessionRecord = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  revokedAt: Date | null;
  user: {
    deletedAt: Date | null;
    id: string;
    isBanned: boolean;
    sessionsRevokedAfter: Date | null;
  };
  userId: string;
};

type SocketSessionLoader = (sessionIds: string[]) => Promise<SocketSessionRecord[]>;

function disconnectSocket(socket: RevalidationSocket) {
  try {
    socket.disconnect(true);
  } catch (error) {
    logError("[socket] Failed to disconnect an invalid session", error);
  }
}

function isSocketSessionActive(
  socket: RevalidationSocket,
  session: SocketSessionRecord | undefined,
  now: Date,
) {
  const userId = socket.data.userId?.trim();
  if (
    !userId ||
    !session ||
    session.user.id !== userId ||
    session.user.deletedAt ||
    session.user.isBanned ||
    !isDurableAuthSessionActive(session, userId, now)
  ) {
    return false;
  }

  const revokedAfter = session.user.sessionsRevokedAfter;
  return !(
    revokedAfter &&
    isSessionGloballyRevoked(
      Math.floor(session.createdAt.getTime() / 1000),
      Math.floor(revokedAfter.getTime() / 1000),
    )
  );
}

export async function revalidateSocketSessions(
  sockets: Iterable<RevalidationSocket>,
  options: { loadSessions: SocketSessionLoader; now?: Date },
) {
  const socketSnapshot = Array.from(sockets).filter(
    (socket) => socket.data.authSessionClientType !== "MOBILE",
  );
  const sessionIds = Array.from(
    new Set(
      socketSnapshot
        .map((socket) => socket.data.authSessionId?.trim())
        .filter((sessionId): sessionId is string => Boolean(sessionId)),
    ),
  ).sort();

  if (sessionIds.length === 0) {
    for (const socket of socketSnapshot) disconnectSocket(socket);
    return;
  }

  let sessions: SocketSessionRecord[];
  try {
    sessions = await options.loadSessions(sessionIds);
  } catch (error) {
    logError("[socket] Session revalidation unavailable; disconnecting local sockets", error);
    for (const socket of socketSnapshot) disconnectSocket(socket);
    return;
  }

  const now = options.now ?? new Date();
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  for (const socket of socketSnapshot) {
    const sessionId = socket.data.authSessionId?.trim();
    if (!sessionId || !isSocketSessionActive(socket, sessionsById.get(sessionId), now)) {
      disconnectSocket(socket);
    }
  }
}

export function installSocketSessionRevalidation(
  io: AppSocketServer,
  options: {
    intervalMs?: number;
    loadSessions: SocketSessionLoader;
    now?: () => Date;
  },
) {
  let running = false;
  const interval = setInterval(() => {
    if (running) return;
    running = true;
    void revalidateSocketSessions(io.of("/").sockets.values(), {
      loadSessions: options.loadSessions,
      ...(options.now ? { now: options.now() } : {}),
    }).finally(() => {
      running = false;
    });
  }, options.intervalMs ?? SOCKET_SESSION_REVALIDATION_INTERVAL_MS);
  interval.unref?.();

  return () => clearInterval(interval);
}
