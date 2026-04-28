import type { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getToken } from "next-auth/jwt";
import { Prisma, prisma } from "@wizards/db";
import {
  dmMessageInclude,
  dmNotificationUserSelect,
  getDirectMessageConversationForUser,
  getDMDisplayName,
  mapDMMessagePayload,
} from "@/lib/dm/service";
import { getBlockStatus } from "@/lib/friends/helpers";
import {
  broadcastPresenceUpdateToFriends,
  persistUserPresence,
} from "@/lib/friends/service";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { getRedis, getRedisSub } from "@/lib/redis";
import { setSocketServer } from "@/lib/socket/runtime";
import {
  emitServerUnreadUpdatesForServer,
  getActiveChannelViewerUserIds,
  markChannelReadStates,
} from "@/lib/workspace/unread-service";
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
    cors: { origin: process.env.NEXTAUTH_URL || "http://localhost:3000" },
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
        const presence = await persistUserPresence(
          userId,
          "ONLINE",
          socket.data.presenceCustomStatus,
        );
        if (!presence) {
          await redis.del(getPresenceSocketsKey(userId));
          socket.disconnect(true);
          return;
        }
        socket.data.presenceStatus = presence.status;
        socket.data.presenceCustomStatus = presence.customStatus;

        const socketCount = await redis.incr(getPresenceSocketsKey(userId));

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
        socket.emit("error", {
          code: "CHANNEL_JOIN_ERROR",
          message: String(error),
        });
      }
    });

    socket.on("channel:leave", (channelId: string) => {
      socket.leave(channelId);
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

        const message = await createMessage(data.channelId, userId, data.content, data.replyToId);
        const messageCreatedAt = new Date(message.createdAt);
        const readUserIds = [userId, ...getActiveChannelViewerUserIds(data.channelId)];

        await markChannelReadStates({
          channelId: data.channelId,
          lastReadAt: messageCreatedAt,
          lastReadMessageId: message.id,
          userIds: readUserIds,
        });

        await emitServerUnreadUpdatesForServer(channel.serverId);
        io.to(data.channelId).emit("message:new", message);
      } catch (error) {
        socket.emit("error", {
          code: "MESSAGE_SEND_ERROR",
          message: String(error),
        });
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
        socket.emit("error", {
          code: "MESSAGE_EDIT_ERROR",
          message: String(error),
        });
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
        socket.emit("error", {
          code: "MESSAGE_DELETE_ERROR",
          message: String(error),
        });
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

        const reactions = await toggleReaction(data.messageId, userId, data.emoji);
        io.to(message.channelId).emit("message:reaction_updated", {
          messageId: data.messageId,
          reactions,
        });
      } catch (error) {
        socket.emit("error", {
          code: "MESSAGE_REACT_ERROR",
          message: String(error),
        });
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

        const reactions = await toggleReaction(data.messageId, userId, data.emoji);
        io.to(message.channelId).emit("message:reaction_updated", {
          messageId: data.messageId,
          reactions,
        });
      } catch (error) {
        socket.emit("error", {
          code: "MESSAGE_UNREACT_ERROR",
          message: String(error),
        });
      }
    });

    socket.on("typing:start", async (channelId: string) => {
      try {
        const key = `typing:${channelId}`;
        const displayName = socket.data.displayName;
        socket.data.typingChannels.add(channelId);

        await redis.hset(key, userId, Date.now() + CHANNEL_TYPING_EXPIRY);

        const typingData = await redis.hgetall(key);
        const now = Date.now();
        const typingUsers = Object.entries(typingData)
          .filter(([, expiry]) => parseInt(expiry, 10) > now)
          .map(([typingUserId]) => {
            return typingUserId === userId ? displayName : typingUserId;
          });

        io.to(channelId).emit("typing:update", {
          channelId,
          users: typingUsers,
        });
      } catch (error) {
        socket.emit("error", {
          code: "TYPING_ERROR",
          message: String(error),
        });
      }
    });

    socket.on("typing:stop", async (channelId: string) => {
      try {
        const key = `typing:${channelId}`;
        socket.data.typingChannels.delete(channelId);

        await redis.hdel(key, userId);

        const typingData = await redis.hgetall(key);
        const now = Date.now();
        const typingUsers = Object.entries(typingData)
          .filter(([, expiry]) => parseInt(expiry, 10) > now)
          .map(([typingUserId]) => typingUserId);

        io.to(channelId).emit("typing:update", {
          channelId,
          users: typingUsers,
        });
      } catch (error) {
        socket.emit("error", {
          code: "TYPING_ERROR",
          message: String(error),
        });
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
        emitDMError("FORBIDDEN", String(error));
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
        emitDMError("FORBIDDEN", String(error));
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

        const content = data.content?.trim() ?? "";
        if (!content || content.length > 2000) {
          emitDMError("VALIDATION_ERROR", "Message content must be between 1 and 2000 characters.");
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
          const message = await tx.dMMessage.create({
            data: {
              conversationId: data.conversationId,
              userId,
              content,
              replyToId: data.replyToId ?? null,
            },
            include: dmMessageInclude,
          });

          await tx.dMConversation.update({
            where: { id: data.conversationId },
            data: { lastMessageAt: message.createdAt },
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

        const preview = content.slice(0, 50);
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
                  body: content,
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
        emitDMError("NOT_FOUND", String(error));
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
            mapDMMessagePayload(updatedMessage),
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
        emitDMError("NOT_FOUND", String(error));
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
        emitDMError("NOT_FOUND", String(error));
      }
    });

    socket.on("dm:typing:start", async (data) => {
      try {
        if (!(await requireDMParticipant(data.conversationId))) {
          emitDMError("FORBIDDEN", "You are not a participant in this DM");
          return;
        }

        await startDMTyping(data.conversationId);
      } catch (error) {
        emitDMError("FORBIDDEN", String(error));
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
        emitDMError("FORBIDDEN", String(error));
      }
    });

    socket.on("disconnect", async () => {
      try {
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
          const presence = await persistUserPresence(
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
