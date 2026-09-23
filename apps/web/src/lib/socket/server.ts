import type { IncomingMessage, Server as HTTPServer } from "http";
import { getToken } from "next-auth/jwt";
import { prisma } from "@wizards/db";
import {
  endAppSession,
  heartbeatAppSession,
  logAnalyticsError,
  startAppSession,
} from "@/lib/analytics/service";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";
import { resolveVerifiedAttribution } from "@/lib/analytics/client-attribution";
import { getAuthSessionCookieConfig } from "@/lib/auth/session-cookies";
import { isAuthSessionActive } from "@/lib/auth/auth-session-service";
import { isUserSessionRevoked } from "@/lib/auth/session-revocation";
import { logError } from "@/lib/logger";
import {
  getBearerTokenFromHeaderValue,
  isMobileAccessSessionActive,
  verifyMobileAccessToken,
} from "@/lib/mobile/auth";
import { sendOpenModerationCaseCountToUser } from "@/lib/moderation/case-count-broadcast";
import { getRedisOp, getRedisRate } from "@/lib/redis";
import { createHandlerContext } from "@/lib/socket/context";
import {
  authenticateMobileSocketToken,
  authenticateWebSocketToken,
  SocketAuthenticationUnavailableError,
  type SocketAuthUser,
} from "@/lib/socket/authentication";
import { registerSocketHandlers } from "@/lib/socket/handlers";
import { markPresenceSocketActive } from "@/lib/socket/presence-helpers";
import { createSocketServerWithRedisAdapter } from "@/lib/socket/redis-adapter";
import {
  applyServerOnlinePresenceForSocket,
  removeServerOnlineMember,
  type ServerOnlinePresenceRedis,
} from "@/lib/socket/server-online-presence";
import { readCachedServerRoomIds, writeCachedServerRoomIds } from "@/lib/socket/server-room-cache";
import { setSocketServer } from "@/lib/socket/runtime";
import { installSocketDrainHandlers } from "@/lib/socket/drain-signals";
import { getAuthSessionSocketRoomName } from "@/lib/socket/rooms";
import { installSocketSessionRevalidation } from "@/lib/socket/session-revalidation";
import type { SocketData } from "./events";

const SOCKET_MAX_HTTP_BUFFER_SIZE = 1_048_576;
export const SOCKET_SERVER_ROOM_JOIN_BATCH_SIZE = 500;
const DEFAULT_DEV_SOCKET_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080",
];

function getOrigin(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function getSocketAllowedOrigins() {
  const configuredOrigins = (process.env.SOCKET_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const origins = [
    ...configuredOrigins,
    process.env.APP_URL,
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    ...(process.env.NODE_ENV === "production" ? [] : DEFAULT_DEV_SOCKET_ORIGINS),
  ]
    .map(getOrigin)
    .filter((origin): origin is string => Boolean(origin));

  return new Set(origins);
}

function isSocketOriginAllowed(origin: string | undefined, allowedOrigins: Set<string>) {
  if (!origin) {
    return (
      process.env.NODE_ENV !== "production" || process.env.SOCKET_ALLOW_EMPTY_ORIGIN === "true"
    );
  }

  const normalizedOrigin = getOrigin(origin);
  return Boolean(normalizedOrigin && allowedOrigins.has(normalizedOrigin));
}

function getFirstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  if (typeof property !== "string") {
    return null;
  }

  const trimmed = property.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed) ? trimmed : null;
}

/**
 * Native clients can set real handshake headers; browsers cannot on a WebSocket
 * upgrade, so they declare themselves in the auth payload. Headers win when both
 * are present.
 */
export function mergeHandshakeAttribution(
  headers: Record<string, string | string[] | undefined>,
  auth: unknown,
): Record<string, string | string[] | undefined> {
  const client = getStringProperty(auth, "client");
  const clientVersion = getStringProperty(auth, "clientVersion");

  return {
    ...(client ? { "x-whispr-client": client } : {}),
    ...(clientVersion ? { "x-whispr-client-version": clientVersion } : {}),
    ...headers,
  };
}

