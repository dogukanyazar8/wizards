import type { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getToken } from "next-auth/jwt";
import { Prisma, prisma } from "@wizards/db";
import type { UploadedAttachmentInput } from "@wizards/types";
import { ApiError } from "@/lib/api";
import {
  dmMessageInclude,
  dmNotificationUserSelect,
  getDirectMessageConversationForUser,
  getDMDisplayName,
  mapDMMessagePayload,
  mapDMMessagePayloadWithReactions,
  toggleDMReaction,
} from "@/lib/dm/service";
import { getBlockStatus } from "@/lib/friends/helpers";
import {
  broadcastPresenceUpdateToFriends,
  cacheUserPresence,
  getUserPresenceBroadcast,
} from "@/lib/friends/service";
import { normalizeAppLocale, translate } from "@/lib/locale";
import {
  claimUploadedMessageAttachments,
  isMessageGifContentType,
  isMessageImageContentType,
  normalizeMessageContentForSend,
  parseUploadedAttachmentInputs,
} from "@/lib/messages/attachments";
import { getRedis, getRedisSub } from "@/lib/redis";
import { setSocketServer } from "@/lib/socket/runtime";
import {
  getVoiceScreenShareStateKey,
  VOICE_SCREEN_SHARE_STATE_TTL_SECONDS,
} from "@/lib/voice/screen-share-state";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
import { getServerMediaSettings } from "@/lib/workspace/server-features";
import {
  createMessage,
  deleteMessage,
  editMessage,
  toggleReaction,
} from "@/lib/workspace/message-service";
import type {
  ClientToServerEvents,
  InterServerEvents,
  NotificationSocketPayload,
  ServerToClientEvents,
  SocketData,
} from "./events";

const CHANNEL_TYPING_EXPIRY = 3000;
const DM_TYPING_EXPIRY = 3000;
const TYPING_KEY_TTL_SECONDS = 10;
const PRESENCE_SOCKET_PREFIX = "presence:sockets:";

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

