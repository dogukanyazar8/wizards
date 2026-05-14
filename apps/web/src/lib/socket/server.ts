import type { IncomingMessage, Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getToken } from "next-auth/jwt";
import { prisma } from "@wizards/db";
import {
  endAppSession,
  heartbeatAppSession,
  logAnalyticsError,
  startAppSession,
} from "@/lib/analytics/service";
import { isActiveAuthUser } from "@/lib/auth/access";
import { logError } from "@/lib/logger";
import { getRedisOp, getRedisPub, getRedisRate, getRedisSub } from "@/lib/redis";
import { createHandlerContext } from "@/lib/socket/context";
import { registerSocketHandlers } from "@/lib/socket/handlers";
import { markPresenceSocketActive } from "@/lib/socket/presence-helpers";
import { setSocketServer } from "@/lib/socket/runtime";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events";

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

function getSocketRequestOrigin(request: IncomingMessage) {
  const forwardedHost = getFirstHeaderValue(request.headers["x-forwarded-host"]);
  const host = forwardedHost ?? request.headers.host;

  if (!host?.trim()) {
    return null;
  }

  const forwardedProto = getFirstHeaderValue(request.headers["x-forwarded-proto"]);
  const proto = forwardedProto?.split(",")[0]?.trim() || "https";
  return getOrigin(`${proto}://${host}`);
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
  cursor?: {
    userId_serverId: {
      serverId: string;
      userId: string;
    };
  };
  orderBy: { serverId: "asc" };
  select: { serverId: true };
  skip?: number;
  take: number;
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
  join(room: string): void;
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
  });

  return memberships.map((membership) => membership.serverId);
}

export async function joinServerRoomsForUser(
  socket: ServerRoomJoinSocket,
  userId: string,
  options: {
    batchSize?: number;
    serverMemberDelegate?: ServerRoomMembershipDelegate;
  } = {},
) {
  const batchSize = normalizeServerRoomJoinBatchSize(options.batchSize);
  let cursorServerId: string | undefined;

  for (;;) {
    const serverIds = await listServerRoomIdsPage(userId, {
      batchSize,
      ...(cursorServerId ? { cursorServerId } : {}),
      ...(options.serverMemberDelegate
        ? { serverMemberDelegate: options.serverMemberDelegate }
        : {}),
    });

    for (const serverId of serverIds) {
      socket.join(`server:${serverId}`);
    }

    if (serverIds.length < batchSize) {
      return;
    }

    cursorServerId = serverIds.at(-1);
    if (!cursorServerId) {
      return;
    }
  }
}

export function initSocketServer(httpServer: HTTPServer) {
  const allowedSocketOrigins = getSocketAllowedOrigins();
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
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
  );
  setSocketServer(io);

  io.use(async (socket, next) => {
    try {
      const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
      if (!secret) {
        return next(new Error("Missing AUTH_SECRET"));
      }

      const cookieName =
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token";

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
      });

      if (!token?.id || typeof token.id !== "string") {
        return next(new Error("Unauthorized"));
      }

      const user = await prisma.user.findUnique({
        where: { id: token.id },
        select: {
          customStatus: true,
          deletedAt: true,
          displayName: true,
          emailVerified: true,
          id: true,
          isBanned: true,
          username: true,
        },
      });

      if (!isActiveAuthUser(user)) {
        return next(new Error("Unauthorized"));
      }

      socket.data.userId = user.id;
      socket.data.username = user.username;
      socket.data.displayName = user.displayName ?? user.username;
      socket.data.presenceCustomStatus = user.customStatus ?? null;
      socket.data.presenceStatus = "OFFLINE";
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  const redis = getRedisOp();
  const rateRedis = getRedisRate();
  const redisPub = getRedisPub();
  const redisSub = getRedisSub();
  io.adapter(createAdapter(redisPub, redisSub));

  io.on("connection", (socket) => {
    const ctx = createHandlerContext({ io, rateRedis, redis, socket });
    const userId = ctx.userId;
    const appSessionKey = `socket:${socket.id}`;
    socket.data.appSessionKey = appSessionKey;
    void startAppSession({
      headers: socket.handshake.headers,
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
    socket.data.presenceCustomStatus = socket.data.presenceCustomStatus ?? null;
    socket.data.presenceStatus = socket.data.presenceStatus ?? "OFFLINE";
    socket.join(`user:${userId}`);
    void (async () => {
      try {
        await joinServerRoomsForUser(socket, userId);
      } catch (error) {
        logError("[socket] Server room join error", error);
      }
    })();
    const handlerRegistration = registerSocketHandlers(ctx);

    socket.on("disconnect", async () => {
      try {
        clearInterval(presenceHeartbeat);
        await handlerRegistration.cleanup?.();
        await endAppSession(socket.data.appSessionKey ?? appSessionKey).catch((error) => {
          logAnalyticsError("app session end", error);
        });
      } catch (error) {
        logError("[socket] Disconnect cleanup error", error);
      }
    });
  });

  return io;
}