export function getSocketMobileBearerToken(input: {
  authorizationHeader?: string | string[] | undefined;
  handshakeAuth?: unknown;
}) {
  const authToken =
    getStringProperty(input.handshakeAuth, "token") ??
    getStringProperty(input.handshakeAuth, "accessToken");

  if (authToken) {
    return authToken;
  }

  return getBearerTokenFromHeaderValue(getFirstHeaderValue(input.authorizationHeader));
}

async function loadSocketAuthUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      customStatus: true,
      deletedAt: true,
      displayName: true,
      emailVerified: true,
      id: true,
      isBanned: true,
      sessionsRevokedAfter: true,
      settings: { select: { presenceVisibility: true } },
      username: true,
    },
  });
}

async function loadSocketAuthSessions(sessionIds: string[]) {
  return prisma.authSession.findMany({
    select: {
      createdAt: true,
      expiresAt: true,
      id: true,
      revokedAt: true,
      user: {
        select: {
          deletedAt: true,
          id: true,
          isBanned: true,
          sessionsRevokedAfter: true,
        },
      },
      userId: true,
    },
    where: { id: { in: sessionIds } },
  });
}

function assignSocketUserData(
  socket: { data: SocketData },
  authentication: {
    authSessionId: string;
    authSessionStartedAtSeconds?: number;
    clientType: "MOBILE" | "WEB";
    user: SocketAuthUser;
  },
) {
  socket.data.authSessionClientType = authentication.clientType;
  socket.data.authSessionId = authentication.authSessionId;
  if (authentication.authSessionStartedAtSeconds !== undefined) {
    socket.data.authSessionStartedAtSeconds = authentication.authSessionStartedAtSeconds;
  }
  socket.data.userId = authentication.user.id;
  socket.data.username = authentication.user.username;
  socket.data.displayName = authentication.user.displayName ?? authentication.user.username;
  socket.data.presenceCustomStatus = authentication.user.customStatus ?? null;
  socket.data.presenceStatus = "OFFLINE";
  socket.data.presenceVisibility = authentication.user.settings?.presenceVisibility ?? "EVERYONE";
}

export function resolveSocketRequestOrigin(input: {
  forwardedHost?: string | string[] | undefined;
  forwardedProto?: string | string[] | undefined;
  host?: string | undefined;
  secureCookie: boolean;
}) {
  const forwardedHost = getFirstHeaderValue(input.forwardedHost);
  const host = forwardedHost ?? input.host;

  if (!host?.trim()) {
    return null;
  }

  const forwardedProto = getFirstHeaderValue(input.forwardedProto);
  const proto = forwardedProto?.split(",")[0]?.trim() || (input.secureCookie ? "https" : "http");
  return getOrigin(`${proto}://${host}`);
}

function getSocketRequestOrigin(request: IncomingMessage) {
  return resolveSocketRequestOrigin({
    forwardedHost: request.headers["x-forwarded-host"],
    forwardedProto: request.headers["x-forwarded-proto"],
    host: request.headers.host,
    secureCookie: getAuthSessionCookieConfig().secureCookie,
  });
}

function isSocketRequestAllowed(request: IncomingMessage, allowedOrigins: Set<string>) {
  const origin = getFirstHeaderValue(request.headers.origin);

  if (origin) {
    return isSocketOriginAllowed(origin, allowedOrigins);
  }

  const requestOrigin = getSocketRequestOrigin(request);
  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    return true;
  }

  return process.env.NODE_ENV !== "production" || process.env.SOCKET_ALLOW_EMPTY_ORIGIN === "true";
}

type ServerRoomMembership = {
  serverId: string;
};

type ServerRoomMembershipFindManyArgs = {
  orderBy: { serverId: "asc" };
  select: { serverId: true };
  where: {
    server: {
      bans: {
        none: { userId: string };
      };
    };
    userId: string;
  };
};

type ServerRoomMembershipDelegate = {
  findMany(args: ServerRoomMembershipFindManyArgs): Promise<ServerRoomMembership[]>;
};

type ServerRoomJoinSocket = {
  connected?: boolean;
  data: { onlineServerIds?: string[]; presenceStatus?: string };
  join(room: string | string[]): Promise<void> | void;
};