function getPresenceSocketsKey(userId: string) {
  return `${PRESENCE_SOCKET_PREFIX}${userId}`;
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
}) {
  const usernames = extractMentionUsernames(args.content);
  if (usernames.length === 0) {
    return;
  }

  const mentionedMembers = await prisma.serverMember.findMany({
    where: {
      serverId: args.serverId,
      userId: { not: args.senderId },
      user: {
        username: {
          in: usernames,
        },
      },
    },
    select: {
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

  await prisma.messageMention.createMany({
    data: mentionedMembers.map((member) => ({
      messageId: args.messageId,
      userId: member.userId,
    })),
    skipDuplicates: true,
  });

  const notifications = await Promise.all(
    mentionedMembers.map(async (member) => {
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
  }
}

async function listServerIds(userId: string) {
  const memberships = await prisma.serverMember.findMany({
    where: { userId },
    select: { serverId: true },
  });

  return memberships.map((membership) => membership.serverId);
}

export function initSocketServer(httpServer: HTTPServer) {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
      credentials: true,
    },
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
          id: true,
          username: true,
        },
      });

      if (!user) {
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
      void redis.expire(getPresenceSocketsKey(userId), 120);
    }, 60_000);
    socket.data.typingChannels = new Set<string>();
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
        console.error("Server room join error:", error);
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

      console.error(`[socket] ${code}`, error);
      socket.emit("error", {
        code,
        message: fallbackMessage,
      });
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
        emitDMError(code, error.message);
        return;
      }

      console.error(`[socket] dm:${code}`, error);
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

    async function ensureChannelMembership(channelId: string) {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true },
      });

      if (!channel?.serverId) {
        throw new ApiError("Channel not found", 404, "CHANNEL_NOT_FOUND");
      }

      const member = await prisma.serverMember.findFirst({
        where: { serverId: channel.serverId, userId },
        select: { id: true, serverId: true },
      });

      if (!member) {
        throw new ApiError("Not a member of this server", 403, "NOT_A_MEMBER");
      }

      return {
        channelId,
        serverId: channel.serverId,
      };
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

        const socketCount = await redis.incr(getPresenceSocketsKey(userId));
        await redis.expire(getPresenceSocketsKey(userId), 120);

        if (socketCount === 1) {
          await broadcastPresenceUpdateToFriends(presence);
        }
      } catch (error) {
        console.error("Presence connect error:", error);
      }
    })();

    socket.on("channel:join", async (channelId: string) => {
      try {
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          select: { serverId: true },
        });

        if (!channel?.serverId) {
          socket.emit("error", { code: "CHANNEL_NOT_FOUND", message: "Channel not found" });
          return;
        }

        const member = await prisma.serverMember.findFirst({
          where: { serverId: channel.serverId, userId },
          select: { id: true },
        });

        if (!member) {
          socket.emit("error", {
            code: "NOT_A_MEMBER",
            message: "Not a member of this server",
          });
          return;
        }

        socket.join(channelId);
        socket.join(`server:${channel.serverId}`);
      } catch (error) {
        emitSocketError("CHANNEL_JOIN_ERROR", "Unable to join channel.", error);
      }
    });

    socket.on("channel:leave", (channelId: string) => {
      socket.leave(channelId);
    });

    socket.on("voice:screenshare:update", async (data) => {
      try {
        if (
          !data ||
          typeof data.channelId !== "string" ||
          typeof data.serverId !== "string" ||
          typeof data.isScreenSharing !== "boolean"
        ) {
          socket.emit("error", {
            code: "VALIDATION_ERROR",
            message: "Invalid voice screen share payload.",
          });
          return;
        }

        const membership = await ensureChannelMembership(data.channelId);
        if (membership.serverId !== data.serverId) {
          socket.emit("error", {
            code: "INVALID_SERVER",
            message: "Voice channel does not belong to this server.",
          });
          return;
        }

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

        io.to(`server:${membership.serverId}`).emit("voice:screenshare:update", {
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

    socket.on("message:send", async (data) => {
      try {
        try {
          const key = `rate:msg:${userId}`;
          const count = await redis.incr(key);
          if (count === 1) {
            await redis.expire(key, 60);
          }
          if (count > 30) {
            socket.emit("error", {
              code: "RATE_LIMIT",
              message: "Too many messages. Maximum 30 per minute.",
            });
            return;
          }
        } catch {
          // Allow message send if Redis is temporarily unavailable.
        }

        const channel = await prisma.channel.findUnique({
          where: { id: data.channelId },
          select: {
            name: true,
            server: {
              select: {
                features: true,
              },
            },
            serverId: true,
          },
        });

        if (!channel?.serverId) {
          socket.emit("error", { code: "CHANNEL_NOT_FOUND", message: "Channel not found" });
          return;
        }

        const member = await prisma.serverMember.findFirst({
          where: { serverId: channel.serverId, userId },
          select: { id: true },
        });

        if (!member) {
          socket.emit("error", {
            code: "NOT_A_MEMBER",
            message: "Not a member of this server",
          });
          return;
        }

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

          if (!mediaSettings.allowFileUploads && attachments.some((attachment) => !isMessageGifContentType(attachment.contentType))) {
            throw new ApiError("File uploads are disabled for this server.", 403, "FILE_UPLOADS_DISABLED");
          }
        }

        const content = normalizeMessageContentForSend(data.content, attachmentInputs);
        const message = await createMessage(
          data.channelId,
          userId,
          content,
          data.replyToId,
          attachmentInputs,
        );
        const messageCreatedAt = new Date(message.createdAt);
        const readUserIds = [userId, ...getActiveChannelViewerUserIds(data.channelId)];

        await markChannelReadStates({
          channelId: data.channelId,
          lastReadAt: messageCreatedAt,
          lastReadMessageId: message.id,
          userIds: readUserIds,
        });

        await emitServerUnreadUpdatesForServer(channel.serverId);
        void createChannelMentionNotifications({
          channelId: data.channelId,
          channelName: channel.name,
          content,
          io,
          messageId: message.id,
          senderId: userId,
          senderName: message.author.displayName ?? message.author.username,
          serverId: channel.serverId,
        }).catch(() => undefined);
        io.to(data.channelId).emit("message:new", message);
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

    socket.on("message:edit", async (data) => {
      try {
        const message = await editMessage(data.messageId, userId, data.content);

        const dbMessage = await prisma.message.findUnique({
          where: { id: data.messageId },
          select: { channelId: true },
        });

        if (dbMessage) {
          io.to(dbMessage.channelId).emit("message:updated", message);
        }
      } catch (error) {
        emitSocketError("MESSAGE_EDIT_ERROR", "Unable to edit message.", error);
      }
    });

    socket.on("message:delete", async (messageId: string) => {
      try {
        const dbMessage = await prisma.message.findUnique({
          where: { id: messageId },
          select: {
            channelId: true,
            userId: true,
            channel: { select: { serverId: true } },
          },
        });

        if (!dbMessage?.channel.serverId) {
          socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
          return;
        }

        const member = await prisma.serverMember.findFirst({
          where: { serverId: dbMessage.channel.serverId, userId },
          select: {
            roles: {
              select: { role: { select: { permissions: true, name: true } } },
            },
          },
        });

        const isAdmin =
          member?.roles.some(
            (roleAssignment) =>
              (roleAssignment.role.permissions & (1n << 0n)) !== 0n ||
              /admin|moderator/i.test(roleAssignment.role.name),
          ) ?? false;

        await deleteMessage(messageId, userId, isAdmin);

        io.to(dbMessage.channelId).emit("message:deleted", {
          messageId,
          channelId: dbMessage.channelId,
        });
      } catch (error) {
        emitSocketError("MESSAGE_DELETE_ERROR", "Unable to delete message.", error);
      }
    });

    socket.on("message:react", async (data) => {
      try {
        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
          select: { channelId: true },
        });

        if (!message) {
          socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
          return;
        }

        await ensureChannelMembership(message.channelId);
        const reactions = await toggleReaction(data.messageId, userId, data.emoji);
        io.to(message.channelId).emit("message:reaction_updated", {
          messageId: data.messageId,
          reactions,
        });
      } catch (error) {
        emitSocketError("MESSAGE_REACT_ERROR", "Unable to update reactions.", error);
      }
    });

    socket.on("message:unreact", async (data) => {
      try {
        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
          select: { channelId: true },
        });

        if (!message) {
          socket.emit("error", { code: "MESSAGE_NOT_FOUND", message: "Message not found" });
          return;
        }

        await ensureChannelMembership(message.channelId);
        const reactions = await toggleReaction(data.messageId, userId, data.emoji);
        io.to(message.channelId).emit("message:reaction_updated", {
          messageId: data.messageId,
          reactions,
        });
      } catch (error) {
        emitSocketError("MESSAGE_UNREACT_ERROR", "Unable to update reactions.", error);
      }
    });

    socket.on("typing:start", async (channelId: string) => {
      try {
        await ensureChannelMembership(channelId);
        const key = `typing:${channelId}`;
        socket.data.typingChannels.add(channelId);

        await redis.hset(key, userId, Date.now() + CHANNEL_TYPING_EXPIRY);
        await redis.expire(key, TYPING_KEY_TTL_SECONDS);
        const typingUsers = await getChannelTypingUsers(channelId);

        io.to(channelId).emit("typing:update", {
          channelId,
          users: typingUsers,
        });
      } catch (error) {
        emitSocketError("TYPING_ERROR", "Unable to update typing state.", error);
      }
    });

    socket.on("typing:stop", async (channelId: string) => {
      try {
        await ensureChannelMembership(channelId);
        const key = `typing:${channelId}`;
        socket.data.typingChannels.delete(channelId);

        await redis.hdel(key, userId);
        const typingUsers = await getChannelTypingUsers(channelId);

        io.to(channelId).emit("typing:update", {
          channelId,
          users: typingUsers,
        });
      } catch (error) {
        emitSocketError("TYPING_ERROR", "Unable to update typing state.", error);
      }
    });

    socket.on("dm:join", async (conversationId: string) => {
      try {
        if (!(await requireDMParticipant(conversationId))) {
          emitDMError("FORBIDDEN", "You are not allowed to join this DM");
          return;
        }

        socket.join(`dm:${conversationId}`);
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to join this DM.", error);
      }
    });

    socket.on("dm:leave", async (conversationId: string) => {
      try {
        if (!(await requireDMParticipant(conversationId))) {
          emitDMError("FORBIDDEN", "You are not allowed to leave this DM");
          return;
        }

        socket.leave(`dm:${conversationId}`);
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to leave this DM.", error);
      }
    });

    socket.on("dm:screenshare:start", async (data) => {
      try {
        const participants = await getAuthorizedDMParticipants(data.conversationId);
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

    socket.on("dm:screenshare:accept", async (data) => {
      try {
        const participants = await getAuthorizedDMParticipants(data.conversationId);
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

    socket.on("dm:screenshare:decline", async (data) => {
      try {
        const participants = await getAuthorizedDMParticipants(data.conversationId);
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

    socket.on("dm:screenshare:stop", async (data) => {
      try {
        const participants = await getAuthorizedDMParticipants(data.conversationId);
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

    socket.on("dm:message:send", async (data) => {
      try {
        if (!(await requireDMParticipant(data.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        try {
          const key = `rate:dm:${userId}:${data.conversationId}`;
          const count = await redis.incr(key);
          if (count === 1) {
            await redis.expire(key, 60);
          }
          if (count > 30) {
            emitDMError("RATE_LIMITED", "Too many DM messages. Maximum 30 per minute.");
            return;
          }
        } catch {
          // Allow message send if Redis is temporarily unavailable.
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
            },
            select: { id: true },
          });

          if (!replyToMessage) {
            emitDMError("NOT_FOUND", "Reply target was not found.");
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
          console.error("DM notification error:", notificationError);
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

    socket.on("dm:message:edit", async (data) => {
      try {
        const trimmedContent = data.content?.trim() ?? "";
        if (!trimmedContent || trimmedContent.length > 2000) {
          emitDMError("VALIDATION_ERROR", "Message content must be between 1 and 2000 characters.");
          return;
        }

        const existingMessage = await prisma.dMMessage.findUnique({
          where: { id: data.messageId },
          select: {
            conversationId: true,
            userId: true,
          },
        });

        if (!existingMessage) {
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

    socket.on("dm:message:delete", async (data) => {
      try {
        const existingMessage = await prisma.dMMessage.findUnique({
          where: { id: data.messageId },
          select: {
            conversationId: true,
            userId: true,
          },
        });

        if (!existingMessage) {
          emitDMError("NOT_FOUND", "Message not found.");
          return;
        }

        if (!(await requireDMParticipant(existingMessage.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
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
            },
            data: {
              deletedAt: new Date(),
            },
          });

          io.to(`dm:${existingMessage.conversationId}`).emit("dm:message:deleted", {
            messageId: data.messageId,
            conversationId: existingMessage.conversationId,
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

    const handleDMReaction = async (data: { emoji: string; messageId: string }) => {
      try {
        const message = await prisma.dMMessage.findUnique({
          where: { id: data.messageId },
          select: {
            conversationId: true,
            deletedAt: true,
          },
        });

        if (!message || message.deletedAt) {
          emitDMError("NOT_FOUND", "Message not found.");
          return;
        }

        if (!(await requireDMParticipant(message.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        const reactions = await toggleDMReaction(data.messageId, userId, data.emoji);
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

    socket.on("dm:message:react", handleDMReaction);
    socket.on("dm:message:unreact", handleDMReaction);

    socket.on("dm:typing:start", async (data) => {
      try {
        if (!(await requireDMParticipant(data.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        await startDMTyping(data.conversationId);
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to update DM typing state.", error);
      }
    });

    socket.on("dm:typing:stop", async (data) => {
      try {
        if (!(await requireDMParticipant(data.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        await stopDMTyping(data.conversationId);
      } catch (error) {
        emitSafeDMError("FORBIDDEN", "Unable to update DM typing state.", error);
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

        const nextSocketCount = await redis.decr(getPresenceSocketsKey(userId));

        if (nextSocketCount <= 0) {
          await redis.del(getPresenceSocketsKey(userId));
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
        console.error("Disconnect cleanup error:", error);
      }
    });
  });

  return io;
}
