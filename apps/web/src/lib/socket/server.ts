import type { Server as HTTPServer } from "http";
import type Redis from "ioredis";
import { Server, type Socket as IOSocket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { getToken } from "next-auth/jwt";
import { prisma } from "@wizards/db";
import { getUserPresenceBroadcast } from "@/lib/friends/service";
import {
  createMessage,
  deleteMessage,
  editMessage,
  toggleReaction,
} from "@/lib/workspace/message-service";
import { getRedis, getRedisSub } from "@/lib/redis";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events";

const TYPING_EXPIRY = 3000; // 3 seconds
const PRESENCE_SOCKET_PREFIX = "presence:sockets:";

type AppSocket = IOSocket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

function getPresenceSocketsKey(userId: string) {
  return `${PRESENCE_SOCKET_PREFIX}${userId}`;
}

async function listFriendIds(userId: string) {
  const friendships = await prisma.friendRequest.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    select: {
      receiverId: true,
      senderId: true,
    },
  });

  return friendships.map((friendship) =>
    friendship.senderId === userId ? friendship.receiverId : friendship.senderId,
  );
}

async function writePresence(
  redis: Redis,
  userId: string,
  status: SocketData["presenceStatus"],
  customStatus: string | null,
) {
  await redis.hset(`presence:${userId}`, {
    customStatus: customStatus ?? "",
    status,
  });
}

async function broadcastPresenceChange(
  socket: AppSocket,
  userId: string,
  status: SocketData["presenceStatus"],
  customStatus: string | null,
) {
  const friendIds = await listFriendIds(userId);

  for (const friendId of friendIds) {
    socket.to(`user:${friendId}`).emit("presence:update", {
      userId,
      status,
      customStatus,
    });
  }
}

export function initSocketServer(httpServer: HTTPServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: { origin: process.env.NEXTAUTH_URL || "http://localhost:3000" },
  });

  // JWT middleware
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

      socket.data.userId = token.id;
      socket.data.displayName = (token.displayName as string) || "User";
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  // Redis adapter
  const redis = getRedis();
  const redisSub = getRedisSub();
  io.adapter(createAdapter(redis, redisSub));

  // Connection handler
  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.data.typingChannels = new Set<string>();
    socket.data.presenceCustomStatus = null;
    socket.data.presenceStatus = "OFFLINE";
    socket.join(`user:${userId}`);

    void (async () => {
      try {
        const presence = await getUserPresenceBroadcast(userId);
        socket.data.presenceStatus = presence.status;
        socket.data.presenceCustomStatus = presence.customStatus;

        const socketCount = await redis.incr(getPresenceSocketsKey(userId));
        await writePresence(redis, userId, presence.status, presence.customStatus);

        if (socketCount === 1) {
          await broadcastPresenceChange(socket, userId, presence.status, presence.customStatus);
        }
      } catch (error) {
        console.error("Presence connect error:", error);
      }
    })();

    // Channel join - verify membership
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
          socket.emit("error", { code: "NOT_A_MEMBER", message: "Not a member of this server" });
          return;
        }

        socket.join(channelId);
      } catch (error) {
        socket.emit("error", {
          code: "CHANNEL_JOIN_ERROR",
          message: String(error),
        });
      }
    });

    // Channel leave
    socket.on("channel:leave", (channelId: string) => {
      socket.leave(channelId);
    });

    // Send message with rate limiting
    socket.on("message:send", async (data) => {
      try {
        // Rate limit: 30 messages per minute per user
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
          // Redis unavailable - skip rate limiting, allow message
        }

        // Verify channel exists and user is member
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
          socket.emit("error", { code: "NOT_A_MEMBER", message: "Not a member of this server" });
          return;
        }

        // Create message
        const message = await createMessage(data.channelId, userId, data.content, data.replyToId);

        // Broadcast to channel
        io.to(data.channelId).emit("message:new", message);
      } catch (error) {
        socket.emit("error", {
          code: "MESSAGE_SEND_ERROR",
          message: String(error),
        });
      }
    });

    // Edit message
    socket.on("message:edit", async (data) => {
      try {
        const message = await editMessage(data.messageId, userId, data.content);

        // Get channel for broadcast
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

    // Delete message
    socket.on("message:delete", async (messageId: string) => {
      try {
        // Check if user is admin (for this we need to get channel -> server -> membership -> roles)
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

        // Check if admin
        const member = await prisma.serverMember.findFirst({
          where: { serverId: dbMessage.channel.serverId, userId },
          select: {
            roles: {
              select: { role: { select: { permissions: true, name: true } } },
            },
          },
        });

        const isAdmin =
          member?.roles.some((r) => (r.role.permissions & (1n << 0n)) !== 0n || /admin|moderator/i.test(r.role.name)) ??
          false;

        await deleteMessage(messageId, userId, isAdmin);

        // Broadcast deletion
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

    // React to message
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

        // Broadcast reaction update
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

    // message:unreact is an alias — both toggle the same reaction
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

    // Typing start
    socket.on("typing:start", async (channelId: string) => {
      try {
        const key = `typing:${channelId}`;
        const displayName = socket.data.displayName;
        socket.data.typingChannels.add(channelId);

        // Store in Redis with expiry
        await redis.hset(key, userId, Date.now() + TYPING_EXPIRY);

        // Get all typing users
        const typingData = await redis.hgetall(key);
        const now = Date.now();
        const typingUsers = Object.entries(typingData)
          .filter(([, expiry]) => parseInt(expiry as string) > now)
          .map(([uid]) => {
            // We'll just use userId, but ideally fetch display name
            return uid === userId ? displayName : uid;
          });

        // Broadcast typing update
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

    // Typing stop
    socket.on("typing:stop", async (channelId: string) => {
      try {
        const key = `typing:${channelId}`;
        socket.data.typingChannels.delete(channelId);

        // Remove user from typing
        await redis.hdel(key, userId);

        // Get remaining typing users
        const typingData = await redis.hgetall(key);
        const now = Date.now();
        const typingUsers = Object.entries(typingData)
          .filter(([, expiry]) => parseInt(expiry as string) > now)
          .map(([uid]) => uid);

        // Broadcast typing update
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

    // Disconnect
    socket.on("disconnect", async () => {
      try {
        // Only clean up channels this user was actually typing in — no full keyspace scan
        const cleanups = Array.from(socket.data.typingChannels).map((channelId) =>
          redis.hdel(`typing:${channelId}`, userId),
        );
        await Promise.all(cleanups);

        const nextSocketCount = await redis.decr(getPresenceSocketsKey(userId));

        if (nextSocketCount <= 0) {
          await redis.del(getPresenceSocketsKey(userId));
          await writePresence(redis, userId, "OFFLINE", socket.data.presenceCustomStatus);
          await broadcastPresenceChange(
            socket,
            userId,
            "OFFLINE",
            socket.data.presenceCustomStatus,
          );
        }
      } catch (error) {
        console.error("Disconnect cleanup error:", error);
      }
    });
  });

  return io;
}
