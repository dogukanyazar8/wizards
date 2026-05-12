import type { IncomingMessage, Server as HTTPServer } from "http";
import { randomUUID } from "crypto";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getToken } from "next-auth/jwt";
import { ChannelType, Prisma, prisma } from "@wizards/db";
import type { UploadedAttachmentInput } from "@wizards/types";
import { ApiError } from "@/lib/api";
import { isActiveAuthUser } from "@/lib/auth/access";
import {
  dmMessageInclude,
  dmNotificationUserSelect,
  getDirectMessageConversationForUser,
  getDMDisplayName,
  mapDMMessagePayload,
  mapDMMessagePayloadWithReactions,
  setDMReaction,
} from "@/lib/dm/service";
import { getBlockStatus } from "@/lib/friends/helpers";
import {
  PRESENCE_CACHE_TTL_SECONDS,
  broadcastPresenceUpdateToFriends,
  cacheUserPresence,
  getUserPresenceBroadcast,
} from "@/lib/friends/service";
import { logError } from "@/lib/logger";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { readPresenceMap, type VisiblePresenceStatus } from "@/lib/presence";
import {
  claimUploadedMessageAttachments,
  isMessageGifContentType,
  isMessageImageContentType,
  normalizeMessageContentForSend,
  parseUploadedAttachmentInputs,
} from "@/lib/messages/attachments";
import { getRedis, getRedisSub } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkDMMessageRateLimits } from "@/lib/socket/rate-limits";
import { setSocketServer } from "@/lib/socket/runtime";
import { emitVoiceScreenShareUpdate } from "@/lib/voice/service";
import {
  getVoiceScreenShareStateKey,
  VOICE_SCREEN_SHARE_STATE_TTL_SECONDS,
} from "@/lib/voice/screen-share-state";
import {
  emitServerUnreadUpdateToUser,
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  getActiveServerMemberUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
import { getServerMediaSettings } from "@/lib/workspace/server-features";
import {
  createMessage,
  deleteMessage,
  editMessage,
  setReaction,
} from "@/lib/workspace/message-service";
import {
  filterUserIdsByChannelPermission,
  requireChannelPermissionForUser,
} from "@/lib/workspace/permission-service";
import { PermissionBits, hasPermission } from "@/lib/workspace/permissions";
import {
  parseSocketPayload,
  SocketConversationPayloadSchema,
  SocketDMMessageSendPayloadSchema,
  SocketDMScreenShareTargetPayloadSchema,
  SocketIdSchema,
  SocketMessageDeletePayloadSchema,
  SocketMessageEditPayloadSchema,
  SocketMessageReactionPayloadSchema,
  SocketMessageSendPayloadSchema,
  SocketPresenceActivityPayloadSchema,
  SocketVoiceAudioLevelPayloadSchema,
  SocketVoiceChannelPayloadSchema,
  SocketVoiceInviteAcceptPayloadSchema,
  SocketVoiceInviteDeclinePayloadSchema,
  SocketVoiceInvitePayloadSchema,
  SocketVoiceScreenSharePayloadSchema,
} from "@/lib/socket/schemas";
import type {
  ClientToServerEvents,
  InterServerEvents,
  NotificationSocketPayload,
  ServerToClientEvents,
  SocketData,
  VoiceInviteErrorPayload,
} from "./events";

const CHANNEL_TYPING_EXPIRY = 3000;
const DM_TYPING_EXPIRY = 3000;
const SOCKET_MAX_HTTP_BUFFER_SIZE = 1_048_576;
const TYPING_KEY_TTL_SECONDS = 10;
const TYPING_RATE_LIMIT = 24;
const TYPING_RATE_WINDOW_SECONDS = 10;
const VOICE_INVITE_RATE_LIMIT = 12;
const VOICE_INVITE_RATE_WINDOW_SECONDS = 60;
const VOICE_INVITE_TTL_MS = 60_000;
const VOICE_INVITE_KEY_PREFIX = "voice:invite:";
const VOICE_AUDIO_LEVEL_MIN_INTERVAL_MS = 40;
const PRESENCE_SOCKET_PREFIX = "presence:socket-set:";
const PRESENCE_SOCKET_TTL_SECONDS = 120;
const PRESENCE_SOCKET_TTL_MS = PRESENCE_SOCKET_TTL_SECONDS * 1000;
const DEFAULT_DEV_SOCKET_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080",
];