function normalizeServerRoomJoinBatchSize(value: number | undefined) {
  if (!Number.isInteger(value) || !value || value <= 0) {
    return SOCKET_SERVER_ROOM_JOIN_BATCH_SIZE;
  }

  return Math.min(value, SOCKET_SERVER_ROOM_JOIN_BATCH_SIZE);
}

export async function listServerRoomIdsPage(
  userId: string,
  options: {
    batchSize?: number;
    cursorServerId?: string;
    serverMemberDelegate?: ServerRoomMembershipDelegate;
  } = {},
) {
  const memberships = await (options.serverMemberDelegate ?? prisma.serverMember).findMany({
    where: {
      userId,
      server: {
        bans: {
          none: { userId },
        },
      },
    },
    ...(options.cursorServerId
      ? {
          cursor: {
            userId_serverId: {
              serverId: options.cursorServerId,
              userId,
            },
          },
          skip: 1,
        }
      : {}),
    orderBy: { serverId: "asc" },
    take: normalizeServerRoomJoinBatchSize(options.batchSize),
    select: { serverId: true },
  } as ServerRoomMembershipFindManyArgs & {
    cursor?: {
      userId_serverId: {
        serverId: string;
        userId: string;
      };
    };
    skip?: number;
    take: number;
  });

  return memberships.map((membership) => membership.serverId);
}

export async function listServerRoomIdsForUser(
  userId: string,
  options: {
    redis?: ReturnType<typeof getRedisOp>;
    serverMemberDelegate?: ServerRoomMembershipDelegate;
  } = {},
) {
  const redis = options.redis ?? getRedisOp();
  const cachedServerIds = await readCachedServerRoomIds(redis, userId);
  if (cachedServerIds) {
    return cachedServerIds;
  }

  const memberships = await (options.serverMemberDelegate ?? prisma.serverMember).findMany({
    where: {
      userId,
      server: {
        bans: {
          none: { userId },
        },
      },
    },
    orderBy: { serverId: "asc" },
    select: { serverId: true },
  });
  const serverIds = memberships.map((membership) => membership.serverId);

  await writeCachedServerRoomIds(redis, userId, serverIds);
  return serverIds;
}

export async function joinServerRoomsForUser(
  socket: ServerRoomJoinSocket,
  userId: string,
  options: {
    batchSize?: number;
    redis?: ReturnType<typeof getRedisOp>;
    serverMemberDelegate?: ServerRoomMembershipDelegate;
  } = {},
) {
  const serverIds = await listServerRoomIdsForUser(userId, {
    ...(options.redis ? { redis: options.redis } : {}),
    ...(options.serverMemberDelegate ? { serverMemberDelegate: options.serverMemberDelegate } : {}),
  });
  if (serverIds.length === 0) {
    return;
  }

  await socket.join(serverIds.map((serverId) => `server:${serverId}`));

  // `onlineServerIds` records room membership for the disconnect and presence
  // handlers regardless of what happens next, and is assigned before the
  // online-set write so the presence chain racing this one always sees it.
  // The online-set mirror of it is narrower: `applyServerOnlinePresenceForSocket`
  // only writes while the socket is still eligible, and reverses if that flips
  // mid-write. Without it, a disconnect or an OFFLINE presence transition
  // racing this task -- both can start in the same synchronous tick of
  // `connection` -- would leave a ghost entry nothing ever removes (Task 8
  // findings 3/4).
  socket.data.onlineServerIds = serverIds;

  await applyServerOnlinePresenceForSocket(options.redis ?? getRedisOp(), socket, userId);
}

type DisconnectCleanupSocket = {
  data: { appSessionKey?: string; onlineServerIds?: string[]; userId?: string };
  id: string;
};

type DisconnectRoomProbe = {
  in(room: string): {
    fetchSockets(): Promise<ReadonlyArray<{ id: string; rooms: ReadonlySet<string> }>>;
  };
};

/**
 * Which of this socket's servers the user is actually leaving.
 *
 * The online set is per user, not per socket, so a second tab must not be
 * evicted by the first one closing. There is deliberately no ref count: the
 * interface carries no socket identity and adding one would lock S3's bulk
 * read contract early. Asking Socket.IO once per disconnect is the cheaper
 * shape -- the ban was on `fetchSockets` in the *counting* path, which runs
 * per server per read, not here.
 *
 * Failing open (releasing everything) is the safe direction: an over-eager
 * removal under-counts until the next join/presence event rewrites the set,
 * whereas a skipped removal is a ghost that nothing reaps.
 */
async function resolveReleasableServerIds(
  io: DisconnectRoomProbe | null,
  socketId: string,
  userId: string,
  serverIds: string[],
): Promise<string[]> {
  if (!io || serverIds.length === 0) {
    return serverIds;
  }

  let siblings: ReadonlyArray<{ id: string; rooms: ReadonlySet<string> }>;
  try {
    siblings = (await io.in(`user:${userId}`).fetchSockets()).filter(
      (sibling) => sibling.id !== socketId,
    );
  } catch (error) {
    logError("[socket] Disconnect sibling lookup error", error);
    return serverIds;
  }

  if (siblings.length === 0) {
    return serverIds;
  }

  return serverIds.filter(
    (serverId) => !siblings.some((sibling) => sibling.rooms.has(`server:${serverId}`)),
  );
}

/**
 * Extracted from the `disconnect` listener so the failure isolation below can
 * be asserted: every step used to sit in one `try` whose first statement was
 * the Redis online-set write, so a rejection there skipped the heartbeat
 * clear (leaking a 60s interval with no TTL against a dead socket), the
 * presence cleanup (leaving the user ONLINE to their friends) and the app
 * session close. The write helpers no longer throw, and the heartbeat clear
 * is now synchronous and unconditional ahead of any await, so neither can
 * regress silently.
 */
export async function runSocketDisconnectCleanup(options: {
  cleanup?: (() => Promise<void> | void) | undefined;
  endSession?: (appSessionKey: string) => Promise<unknown>;
  fallbackAppSessionKey: string;
  io?: DisconnectRoomProbe | null;
  presenceHeartbeat: ReturnType<typeof setInterval>;
  redis?: ServerOnlinePresenceRedis;
  socket: DisconnectCleanupSocket;
}) {
  clearInterval(options.presenceHeartbeat);

  try {
    const userId = options.socket.data.userId;
    if (userId) {
      const redis = options.redis ?? getRedisOp();
      const releasableServerIds = await resolveReleasableServerIds(
        options.io ?? null,
        options.socket.id,
        userId,
        options.socket.data.onlineServerIds ?? [],
      );
      await Promise.all(
        releasableServerIds.map((serverId) => removeServerOnlineMember(redis, serverId, userId)),
      );
    }
    await options.cleanup?.();
    await (options.endSession ?? endAppSession)(
      options.socket.data.appSessionKey ?? options.fallbackAppSessionKey,
    ).catch((error) => {
      logAnalyticsError("app session end", error);
    });
  } catch (error) {
    logError("[socket] Disconnect cleanup error", error);
  }
}