type NotificationRecord = {
  id: string;
  userId: string;
  type:
    | "MENTION"
    | "FRIEND_REQUEST"
    | "FRIEND_ACCEPTED"
    | "DM"
    | "SERVER_INVITE"
    | "SYSTEM"
    | "MODERATION";
  title: string;
  body: string;
  imageUrl: string | null;
  read: boolean;
  readAt: Date | null;
  actionUrl: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

type DMTypingEntry = {
  expiresAt: number;
  username: string;
};

type StoredVoiceInvite = {
  channelId: string;
  expiresAt: string;
  fromUserId: string;
  serverId: string;
  targetUserId: string;
};

function getVoiceInviteKey(inviteId: string) {
  return `${VOICE_INVITE_KEY_PREFIX}${inviteId}`;
}

function parseStoredVoiceInvite(value: string | null): StoredVoiceInvite | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.channelId === "string" &&
      typeof parsed.expiresAt === "string" &&
      typeof parsed.fromUserId === "string" &&
      typeof parsed.serverId === "string" &&
      typeof parsed.targetUserId === "string"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function getPresenceSocketsKey(userId: string) {
  return `${PRESENCE_SOCKET_PREFIX}${userId}`;
}

async function prunePresenceSockets(
  redis: ReturnType<typeof getRedis>,
  userId: string,
) {
  const key = getPresenceSocketsKey(userId);
  await redis.zremrangebyscore(key, "-inf", Date.now() - PRESENCE_SOCKET_TTL_MS);
  return redis.zcard(key);
}

async function markPresenceSocketActive(
  redis: ReturnType<typeof getRedis>,
  userId: string,
  socketId: string,
) {
  const key = getPresenceSocketsKey(userId);
  await redis
    .pipeline()
    .zadd(key, Date.now(), socketId)
    .expire(key, PRESENCE_SOCKET_TTL_SECONDS)
    .expire(`presence:${userId}`, PRESENCE_CACHE_TTL_SECONDS)
    .exec();
}

async function addPresenceSocket(
  redis: ReturnType<typeof getRedis>,
  userId: string,
  socketId: string,
) {
  const existingSocketCount = await prunePresenceSockets(redis, userId);
  await markPresenceSocketActive(redis, userId, socketId);
  return existingSocketCount === 0;
}

async function removePresenceSocket(
  redis: ReturnType<typeof getRedis>,
  userId: string,
  socketId: string,
) {
  const key = getPresenceSocketsKey(userId);
  await redis.zrem(key, socketId);
  const remainingSocketCount = await prunePresenceSockets(redis, userId);
  if (remainingSocketCount <= 0) {
    await redis.del(key);
  }

  return remainingSocketCount;
}

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

function toVisiblePresenceStatus(status: string): VisiblePresenceStatus {
  return status === "ONLINE" || status === "IDLE" || status === "DND" ? status : "OFFLINE";
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
    return process.env.NODE_ENV !== "production" || process.env.SOCKET_ALLOW_EMPTY_ORIGIN === "true";
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

function isSocketRequestAllowed(
  request: IncomingMessage,
  allowedOrigins: Set<string>,
) {
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

function isRecord(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDMTypingEntry(value: string): DMTypingEntry | null {
  try {
    const parsed = JSON.parse(value) as {
      expiresAt?: unknown;
      username?: unknown;
    };

    if (
      typeof parsed.expiresAt === "number" &&
      Number.isFinite(parsed.expiresAt) &&
      typeof parsed.username === "string" &&
      parsed.username.trim().length > 0
    ) {
      return {
        expiresAt: parsed.expiresAt,
        username: parsed.username,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function serializeNotification(notification: NotificationRecord): NotificationSocketPayload {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    imageUrl: notification.imageUrl,
    read: notification.read,
    readAt: notification.readAt?.toISOString() ?? null,
    actionUrl: notification.actionUrl,
    metadata: isRecord(notification.metadata) ? notification.metadata : null,
    createdAt: notification.createdAt.toISOString(),
  };
}

function extractMentionUsernames(content: string) {
  const mentions = new Set<string>();
  const mentionPattern = /(^|[\s([{])@([a-zA-Z0-9_.-]{2,32})/g;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(content)) !== null) {
    mentions.add((match[2] ?? "").toLocaleLowerCase("en-US"));
  }

  return Array.from(mentions);
}

async function createChannelMentionNotifications(args: {
  channelId: string;
  channelName: string;
  content: string;
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  messageId: string;
  senderId: string;
  senderName: string;
  serverId: string;
  skipUserIds?: string[];
}) {
  const usernames = extractMentionUsernames(args.content);
  if (usernames.length === 0) {
    return;
  }

  const skipUserIds = new Set(args.skipUserIds ?? []);
  const mentionedMembers = await prisma.serverMember.findMany({
    where: {
      serverId: args.serverId,
      userId:
        skipUserIds.size > 0
          ? { not: args.senderId, notIn: [...skipUserIds] }
          : { not: args.senderId },
      user: {
        username: {
          in: usernames,
        },
      },
    },
    select: {
      joinedAt: true,
      userId: true,
      user: {
        select: {
          locale: true,
        },
      },
    },
  });

  if (mentionedMembers.length === 0) {
    return;
  }

  const visibleMentionedUserIds = new Set(
    await filterUserIdsByChannelPermission(
      args.channelId,
      mentionedMembers.map((member) => member.userId),
      PermissionBits.VIEW_CHANNEL,
    ),
  );
  const permittedMentionedMembers = mentionedMembers.filter((member) =>
    visibleMentionedUserIds.has(member.userId),
  );

  if (permittedMentionedMembers.length === 0) {
    return;
  }

  const mentionedUserIds = permittedMentionedMembers.map((member) => member.userId);
  const [channelSettings, serverSettings] = await Promise.all([
    prisma.userChannelSettings.findMany({
      where: {
        channelId: args.channelId,
        userId: { in: mentionedUserIds },
      },
      select: {
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
        userId: true,
      },
    }),
    prisma.userServerSettings.findMany({
      where: {
        serverId: args.serverId,
        userId: { in: mentionedUserIds },
      },
      select: {
        messageNotifications: true,
        muted: true,
        mutedUntil: true,
        userId: true,
      },
    }),
  ]);
  const now = new Date();
  const channelSettingsByUserId = new Map(channelSettings.map((setting) => [setting.userId, setting]));
  const serverSettingsByUserId = new Map(serverSettings.map((setting) => [setting.userId, setting]));
  const isMuted = (setting: { muted: boolean; mutedUntil: Date | null } | undefined) =>
    Boolean(setting?.muted) || Boolean(setting?.mutedUntil && setting.mutedUntil > now);
  const shouldReceiveMention = (userId: string) => {
    const channelSetting = channelSettingsByUserId.get(userId);
    const serverSetting = serverSettingsByUserId.get(userId);

    if (isMuted(channelSetting) || isMuted(serverSetting)) {
      return false;
    }

    if (
      channelSetting?.messageNotifications === "NOTHING" ||
      serverSetting?.messageNotifications === "NOTHING"
    ) {
      return false;
    }

    return true;
  };
  const mentionRecipients = permittedMentionedMembers.filter((member) => shouldReceiveMention(member.userId));

  if (mentionRecipients.length === 0) {
    return;
  }

  await prisma.messageMention.createMany({
    data: mentionRecipients.map((member) => ({
      messageId: args.messageId,
      userId: member.userId,
    })),
    skipDuplicates: true,
  });

  await Promise.all(
    mentionRecipients.map((member) =>
      prisma.channelReadState.upsert({
        where: {
          channelId_userId: {
            channelId: args.channelId,
            userId: member.userId,
          },
        },
        create: {
          channelId: args.channelId,
          lastReadAt: member.joinedAt,
          mentionCount: 1,
          userId: member.userId,
        },
        update: {
          mentionCount: {
            increment: 1,
          },
        },
      }),
    ),
  );

  const notifications = await Promise.all(
    mentionRecipients.map(async (member) => {
      const locale = normalizeAppLocale(member.user.locale);
      const notification = await prisma.notification.create({
        data: {
          actionUrl: `/channels/${args.serverId}/${args.channelId}`,
          body: translate(locale, "chat.mentions.notifyBody", {
            channel: args.channelName,
            name: args.senderName,
          }),
          metadata: {
            channelId: args.channelId,
            messageId: args.messageId,
            senderId: args.senderId,
            serverId: args.serverId,
          },
          title: translate(locale, "chat.mentions.notifyTitle"),
          type: "MENTION",
          userId: member.userId,
        },
      });

      return {
        payload: serializeNotification(notification as NotificationRecord),
        userId: member.userId,
      };
    }),
  );

  for (const notification of notifications) {
    args.io.to(`user:${notification.userId}`).emit("notification:new", notification.payload);
    void emitServerUnreadUpdateToUser(notification.userId, args.serverId).catch(() => undefined);
  }
}

async function createChannelThreadReplyNotification(args: {
  channelId: string;
  channelName: string;
  content: string;
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  parentMessageId: string;
  senderId: string;
  senderName: string;
  serverId: string;
}) {
  const parent = await prisma.message.findFirst({
    where: {
      id: args.parentMessageId,
      channelId: args.channelId,
      deletedAt: null,
      userId: { not: args.senderId },
    },
    select: {
      userId: true,
      author: {
        select: {
          locale: true,
        },
      },
    },
  });

  if (!parent) {
    return;
  }

  const [visibleParentUserId] = await filterUserIdsByChannelPermission(
    args.channelId,
    [parent.userId],
    PermissionBits.VIEW_CHANNEL,
  );
  if (!visibleParentUserId) {
    return;
  }

  const locale = normalizeAppLocale(parent.author.locale);
  const notification = await prisma.notification.create({
    data: {
      actionUrl: `/channels/${args.serverId}/${args.channelId}?thread=${args.parentMessageId}`,
      body: translate(locale, "chat.thread.notifyBody", {
        channel: args.channelName,
        name: args.senderName,
      }),
      metadata: {
        channelId: args.channelId,
        parentMessageId: args.parentMessageId,
        serverId: args.serverId,
        threadReplyPreview: args.content.slice(0, 180),
      },
      title: translate(locale, "chat.thread.notifyTitle"),
      type: "SYSTEM",
      userId: parent.userId,
    },
  });

  args.io.to(`user:${parent.userId}`).emit(
    "notification:new",
    serializeNotification(notification as NotificationRecord),
  );
}

async function listServerIds(userId: string) {
  const memberships = await prisma.serverMember.findMany({
    where: {
      userId,
      server: {
        bans: {
          none: { userId },
        },
      },
    },
    select: { serverId: true },
  });

  return memberships.map((membership) => membership.serverId);
}

export function initSocketServer(httpServer: HTTPServer) {
  const allowedSocketOrigins = getSocketAllowedOrigins();
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
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
  });
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

  const redis = getRedis();
  const redisSub = getRedisSub();
  io.adapter(createAdapter(redis, redisSub));

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    const dmTypingConversations = new Set<string>();
    const dmTypingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
    const presenceHeartbeat = setInterval(() => {
      void markPresenceSocketActive(redis, userId, socket.id).catch((error) => {
        logError("[socket] Presence heartbeat error", error);
      });
    }, 60_000);
    socket.data.typingChannels = new Set<string>();
    socket.data.voiceRooms = new Set<string>();
    socket.data.presenceCustomStatus = socket.data.presenceCustomStatus ?? null;
    socket.data.presenceStatus = socket.data.presenceStatus ?? "OFFLINE";
    socket.join(`user:${userId}`);
    void (async () => {
      try {
        const serverIds = await listServerIds(userId);
        for (const serverId of serverIds) {
          socket.join(`server:${serverId}`);
        }
      } catch (error) {
        logError("[socket] Server room join error", error);
      }
    })();

    const emitDMError = (
      code:
        | "UNAUTHORIZED"
        | "FORBIDDEN"
        | "BLOCKED"
        | "RATE_LIMITED"
        | "VALIDATION_ERROR"
        | "NOT_FOUND",
      message: string,
    ) => {
      socket.emit("dm:error", { code, message });
    };

    const emitSocketError = (code: string, fallbackMessage: string, error: unknown) => {
      if (error instanceof ApiError) {
        socket.emit("error", {
          code: error.code ?? code,
          message: error.message,
        });
        return;
      }

      logError(`[socket] ${code}`, error);
      socket.emit("error", {
        code,
        message: fallbackMessage,
      });
    };

    const emitVoiceInviteError = (input: {
      channelId?: string | undefined;
      code: string;
      error?: unknown;
      fallbackMessage: string;
      inviteId?: string | undefined;
      targetUserId?: string | undefined;
    }) => {
      if (input.error instanceof ApiError) {
        const payload: VoiceInviteErrorPayload = {
          code: input.error.code ?? input.code,
          message: input.error.message,
        };
        if (input.channelId) {
          payload.channelId = input.channelId;
        }
        if (input.inviteId) {
          payload.inviteId = input.inviteId;
        }
        if (input.targetUserId) {
          payload.targetUserId = input.targetUserId;
        }
        socket.emit("voice:invite:error", payload);
        return;
      }

      if (input.error) {
        logError(`[socket] ${input.code}`, input.error);
      }

      const payload: VoiceInviteErrorPayload = {
        code: input.code,
        message: input.fallbackMessage,
      };
      if (input.channelId) {
        payload.channelId = input.channelId;
      }
      if (input.inviteId) {
        payload.inviteId = input.inviteId;
      }
      if (input.targetUserId) {
        payload.targetUserId = input.targetUserId;
      }
      socket.emit("voice:invite:error", payload);
    };

    const emitSafeDMError = (
      code:
        | "UNAUTHORIZED"
        | "FORBIDDEN"
        | "BLOCKED"
        | "RATE_LIMITED"
        | "VALIDATION_ERROR"
        | "NOT_FOUND",
      fallbackMessage: string,
      error: unknown,
    ) => {
      if (error instanceof ApiError) {
        const apiCode =
          error.code === "UNAUTHORIZED" ||
          error.code === "FORBIDDEN" ||
          error.code === "BLOCKED" ||
          error.code === "RATE_LIMITED" ||
          error.code === "VALIDATION_ERROR" ||
          error.code === "NOT_FOUND"
            ? error.code
            : code;
        emitDMError(apiCode, error.message);
        return;
      }

      logError(`[socket] dm:${code}`, error);
      emitDMError(code, fallbackMessage);
    };

    async function requireDMParticipant(conversationId: string): Promise<boolean> {
      const participant = await prisma.dMParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        select: { id: true },
      });

      return participant !== null;
    }

    async function getAuthorizedDMParticipants(conversationId: string) {
      const participants = await prisma.dMParticipant.findMany({
        where: { conversationId },
        select: {
          userId: true,
          user: {
            select: {
              displayName: true,
              username: true,
            },
          },
        },
      });

      if (!participants.some((participant) => participant.userId === userId)) {
        return null;
      }

      return participants;
    }

    async function requireUnblockedDMParticipants(conversationId: string) {
      const participants = await getAuthorizedDMParticipants(conversationId);
      if (!participants) {
        return null;
      }

      const otherParticipants = participants.filter((participant) => participant.userId !== userId);
      for (const participant of otherParticipants) {
        const blockStatus = await getBlockStatus(userId, participant.userId);
        if (blockStatus.blocked) {
          throw new ApiError("You cannot use this DM while a block is active", 403, "BLOCKED");
        }
      }

      return participants;
    }

    async function ensureChannelMembership(channelId: string) {
      const { channel } = await requireChannelPermissionForUser(
        userId,
        channelId,
        PermissionBits.VIEW_CHANNEL,
        {
          forbiddenCode: "FORBIDDEN",
          forbiddenMessage: "You do not have access to this channel.",
        },
      );

      return {
        channelId,
        serverId: channel.serverId,
      };
    }

    async function emitToChannelViewers<EventName extends keyof ServerToClientEvents>(
      channelId: string,
      event: EventName,
      ...args: Parameters<ServerToClientEvents[EventName]>
    ) {
      const viewerUserIds = await filterUserIdsByChannelPermission(
        channelId,
        getActiveChannelViewerUserIds(channelId),
        PermissionBits.VIEW_CHANNEL,
      );

      for (const viewerUserId of viewerUserIds) {
        io.to(`user:${viewerUserId}`).emit(event, ...args);
      }
    }

    async function getChannelTypingUsers(channelId: string) {
      const key = `typing:${channelId}`;
      const typingData = await redis.hgetall(key);
      const now = Date.now();
      const expiredUserIds: string[] = [];
      const activeUserIds = Object.entries(typingData)
        .filter(([typingUserId, expiry]) => {
          const expiresAt = Number.parseInt(expiry, 10);
          const isActive = Number.isFinite(expiresAt) && expiresAt > now;
          if (!isActive) {
            expiredUserIds.push(typingUserId);
          }
          return isActive;
        })
        .map(([typingUserId]) => typingUserId);

      if (expiredUserIds.length > 0) {
        await redis.hdel(key, ...expiredUserIds);
      }

      if (activeUserIds.length === 0) {
        return [];
      }

      const users = await prisma.user.findMany({
        where: { id: { in: activeUserIds } },
        select: {
          displayName: true,
          id: true,
          username: true,
        },
      });

      const userMap = new Map(
        users.map((entry) => [entry.id, entry.displayName ?? entry.username]),
      );

      return activeUserIds.map(
        (typingUserId) =>
          userMap.get(typingUserId) ??
          (typingUserId === userId ? socket.data.displayName : "Someone"),
      );
    }

    async function emitDMTypingUpdate(conversationId: string) {
      const key = `typing:dm:${conversationId}`;
      const entries = await redis.hgetall(key);
      const now = Date.now();
      const expiredUserIds: string[] = [];
      const typingUsers: Array<{ userId: string; username: string }> = [];

      for (const [typingUserId, rawValue] of Object.entries(entries)) {
        const parsed = parseDMTypingEntry(rawValue);
        if (!parsed || parsed.expiresAt <= now) {
          expiredUserIds.push(typingUserId);
          continue;
        }

        typingUsers.push({
          userId: typingUserId,
          username: parsed.username,
        });
      }

      if (expiredUserIds.length > 0) {
        await redis.hdel(key, ...expiredUserIds);
      }

      io.to(`dm:${conversationId}`).emit("dm:typing:update", {
        conversationId,
        typingUsers,
      });
    }

    async function stopDMTyping(conversationId: string) {
      const timeout = dmTypingTimeouts.get(conversationId);
      if (timeout) {
        clearTimeout(timeout);
        dmTypingTimeouts.delete(conversationId);
      }

      dmTypingConversations.delete(conversationId);
      await redis.hdel(`typing:dm:${conversationId}`, userId);
      await emitDMTypingUpdate(conversationId);
    }

    async function startDMTyping(conversationId: string) {
      const key = `typing:dm:${conversationId}`;
      dmTypingConversations.add(conversationId);

      const existingTimeout = dmTypingTimeouts.get(conversationId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      await redis.hset(
        key,
        userId,
        JSON.stringify({
          expiresAt: Date.now() + DM_TYPING_EXPIRY,
          username: socket.data.username,
        }),
      );
      await redis.expire(key, TYPING_KEY_TTL_SECONDS);

      const timeout = setTimeout(() => {
        void stopDMTyping(conversationId);
      }, DM_TYPING_EXPIRY);

      dmTypingTimeouts.set(conversationId, timeout);
      await emitDMTypingUpdate(conversationId);
    }

    async function isTypingEventAllowed(scope: string) {
      try {
        return await checkRateLimit(
          redis,
          `rate:typing:${userId}:${scope}`,
          TYPING_RATE_LIMIT,
          TYPING_RATE_WINDOW_SECONDS,
        );
      } catch (error) {
        logError("[socket] Typing rate limit unavailable", error);
        return false;
      }
    }

    void (async () => {
      try {
        const preferredPresence = await getUserPresenceBroadcast(userId);
        const presence = await cacheUserPresence(
          userId,
          preferredPresence.status,
          preferredPresence.customStatus,
        );
        if (!presence) {
          await redis.del(getPresenceSocketsKey(userId));
          socket.disconnect(true);
          return;
        }
        socket.data.presenceStatus = presence.status;
        socket.data.presenceCustomStatus = presence.customStatus;

        await addPresenceSocket(redis, userId, socket.id);

        await broadcastPresenceUpdateToFriends(presence);
      } catch (error) {
        logError("[socket] Presence connect error", error);
      }
    })();

    socket.on("channel:join", async (rawChannelId: string) => {
      try {
        const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
        const { channel } = await requireChannelPermissionForUser(
          userId,
          channelId,
          PermissionBits.VIEW_CHANNEL,
          {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "You do not have access to this channel.",
          },
        );

        socket.join(channelId);
        socket.join(`server:${channel.serverId}`);
      } catch (error) {
        emitSocketError("CHANNEL_JOIN_ERROR", "Unable to join channel.", error);
      }
    });

    socket.on("channel:leave", (rawChannelId: string) => {
      try {
        const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
        socket.leave(channelId);
      } catch (error) {
        emitSocketError("VALIDATION_ERROR", "Invalid channel payload.", error);
      }
    });

    socket.on("voice:join", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketVoiceChannelPayloadSchema, rawData);
        await requireChannelPermissionForUser(
          userId,
          data.channelId,
          PermissionBits.CONNECT_VOICE,
          {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "You are not allowed to join this voice channel.",
            lockedCode: "VOICE_CHANNEL_LOCKED",
            lockedMessage: "You are not allowed to use this locked voice channel.",
            requiredServerId: data.serverId,
            requiredType: ChannelType.VOICE,
            respectLocked: true,
          },
        );

        socket.join(`voice:${data.channelId}`);
        socket.data.voiceRooms.add(data.channelId);
      } catch (error) {
        emitSocketError("VOICE_JOIN_ERROR", "Unable to join voice room.", error);
      }
    });

    socket.on("voice:leave", (rawData) => {
      try {
        const data = parseSocketPayload(SocketVoiceChannelPayloadSchema, rawData);
        socket.leave(`voice:${data.channelId}`);
        socket.data.voiceRooms.delete(data.channelId);
      } catch (error) {
        emitSocketError("VALIDATION_ERROR", "Invalid voice room payload.", error);
      }
    });

    socket.on("voice:audio-level:update", (rawData) => {
      try {
        const data = parseSocketPayload(SocketVoiceAudioLevelPayloadSchema, rawData);
        if (!socket.data.voiceRooms.has(data.channelId)) {
          return;
        }

        const now = Date.now();
        if (
          socket.data.lastVoiceAudioLevelAt &&
          now - socket.data.lastVoiceAudioLevelAt < VOICE_AUDIO_LEVEL_MIN_INTERVAL_MS
        ) {
          return;
        }

        socket.data.lastVoiceAudioLevelAt = now;
        socket.to(`voice:${data.channelId}`).emit("voice:audio-level:update", {
          audioLevel: data.audioLevel,
          channelId: data.channelId,
          isMuted: data.isMuted,
          isSpeaking: data.isSpeaking,
          userId,
        });
      } catch (error) {
        emitSocketError("VALIDATION_ERROR", "Invalid voice audio level payload.", error);
      }
    });

    socket.on("voice:invite:accept", async (rawData) => {
      let data: ReturnType<typeof SocketVoiceInviteAcceptPayloadSchema.parse> | null = null;
      try {
        data = parseSocketPayload(SocketVoiceInviteAcceptPayloadSchema, rawData);
        const inviteKey = getVoiceInviteKey(data.inviteId);
        const storedInvite = parseStoredVoiceInvite(await redis.get(inviteKey));
        if (
          !storedInvite ||
          storedInvite.channelId !== data.channelId ||
          storedInvite.serverId !== data.serverId ||
          storedInvite.targetUserId !== userId ||
          Date.parse(storedInvite.expiresAt) <= Date.now()
        ) {
          await redis.del(inviteKey).catch(() => undefined);
          throw new ApiError("This voice invite expired.", 410, "VOICE_INVITE_EXPIRED");
        }

        await requireChannelPermissionForUser(
          userId,
          data.channelId,
          PermissionBits.CONNECT_VOICE,
          {
            forbiddenCode: "VOICE_INVITE_FORBIDDEN",
            forbiddenMessage: "You are not allowed to join this voice channel.",
            lockedCode: "VOICE_INVITE_FORBIDDEN",
            lockedMessage: "You are not allowed to join this locked voice channel.",
            requiredServerId: data.serverId,
            requiredType: ChannelType.VOICE,
            respectLocked: true,
          },
        );

        await redis.del(inviteKey).catch(() => undefined);
        socket.emit("voice:invite:accepted", {
          channelId: data.channelId,
          inviteId: data.inviteId,
          serverId: data.serverId,
        });
        io.to(`user:${storedInvite.fromUserId}`).emit("voice:invite:status", {
          channelId: data.channelId,
          inviteId: data.inviteId,
          serverId: data.serverId,
          status: "accepted",
          targetUserId: userId,
        });
      } catch (error) {
        emitVoiceInviteError({
          channelId: data?.channelId,
          code: "VOICE_INVITE_ACCEPT_ERROR",
          error,
          fallbackMessage: "Unable to accept this voice invite.",
          inviteId: data?.inviteId,
        });
      }
    });

    socket.on("voice:invite:decline", async (rawData) => {
      let data: ReturnType<typeof SocketVoiceInviteDeclinePayloadSchema.parse> | null = null;
      try {
        data = parseSocketPayload(SocketVoiceInviteDeclinePayloadSchema, rawData);
        const inviteKey = getVoiceInviteKey(data.inviteId);
        const storedInvite = parseStoredVoiceInvite(await redis.get(inviteKey));
        if (
          !storedInvite ||
          storedInvite.channelId !== data.channelId ||
          storedInvite.serverId !== data.serverId ||
          storedInvite.targetUserId !== userId
        ) {
          return;
        }

        await redis.del(inviteKey).catch(() => undefined);
        io.to(`user:${storedInvite.fromUserId}`).emit("voice:invite:status", {
          channelId: data.channelId,
          inviteId: data.inviteId,
          serverId: data.serverId,
          status: "declined",
          targetUserId: userId,
        });
      } catch (error) {
        emitVoiceInviteError({
          channelId: data?.channelId,
          code: "VOICE_INVITE_DECLINE_ERROR",
          error,
          fallbackMessage: "Unable to decline this voice invite.",
          inviteId: data?.inviteId,
        });
      }
    });

    socket.on("voice:invite:send", async (rawData) => {
      let data: ReturnType<typeof SocketVoiceInvitePayloadSchema.parse> | null = null;
      try {
        data = parseSocketPayload(SocketVoiceInvitePayloadSchema, rawData);
        if (data.targetUserId === userId) {
          throw new ApiError("You cannot invite yourself to voice.", 400, "VOICE_INVITE_SELF");
        }

        const isAllowed = await checkRateLimit(
          redis,
          `rate:voice:invite:${userId}`,
          VOICE_INVITE_RATE_LIMIT,
          VOICE_INVITE_RATE_WINDOW_SECONDS,
        );
        if (!isAllowed) {
          throw new ApiError(
            "Too many voice invites. Please wait a moment before inviting again.",
            429,
            "VOICE_INVITE_RATE_LIMITED",
          );
        }

        await requireChannelPermissionForUser(
          userId,
          data.channelId,
          PermissionBits.CONNECT_VOICE,
          {
            forbiddenCode: "VOICE_INVITE_FORBIDDEN",
            forbiddenMessage: "You are not allowed to invite members to this voice channel.",
            lockedCode: "VOICE_INVITE_FORBIDDEN",
            lockedMessage: "You are not allowed to invite members to this locked voice channel.",
            requiredServerId: data.serverId,
            requiredType: ChannelType.VOICE,
            respectLocked: true,
          },
        );

        const senderVoiceState = await prisma.voiceState.findUnique({
          where: { userId },
          select: { channelId: true, serverId: true },
        });
        if (
          !senderVoiceState ||
          senderVoiceState.channelId !== data.channelId ||
          senderVoiceState.serverId !== data.serverId
        ) {
          throw new ApiError(
            "Join this voice channel before inviting members.",
            403,
            "VOICE_INVITE_SENDER_NOT_IN_CHANNEL",
          );
        }

        const [channel, sender, targetMember, targetVoiceState] = await Promise.all([
          prisma.channel.findFirst({
            where: {
              id: data.channelId,
              serverId: data.serverId,
              type: ChannelType.VOICE,
            },
            select: {
              id: true,
              name: true,
              server: { select: { name: true } },
              serverId: true,
            },
          }),
          prisma.user.findUnique({
            where: { id: userId },
            select: {
              avatarUrl: true,
              displayName: true,
              username: true,
            },
          }),
          prisma.serverMember.findUnique({
            where: {
              userId_serverId: {
                serverId: data.serverId,
                userId: data.targetUserId,
              },
            },
            select: {
              user: {
                select: {
                  customStatus: true,
                  emailVerified: true,
                  id: true,
                  isBanned: true,
                  status: true,
                },
              },
              userId: true,
            },
          }),
          prisma.voiceState.findUnique({
            where: { userId: data.targetUserId },
            select: { channelId: true },
          }),
        ]);

        if (!channel?.serverId || !channel.server) {
          throw new ApiError("Voice channel not found.", 404, "VOICE_CHANNEL_NOT_FOUND");
        }
        if (!sender) {
          throw new ApiError("Unable to load sender profile.", 404, "VOICE_INVITE_SENDER_NOT_FOUND");
        }
        if (!targetMember || !isActiveAuthUser(targetMember.user)) {
          throw new ApiError(
            "This member cannot receive voice invites.",
            404,
            "VOICE_INVITE_TARGET_NOT_FOUND",
          );
        }
        if (targetVoiceState?.channelId === data.channelId) {
          throw new ApiError(
            "This member is already in the voice channel.",
            409,
            "VOICE_INVITE_TARGET_ALREADY_JOINED",
          );
        }

        const [targetAllowedUserId] = await filterUserIdsByChannelPermission(
          data.channelId,
          [data.targetUserId],
          PermissionBits.CONNECT_VOICE,
          { respectLocked: true },
        );
        if (!targetAllowedUserId) {
          throw new ApiError(
            "This member does not have access to this voice channel.",
            403,
            "VOICE_INVITE_TARGET_FORBIDDEN",
          );
        }

        const targetPresence = await readPresenceMap(redis, [
          {
            customStatus: targetMember.user.customStatus,
            status: toVisiblePresenceStatus(targetMember.user.status),
            userId: data.targetUserId,
          },
        ]);
        if (targetPresence.get(data.targetUserId)?.status === "OFFLINE") {
          throw new ApiError(
            "This member is currently offline.",
            409,
            "VOICE_INVITE_TARGET_OFFLINE",
          );
        }

        const expiresAt = new Date(Date.now() + VOICE_INVITE_TTL_MS).toISOString();
        const inviteId = randomUUID();
        const invite = {
          channelId: channel.id,
          channelName: channel.name,
          createdAt: new Date().toISOString(),
          expiresAt,
          fromUser: {
            avatarUrl: sender.avatarUrl,
            displayName: sender.displayName ?? sender.username,
            id: userId,
            username: sender.username,
          },
          id: inviteId,
          serverId: channel.serverId,
          serverName: channel.server.name,
        };

        await redis.set(
          getVoiceInviteKey(inviteId),
          JSON.stringify({
            channelId: channel.id,
            expiresAt,
            fromUserId: userId,
            serverId: channel.serverId,
            targetUserId: data.targetUserId,
          } satisfies StoredVoiceInvite),
          "PX",
          VOICE_INVITE_TTL_MS,
        );

        io.to(`user:${data.targetUserId}`).emit("voice:invite:received", invite);
        socket.emit("voice:invite:sent", {
          channelId: data.channelId,
          expiresAt,
          inviteId,
          targetUserId: data.targetUserId,
        });
      } catch (error) {
        emitVoiceInviteError({
          channelId: data?.channelId,
          code: "VOICE_INVITE_SEND_ERROR",
          error,
          fallbackMessage: "Unable to send this voice invite.",
          targetUserId: data?.targetUserId,
        });
      }
    });

    socket.on("voice:screenshare:update", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketVoiceScreenSharePayloadSchema, rawData);
        await requireChannelPermissionForUser(
          userId,
          data.channelId,
          PermissionBits.CONNECT_VOICE,
          {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "You are not allowed to join this voice channel.",
            lockedCode: "VOICE_CHANNEL_LOCKED",
            lockedMessage: "You are not allowed to use this locked voice channel.",
            requiredServerId: data.serverId,
            requiredType: ChannelType.VOICE,
            respectLocked: true,
          },
        );
        await requireChannelPermissionForUser(
          userId,
          data.channelId,
          PermissionBits.STREAM,
          {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "You are not allowed to stream in this voice channel.",
            requiredServerId: data.serverId,
            requiredType: ChannelType.VOICE,
          },
        );

        const screenShareStateKey = getVoiceScreenShareStateKey(data.channelId, userId);
        if (data.isScreenSharing) {
          await redis.set(
            screenShareStateKey,
            "1",
            "EX",
            VOICE_SCREEN_SHARE_STATE_TTL_SECONDS,
          );
        } else {
          await redis.del(screenShareStateKey);
        }

        await emitVoiceScreenShareUpdate({
          channelId: data.channelId,
          isScreenSharing: data.isScreenSharing,
          userId,
        });
      } catch (error) {
        emitSocketError(
          "VOICE_SCREENSHARE_UPDATE_ERROR",
          "Unable to update voice screen sharing state.",
          error,
        );
      }
    });

    socket.on("message:send", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketMessageSendPayloadSchema, rawData);
        try {
          const isAllowed = await checkRateLimit(redis, `rate:msg:${userId}`, 30, 60);
          if (!isAllowed) {
            socket.emit("error", {
              code: "RATE_LIMIT",
              message: "Too many messages. Maximum 30 per minute.",
            });
            return;
          }
        } catch (rateLimitError) {
          logError("[socket] Message rate limit unavailable", rateLimitError);
          socket.emit("error", {
            code: "RATE_LIMIT_UNAVAILABLE",
            message: "Message checks are temporarily unavailable. Please try again shortly.",
          });
          return;
        }

        const { channel: permissionChannel, permissions } = await requireChannelPermissionForUser(
          userId,
          data.channelId,
          PermissionBits.SEND_MESSAGES,
          {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "You cannot send messages in this channel.",
            lockedCode: "CHANNEL_LOCKED",
            lockedMessage: "This channel is read-only.",
            requiredType: ChannelType.TEXT,
            respectLocked: true,
          },
        );
        const channel = await prisma.channel.findUnique({
          where: { id: data.channelId },
          select: {
            name: true,
            server: {
              select: {
                features: true,
                messageCharacterLimit: true,
              },
            },
          },
        });

        if (!channel?.server) {
          socket.emit("error", { code: "CHANNEL_NOT_FOUND", message: "Channel not found" });
          return;
        }

        const canBypassMessageLimit =
          hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);

        const attachmentInputs = parseUploadedAttachmentInputs(data.attachments);
        const mediaSettings = getServerMediaSettings(channel.server?.features ?? []);

        if (attachmentInputs.length > 0) {
          const attachments = await prisma.attachment.findMany({
            where: {
              id: { in: attachmentInputs.map((attachment) => attachment.id) },
              userId,
            },
            select: {
              contentType: true,
            },
          });

          if (!mediaSettings.allowGifs && attachments.some((attachment) => isMessageGifContentType(attachment.contentType))) {
            throw new ApiError("GIFs are disabled for this server.", 403, "GIFS_DISABLED");
          }

          if (
            !hasPermission(permissions, PermissionBits.USE_GIFS) &&
            attachments.some((attachment) => isMessageGifContentType(attachment.contentType))
          ) {
            throw new ApiError("You cannot send GIFs in this channel.", 403, "GIFS_FORBIDDEN");
          }

          if (!mediaSettings.allowFileUploads && attachments.some((attachment) => !isMessageGifContentType(attachment.contentType))) {
            throw new ApiError("File uploads are disabled for this server.", 403, "FILE_UPLOADS_DISABLED");
          }

          if (
            !hasPermission(permissions, PermissionBits.ATTACH_FILES) &&
            attachments.some((attachment) => !isMessageGifContentType(attachment.contentType))
          ) {
            throw new ApiError("You cannot attach files in this channel.", 403, "ATTACHMENTS_FORBIDDEN");
          }
        }

        const content = normalizeMessageContentForSend(
          data.content,
          attachmentInputs,
          canBypassMessageLimit ? null : channel.server?.messageCharacterLimit ?? 2000,
        );
        const message = await createMessage(
          data.channelId,
          userId,
          content,
          data.replyToId,
          attachmentInputs,
          data.threadParentId,
        );
        const messageCreatedAt = new Date(message.createdAt);
        const activeChannelViewerUserIds = await filterUserIdsByChannelPermission(
          data.channelId,
          getActiveChannelViewerUserIds(data.channelId),
          PermissionBits.VIEW_CHANNEL,
        );
        const readUserIds = [userId, ...activeChannelViewerUserIds];

        await markChannelReadStates({
          channelId: data.channelId,
          lastReadAt: messageCreatedAt,
          lastReadMessageId: message.id,
          userIds: readUserIds,
        });

        const readUserIdSet = new Set(readUserIds);
        const activeServerMemberUserIds = await getActiveServerMemberUserIds(permissionChannel.serverId);
        const permittedUnreadUserIds = await filterUserIdsByChannelPermission(
          data.channelId,
          activeServerMemberUserIds,
          PermissionBits.VIEW_CHANNEL,
        );
        const unreadUpdateUserIds = permittedUnreadUserIds.filter(
          (memberUserId) => !readUserIdSet.has(memberUserId),
        );

        await emitServerUnreadUpdatesForServer(permissionChannel.serverId, unreadUpdateUserIds);
        void createChannelMentionNotifications({
          channelId: data.channelId,
          channelName: channel.name,
          content,
          io,
          messageId: message.id,
          senderId: userId,
          senderName: message.author.displayName ?? message.author.username,
          serverId: permissionChannel.serverId,
          skipUserIds: readUserIds,
        }).catch(() => undefined);
        if (data.threadParentId) {
          void createChannelThreadReplyNotification({
            channelId: data.channelId,
            channelName: channel.name,
            content,
            io,
            parentMessageId: data.threadParentId,
            senderId: userId,
            senderName: message.author.displayName ?? message.author.username,
            serverId: permissionChannel.serverId,
          }).catch(() => undefined);
        }
        await emitToChannelViewers(data.channelId, "message:new", message);
      } catch (error) {
        if (error instanceof ApiError) {
          socket.emit("error", {
            code: error.code ?? "MESSAGE_VALIDATION_ERROR",
            message: error.message,
          });
          return;
        }

        emitSocketError("MESSAGE_SEND_ERROR", "Unable to send message.", error);
      }
    });

    socket.on("message:edit", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketMessageEditPayloadSchema, rawData);
        const existing = await prisma.message.findUnique({
          where: { id: data.messageId },
          select: {
            channelId: true,
            channel: {
              select: {
                server: {
                  select: {
                    messageCharacterLimit: true,
                    ownerId: true,
                  },
                },
                serverId: true,
              },
            },
          },
        });

        if (!existing?.channel.serverId || !existing.channel.server) {
          socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
          return;
        }

        const { permissions } = await requireChannelPermissionForUser(
          userId,
          existing.channelId,
          PermissionBits.SEND_MESSAGES,
          {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "Cannot edit this message",
            lockedCode: "CHANNEL_LOCKED",
            lockedMessage: "This channel is read-only.",
            requiredType: ChannelType.TEXT,
            respectLocked: true,
          },
        );
        const canBypassMessageLimit =
          hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);

        const message = await editMessage(
          data.messageId,
          userId,
          data.content,
          canBypassMessageLimit ? null : existing.channel.server.messageCharacterLimit,
        );
        await emitToChannelViewers(message.channelId, "message:updated", message);
      } catch (error) {
        emitSocketError("MESSAGE_EDIT_ERROR", "Unable to edit message.", error);
      }
    });

    socket.on("message:delete", async (rawMessageId: string) => {
      try {
        const messageId = parseSocketPayload(SocketIdSchema, rawMessageId);
        const dbMessage = await prisma.message.findFirst({
          where: { id: messageId, placeholderRemovedAt: null },
          select: {
            channelId: true,
            isPinned: true,
            userId: true,
            channel: {
              select: {
                serverId: true,
                server: { select: { ownerId: true } },
              },
            },
          },
        });

        if (!dbMessage?.channel.serverId) {
          socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
          return;
        }

        const { permissions } = await requireChannelPermissionForUser(
          userId,
          dbMessage.channelId,
          PermissionBits.VIEW_CHANNEL,
          {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "You do not have access to this channel.",
            requiredType: ChannelType.TEXT,
          },
        );
        const isAdmin = hasPermission(permissions, PermissionBits.MANAGE_MESSAGES);

        const deleteResult = await deleteMessage(messageId, userId, isAdmin);

        if (deleteResult.status === "removed") {
          await emitToChannelViewers(dbMessage.channelId, "message:removed", {
            messageId,
            channelId: dbMessage.channelId,
          });
        } else {
          await emitToChannelViewers(dbMessage.channelId, "message:deleted", {
            messageId,
            channelId: dbMessage.channelId,
            deletedById: userId,
            placeholderExpiresAt: deleteResult.placeholderExpiresAt,
          });
        }

        if (dbMessage.isPinned) {
          await emitToChannelViewers(dbMessage.channelId, "message:pins_updated", {
            channelId: dbMessage.channelId,
          });
        }
      } catch (error) {
        emitSocketError("MESSAGE_DELETE_ERROR", "Unable to delete message.", error);
      }
    });

    socket.on("message:react", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketMessageReactionPayloadSchema, rawData);
        const message = await prisma.message.findFirst({
          where: { deletedAt: null, id: data.messageId, placeholderRemovedAt: null },
          select: { channelId: true },
        });

        if (!message) {
          socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
          return;
        }

        await ensureChannelMembership(message.channelId);
        const reactions = await setReaction(data.messageId, userId, data.emoji, true);
        await emitToChannelViewers(message.channelId, "message:reaction_updated", {
          messageId: data.messageId,
          reactions,
        });
      } catch (error) {
        emitSocketError("MESSAGE_REACT_ERROR", "Unable to update reactions.", error);
      }
    });

    socket.on("message:unreact", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketMessageReactionPayloadSchema, rawData);
        const message = await prisma.message.findFirst({
          where: { deletedAt: null, id: data.messageId, placeholderRemovedAt: null },
          select: { channelId: true },
        });

        if (!message) {
          socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
          return;
        }

        await ensureChannelMembership(message.channelId);
        const reactions = await setReaction(data.messageId, userId, data.emoji, false);
        await emitToChannelViewers(message.channelId, "message:reaction_updated", {
          messageId: data.messageId,
          reactions,
        });
      } catch (error) {
        emitSocketError("MESSAGE_UNREACT_ERROR", "Unable to update reactions.", error);
      }
    });

    socket.on("typing:start", async (rawChannelId: string) => {
      try {
        const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
        if (!(await isTypingEventAllowed(`channel:${channelId}`))) {
          return;
        }
        await requireChannelPermissionForUser(
          userId,
          channelId,
          PermissionBits.SEND_MESSAGES,
          {
            forbiddenCode: "FORBIDDEN",
            forbiddenMessage: "You cannot type in this channel.",
            lockedCode: "CHANNEL_LOCKED",
            lockedMessage: "This channel is read-only.",
            requiredType: ChannelType.TEXT,
            respectLocked: true,
          },
        );
        const key = `typing:${channelId}`;
        socket.data.typingChannels.add(channelId);

        await redis.hset(key, userId, Date.now() + CHANNEL_TYPING_EXPIRY);
        await redis.expire(key, TYPING_KEY_TTL_SECONDS);
        const typingUsers = await getChannelTypingUsers(channelId);

        await emitToChannelViewers(channelId, "typing:update", {
          channelId,
          users: typingUsers,
        });
      } catch (error) {
        emitSocketError("TYPING_ERROR", "Unable to update typing state.", error);
      }
    });

    socket.on("typing:stop", async (rawChannelId: string) => {
      try {
        const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
        await ensureChannelMembership(channelId);
        const key = `typing:${channelId}`;
        socket.data.typingChannels.delete(channelId);

        await redis.hdel(key, userId);
        const typingUsers = await getChannelTypingUsers(channelId);

        await emitToChannelViewers(channelId, "typing:update", {
          channelId,
          users: typingUsers,
        });
      } catch (error) {
        emitSocketError("TYPING_ERROR", "Unable to update typing state.", error);
      }
    });

    socket.on("dm:join", async (rawConversationId: string) => {
      try {
        const conversationId = parseSocketPayload(SocketIdSchema, rawConversationId);
        if (!(await requireDMParticipant(conversationId))) {
          emitDMError("FORBIDDEN", "You are not allowed to join this DM");
          return;
        }

        socket.join(`dm:${conversationId}`);
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to join this DM.", error);
      }
    });

    socket.on("dm:leave", async (rawConversationId: string) => {
      try {
        const conversationId = parseSocketPayload(SocketIdSchema, rawConversationId);
        if (!(await requireDMParticipant(conversationId))) {
          emitDMError("FORBIDDEN", "You are not allowed to leave this DM");
          return;
        }

        socket.leave(`dm:${conversationId}`);
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to leave this DM.", error);
      }
    });

    socket.on("dm:screenshare:start", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
        const participants = await requireUnblockedDMParticipants(data.conversationId);
        if (!participants) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        const sender = participants.find((participant) => participant.userId === userId);
        if (!sender) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        for (const participant of participants) {
          if (participant.userId === userId) {
            continue;
          }

          io.to(`user:${participant.userId}`).emit("dm:screenshare:started", {
            conversationId: data.conversationId,
            userId,
            username: sender.user.username,
            displayName: sender.user.displayName,
          });
        }
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to start DM screen sharing.", error);
      }
    });

    socket.on("dm:screenshare:accept", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketDMScreenShareTargetPayloadSchema, rawData);
        const participants = await requireUnblockedDMParticipants(data.conversationId);
        if (!participants) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        const targetParticipant = participants.find(
          (participant) => participant.userId === data.fromUserId,
        );
        if (!targetParticipant || targetParticipant.userId === userId) {
          emitDMError("NOT_FOUND", "Screen share sender was not found.");
          return;
        }

        io.to(`user:${targetParticipant.userId}`).emit("dm:screenshare:accepted", {
          conversationId: data.conversationId,
          userId,
        });
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to accept DM screen sharing.", error);
      }
    });

    socket.on("dm:screenshare:decline", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketDMScreenShareTargetPayloadSchema, rawData);
        const participants = await requireUnblockedDMParticipants(data.conversationId);
        if (!participants) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        const targetParticipant = participants.find(
          (participant) => participant.userId === data.fromUserId,
        );
        if (!targetParticipant || targetParticipant.userId === userId) {
          emitDMError("NOT_FOUND", "Screen share sender was not found.");
          return;
        }

        io.to(`user:${targetParticipant.userId}`).emit("dm:screenshare:declined", {
          conversationId: data.conversationId,
          userId,
        });
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to decline DM screen sharing.", error);
      }
    });

    socket.on("dm:screenshare:stop", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
        const participants = await requireUnblockedDMParticipants(data.conversationId);
        if (!participants) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        for (const participant of participants) {
          if (participant.userId === userId) {
            continue;
          }

          io.to(`user:${participant.userId}`).emit("dm:screenshare:stopped", {
            conversationId: data.conversationId,
            userId,
          });
        }
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to stop DM screen sharing.", error);
      }
    });

    socket.on("dm:message:send", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketDMMessageSendPayloadSchema, rawData);
        if (!(await requireDMParticipant(data.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        try {
          const rateLimitResult = await checkDMMessageRateLimits({
            conversationId: data.conversationId,
            redis,
            userId,
          });

          if (rateLimitResult === "global") {
            emitDMError("RATE_LIMITED", "Too many DM messages. Please slow down.");
            return;
          }

          if (rateLimitResult === "conversation") {
            emitDMError("RATE_LIMITED", "Too many DM messages. Maximum 30 per minute.");
            return;
          }
        } catch (rateLimitError) {
          logError("[socket] DM message rate limit unavailable", rateLimitError);
          emitDMError(
            "RATE_LIMITED",
            "Message checks are temporarily unavailable. Please try again shortly.",
          );
          return;
        }

        let attachmentInputs: UploadedAttachmentInput[];
        let content: string;
        try {
          attachmentInputs = parseUploadedAttachmentInputs(data.attachments);
          content = normalizeMessageContentForSend(data.content, attachmentInputs);
        } catch (validationError) {
          emitDMError(
            "VALIDATION_ERROR",
            validationError instanceof Error
              ? validationError.message
              : "Invalid message payload.",
          );
          return;
        }

        if (data.replyToId) {
          const replyToMessage = await prisma.dMMessage.findFirst({
            where: {
              id: data.replyToId,
              conversationId: data.conversationId,
              deletedAt: null,
              placeholderRemovedAt: null,
            },
            select: { id: true },
          });

          if (!replyToMessage) {
            emitDMError("NOT_FOUND", "Reply target was not found.");
            return;
          }
        }

        if (data.threadParentId) {
          const threadParentMessage = await prisma.dMMessage.findFirst({
            where: {
              id: data.threadParentId,
              conversationId: data.conversationId,
              deletedAt: null,
              placeholderRemovedAt: null,
              threadParentId: null,
            },
            select: { id: true },
          });

          if (!threadParentMessage) {
            emitDMError("NOT_FOUND", "Thread parent message was not found.");
            return;
          }
        }

        const participants = await prisma.dMParticipant.findMany({
          where: { conversationId: data.conversationId },
          select: {
            userId: true,
            user: {
              select: dmNotificationUserSelect,
            },
          },
        });

        const otherParticipant = participants.find((participant) => participant.userId !== userId);
        if (otherParticipant) {
          const blockStatus = await getBlockStatus(userId, otherParticipant.userId);
          if (blockStatus.blocked) {
            emitDMError("BLOCKED", "You cannot send messages in this DM.");
            return;
          }
        }

        const createdMessage = await prisma.$transaction(async (tx) => {
          const createdMessage = await tx.dMMessage.create({
            data: {
              conversationId: data.conversationId,
              userId,
              content,
              replyToId: data.replyToId ?? null,
              threadParentId: data.threadParentId ?? null,
            },
            select: { id: true, createdAt: true },
          });

          await claimUploadedMessageAttachments(tx, userId, attachmentInputs, {
            dmMessageId: createdMessage.id,
          });

          const message = await tx.dMMessage.findUniqueOrThrow({
            where: { id: createdMessage.id },
            include: dmMessageInclude,
          });

          await tx.dMConversation.update({
            where: { id: data.conversationId },
            data: { lastMessageAt: createdMessage.createdAt },
          });

          await Promise.all(
            participants.map((participant) =>
              tx.dMParticipant.update({
                where: {
                  conversationId_userId: {
                    conversationId: data.conversationId,
                    userId: participant.userId,
                  },
                },
                data:
                  participant.userId === userId
                    ? {
                        hiddenAt: null,
                      }
                    : {
                        hiddenAt: null,
                        unreadCount: {
                          increment: 1,
                        },
                      },
              }),
            ),
          );

          return message;
        });

        const messagePayload = mapDMMessagePayload(createdMessage);
        io.to(`dm:${data.conversationId}`).emit("dm:message:new", messagePayload);

        const firstAttachment = createdMessage.attachments[0];
        const attachmentLabelKey =
          firstAttachment && isMessageGifContentType(firstAttachment.contentType)
            ? "chat.attachments.gif"
            : firstAttachment && isMessageImageContentType(firstAttachment.contentType)
            ? "chat.attachments.image"
            : "chat.attachments.file";
        const preview =
          content.length > 0
            ? content.slice(0, 50)
            : firstAttachment && isMessageGifContentType(firstAttachment.contentType)
              ? "GIF"
              : firstAttachment && isMessageImageContentType(firstAttachment.contentType)
              ? "Image"
              : firstAttachment
                ? "File"
                : "";
        const lastMessageAt = createdMessage.createdAt.toISOString();

        const conversationUpdates = await Promise.all(
          participants.map(async (participant) => {
            const conversation = await getDirectMessageConversationForUser(
              data.conversationId,
              participant.userId,
            );
            const currentParticipant = conversation.participants.find(
              (candidate) => candidate.userId === participant.userId,
            );

            return {
              participantId: participant.userId,
              unreadCount: currentParticipant?.unreadCount ?? 0,
              conversation,
            };
          }),
        );

        for (const update of conversationUpdates) {
          io.to(`user:${update.participantId}`).emit("dm:conversation:updated", {
            conversationId: data.conversationId,
            lastMessageAt,
            preview,
            hiddenAt: null,
            unreadCount: update.unreadCount,
            conversation: update.conversation,
          });
        }

        try {
          const senderName = getDMDisplayName({
            username: socket.data.username,
            displayName: socket.data.displayName,
          });

          const notificationPromises = participants
            .filter((participant) => participant.userId !== userId)
            .map(async (participant) => {
              const locale = normalizeAppLocale(participant.user.locale);
              const notification = await prisma.notification.create({
                data: {
                  userId: participant.userId,
                  type: "DM",
                  title: translate(locale, "dm.notification.title", {
                    name: senderName,
                  }),
                  body:
                    content.length > 0
                      ? content
                      : translate(locale, attachmentLabelKey),
                  actionUrl: `/channels/@me/${data.conversationId}`,
                  metadata: {
                    conversationId: data.conversationId,
                    senderId: userId,
                  },
                },
              });

              return {
                participantId: participant.userId,
                payload: serializeNotification(notification as NotificationRecord),
              };
            });

          const createdNotifications = await Promise.all(notificationPromises);
          for (const notification of createdNotifications) {
            io.to(`user:${notification.participantId}`).emit(
              "notification:new",
              notification.payload,
            );
          }
        } catch (notificationError) {
          logError("[socket] DM notification error", notificationError);
        }

        await stopDMTyping(data.conversationId);
      } catch (error) {
        if (error instanceof ApiError) {
          emitDMError("VALIDATION_ERROR", error.message);
          return;
        }

        emitSafeDMError("NOT_FOUND", "Unable to send DM message.", error);
      }
    });

    socket.on("dm:message:edit", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketMessageEditPayloadSchema, rawData);
        const trimmedContent = data.content;
        if (!trimmedContent || trimmedContent.length > 2000) {
          emitDMError("VALIDATION_ERROR", "Message content must be between 1 and 2000 characters.");
          return;
        }

        const existingMessage = await prisma.dMMessage.findUnique({
          where: { id: data.messageId },
          select: {
            conversationId: true,
            deletedAt: true,
            deletedById: true,
            placeholderRemovedAt: true,
            userId: true,
          },
        });

        if (!existingMessage || existingMessage.deletedAt || existingMessage.placeholderRemovedAt) {
          emitDMError("NOT_FOUND", "Message not found.");
          return;
        }

        if (!(await requireDMParticipant(existingMessage.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        if (existingMessage.userId !== userId) {
          emitDMError("FORBIDDEN", "You can only edit your own DM messages.");
          return;
        }

        try {
          const updatedMessage = await prisma.dMMessage.update({
            where: {
              id: data.messageId,
              userId,
              deletedAt: null,
              placeholderRemovedAt: null,
            },
            data: {
              content: trimmedContent,
              editedAt: new Date(),
            },
            include: dmMessageInclude,
          });

          io.to(`dm:${existingMessage.conversationId}`).emit(
            "dm:message:updated",
            await mapDMMessagePayloadWithReactions(updatedMessage),
          );
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
          ) {
            emitDMError("NOT_FOUND", "Message not found.");
            return;
          }

          throw error;
        }
      } catch (error) {
        emitSafeDMError("NOT_FOUND", "Unable to edit DM message.", error);
      }
    });

    socket.on("dm:message:delete", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketMessageDeletePayloadSchema, rawData);
        const existingMessage = await prisma.dMMessage.findUnique({
          where: { id: data.messageId },
          select: {
            conversationId: true,
            deletedAt: true,
            deletedById: true,
            placeholderRemovedAt: true,
            userId: true,
          },
        });

        if (!existingMessage || existingMessage.placeholderRemovedAt) {
          emitDMError("NOT_FOUND", "Message not found.");
          return;
        }

        if (!(await requireDMParticipant(existingMessage.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        if (existingMessage.deletedAt) {
          const canRemovePlaceholder =
            existingMessage.deletedById === userId ||
            (!existingMessage.deletedById && existingMessage.userId === userId);

          if (!canRemovePlaceholder) {
            emitDMError("FORBIDDEN", "You can only remove your own deleted DM notices.");
            return;
          }

          const removeResult = await prisma.dMMessage.updateMany({
            where: {
              deletedAt: { not: null },
              id: data.messageId,
              placeholderRemovedAt: null,
            },
            data: {
              placeholderRemovedAt: new Date(),
            },
          });

          if (removeResult.count !== 1) {
            emitDMError("NOT_FOUND", "Message not found.");
            return;
          }

          io.to(`dm:${existingMessage.conversationId}`).emit("dm:message:removed", {
            messageId: data.messageId,
            conversationId: existingMessage.conversationId,
          });
          return;
        }

        if (existingMessage.userId !== userId) {
          emitDMError("FORBIDDEN", "You can only delete your own DM messages.");
          return;
        }

        try {
          await prisma.dMMessage.update({
            where: {
              id: data.messageId,
              userId,
              deletedAt: null,
              placeholderRemovedAt: null,
            },
            data: {
              deletedAt: new Date(),
              deletedById: userId,
            },
          });

          io.to(`dm:${existingMessage.conversationId}`).emit("dm:message:deleted", {
            messageId: data.messageId,
            conversationId: existingMessage.conversationId,
            deletedById: userId,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
          ) {
            emitDMError("NOT_FOUND", "Message not found.");
            return;
          }

          throw error;
        }
      } catch (error) {
        emitSafeDMError("NOT_FOUND", "Unable to delete DM message.", error);
      }
    });

    const handleDMReaction = async (rawData: unknown, shouldReact: boolean) => {
      try {
        const data = parseSocketPayload(SocketMessageReactionPayloadSchema, rawData);
        const message = await prisma.dMMessage.findUnique({
          where: { id: data.messageId },
          select: {
            conversationId: true,
            deletedAt: true,
            placeholderRemovedAt: true,
          },
        });

        if (!message || message.deletedAt || message.placeholderRemovedAt) {
          emitDMError("NOT_FOUND", "Message not found.");
          return;
        }

        if (!(await requireDMParticipant(message.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        const reactions = await setDMReaction(data.messageId, userId, data.emoji, shouldReact);
        io.to(`dm:${message.conversationId}`).emit("dm:message:reaction_updated", {
          messageId: data.messageId,
          reactions,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          emitDMError(
            error.status === 403
              ? "FORBIDDEN"
              : error.status === 404
                ? "NOT_FOUND"
                : "VALIDATION_ERROR",
            error.message,
          );
          return;
        }

        emitSafeDMError("NOT_FOUND", "Unable to update DM reactions.", error);
      }
    };

    socket.on("dm:message:react", (rawData) => {
      void handleDMReaction(rawData, true);
    });
    socket.on("dm:message:unreact", (rawData) => {
      void handleDMReaction(rawData, false);
    });

    socket.on("dm:typing:start", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
        if (!(await isTypingEventAllowed(`dm:${data.conversationId}`))) {
          return;
        }
        if (!(await requireDMParticipant(data.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        await startDMTyping(data.conversationId);
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to update DM typing state.", error);
      }
    });

    socket.on("dm:typing:stop", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
        if (!(await requireDMParticipant(data.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        await stopDMTyping(data.conversationId);
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to update DM typing state.", error);
      }
    });

    socket.on("presence:activity", async (rawData) => {
      try {
        const data = parseSocketPayload(SocketPresenceActivityPayloadSchema, rawData);
        const preferredPresence = await getUserPresenceBroadcast(userId);

        if (preferredPresence.status === "DND" || preferredPresence.status === "OFFLINE") {
          return;
        }

        if (data.status === "ONLINE" && preferredPresence.status === "IDLE") {
          return;
        }

        const presence = await cacheUserPresence(
          userId,
          data.status,
          preferredPresence.customStatus,
        );

        if (!presence) {
          await redis.del(getPresenceSocketsKey(userId));
          socket.disconnect(true);
          return;
        }

        socket.data.presenceStatus = presence.status;
        socket.data.presenceCustomStatus = presence.customStatus;
        await markPresenceSocketActive(redis, userId, socket.id);
        await broadcastPresenceUpdateToFriends(presence);
      } catch (error) {
        emitSocketError("PRESENCE_UPDATE_ERROR", "Unable to update presence.", error);
      }
    });

    socket.on("disconnect", async () => {
      try {
        clearInterval(presenceHeartbeat);
        const channelTypingCleanups = Array.from(socket.data.typingChannels).map((channelId) =>
          redis.hdel(`typing:${channelId}`, userId),
        );
        await Promise.all(channelTypingCleanups);

        for (const timeout of dmTypingTimeouts.values()) {
          clearTimeout(timeout);
        }
        dmTypingTimeouts.clear();

        await Promise.all(
          Array.from(dmTypingConversations).map((conversationId) => stopDMTyping(conversationId)),
        );

        const nextSocketCount = await removePresenceSocket(redis, userId, socket.id);

        if (nextSocketCount <= 0) {
          const presence = await cacheUserPresence(
            userId,
            "OFFLINE",
            socket.data.presenceCustomStatus,
          );
          if (presence) {
            await broadcastPresenceUpdateToFriends(presence);
          }
        }
      } catch (error) {
        logError("[socket] Disconnect cleanup error", error);
      }
    });
  });

  return io;
}