export function initSocketServer(httpServer: HTTPServer) {
  const allowedSocketOrigins = getSocketAllowedOrigins();
  const io = createSocketServerWithRedisAdapter({
    httpServer,
    options: {
      allowRequest(request, callback) {
        callback(null, isSocketRequestAllowed(request, allowedSocketOrigins));
      },
      cors: {
        origin(origin, callback) {
          if (!origin || isSocketOriginAllowed(origin, allowedSocketOrigins)) {
            callback(null, true);
            return;
          }

          callback(new Error("Socket origin is not allowed by this Whispr deployment."));
        },
        credentials: true,
      },
      maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE,
    },
  });
  setSocketServer(io);
  installSocketDrainHandlers(io);
  const stopSessionRevalidation = installSocketSessionRevalidation(io, {
    loadSessions: loadSocketAuthSessions,
  });
  httpServer.once("close", stopSessionRevalidation);

  io.use(async (socket, next) => {
    try {
      const mobileBearerToken = getSocketMobileBearerToken({
        authorizationHeader: socket.request.headers.authorization,
        handshakeAuth: socket.handshake.auth,
      });

      if (mobileBearerToken) {
        const mobileAuthentication = await authenticateMobileSocketToken(mobileBearerToken, {
          checkSession: isMobileAccessSessionActive,
          loadUser: loadSocketAuthUser,
          verifyToken: verifyMobileAccessToken,
        });
        if (!mobileAuthentication) {
          return next(new Error("Unauthorized"));
        }

        assignSocketUserData(socket, mobileAuthentication);
        next();
        return;
      }

      const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
      if (!secret) {
        return next(new Error("Missing AUTH_SECRET"));
      }

      const { cookieName, secureCookie } = getAuthSessionCookieConfig();

      const token = await getToken({
        req: {
          headers: {
            cookie:
              typeof socket.request.headers.cookie === "string"
                ? socket.request.headers.cookie
                : "",
          },
        },
        secret,
        cookieName,
        secureCookie,
      });

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const webAuthentication = await authenticateWebSocketToken(token, {
        checkAuthSession: isAuthSessionActive,
        checkGlobalRevocation: (userId, startedAtSeconds, loadUser) =>
          isUserSessionRevoked(userId, startedAtSeconds, {
            loadDurableRevokedAfter: async () => (await loadUser())?.sessionsRevokedAfter ?? null,
          }),
        loadUser: loadSocketAuthUser,
      });

      if (!webAuthentication) {
        return next(new Error("Unauthorized"));
      }

      assignSocketUserData(socket, webAuthentication);
      next();
    } catch (error) {
      next(
        error instanceof SocketAuthenticationUnavailableError ? error : new Error("Unauthorized"),
      );
    }
  });

  const redis = getRedisOp();
  const rateRedis = getRedisRate();

  io.on("connection", (socket) => {
    const ctx = createHandlerContext({ io, rateRedis, redis, socket });
    const userId = ctx.userId;
    const authSessionId = socket.data.authSessionId;
    if (!authSessionId) {
      socket.disconnect(true);
      return;
    }
    socket.join([`user:${userId}`, getAuthSessionSocketRoomName(authSessionId)]);
    const appSessionKey = `socket:${socket.id}`;
    const clientInfo = getAnalyticsClientInfo(
      mergeHandshakeAttribution(socket.handshake.headers, socket.handshake.auth),
    );
    socket.data.appSessionKey = appSessionKey;
    // Metric tables have no `attributionVerified` column, so an unverified
    // guess has to be recorded as UNKNOWN here or it becomes indistinguishable
    // from a client that really declared itself.
    socket.data.clientAttribution = resolveVerifiedAttribution({
      appVersion: clientInfo.appVersion,
      attributionVerified: clientInfo.attributionVerified,
      clientType: clientInfo.clientType,
    });
    void startAppSession({
      clientInfo,
      sessionKey: appSessionKey,
      socketId: socket.id,
      userId,
    }).catch((error) => {
      logAnalyticsError("app session start", error);
    });
    const presenceHeartbeat = setInterval(() => {
      void markPresenceSocketActive(redis, userId, socket.id).catch((error) => {
        logError("[socket] Presence heartbeat error", error);
      });
      void heartbeatAppSession(appSessionKey).catch((error) => {
        logAnalyticsError("app session heartbeat", error);
      });
    }, 60_000);
    socket.data.typingChannels = new Set<string>();
    socket.data.voiceRooms = new Set<string>();
    socket.data.voiceStateViewerChannelsByServer = new Map<string, Set<string>>();
    socket.data.presenceCustomStatus = socket.data.presenceCustomStatus ?? null;
    socket.data.presenceStatus = socket.data.presenceStatus ?? "OFFLINE";
    void (async () => {
      try {
        await joinServerRoomsForUser(socket, userId);
      } catch (error) {
        logError("[socket] Server room join error", error);
      }
    })();
    // F9: a desktop that just started has no badge until something changes, so
    // the first count is sent on connect. Non-admins get nothing — the helper
    // resolves the recipient list from the same capability map the routes use.
    void sendOpenModerationCaseCountToUser(userId, socket).catch((error) => {
      logError("[socket] Open case count sync error", error);
    });
    const handlerRegistration = registerSocketHandlers(ctx);

    socket.on("disconnect", async () => {
      await runSocketDisconnectCleanup({
        cleanup: handlerRegistration.cleanup,
        fallbackAppSessionKey: appSessionKey,
        io,
        presenceHeartbeat,
        socket,
      });
    });
  });

  return io;
}
