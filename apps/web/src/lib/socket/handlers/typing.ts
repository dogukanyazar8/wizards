import { ChannelType, prisma } from "@wizards/db";
import { isDMParticipant } from "@/lib/dm/participant-service";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureChannelMembership } from "@/lib/socket/channel-membership";
import { emitToChannelViewers } from "@/lib/socket/emitters";
import {
  parseSocketPayload,
  SocketConversationPayloadSchema,
  SocketIdSchema,
} from "@/lib/socket/schemas";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { HandlerContext } from "../context";
import {
  createDMErrorEmitter,
  createSafeDMErrorEmitter,
  createSocketErrorEmitter,
} from "../errors";
import type { SocketHandlerRegistration } from ".";

const CHANNEL_TYPING_EXPIRY = 3000;
const DM_TYPING_EXPIRY = 3000;
const TYPING_KEY_TTL_SECONDS = 10;
const TYPING_RATE_LIMIT = 24;
const TYPING_RATE_WINDOW_SECONDS = 10;

type DMTypingEntry = {
  expiresAt: number;
  username: string;
};

type CheckTypingEventAllowed = (scope: string) => Promise<boolean>;
type IsDMParticipant = (userId: string, conversationId: string) => Promise<boolean>;

export function parseDMTypingEntry(value: string): DMTypingEntry | null {
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

export function registerTypingHandlers(
  ctx: HandlerContext,
  options: {
    checkTypingEventAllowed?: CheckTypingEventAllowed;
    isDMParticipant?: IsDMParticipant;
  } = {},
): SocketHandlerRegistration {
  const emitDMError = createDMErrorEmitter(ctx.socket);
  const emitSafeDMError = createSafeDMErrorEmitter(ctx.socket);
  const emitSocketError = createSocketErrorEmitter(ctx.socket);
  const dmTypingConversations = new Set<string>();
  const dmTypingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const isDMParticipantForUser = options.isDMParticipant ?? isDMParticipant;

  async function getChannelTypingUsers(channelId: string) {
    const key = `typing:${channelId}`;
    const typingData = await ctx.redis.hgetall(key);
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
      await ctx.redis.hdel(key, ...expiredUserIds);
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

    const userMap = new Map(users.map((entry) => [entry.id, entry.displayName ?? entry.username]));

    return activeUserIds.map(
      (typingUserId) =>
        userMap.get(typingUserId) ??
        (typingUserId === ctx.userId ? ctx.socket.data.displayName : "Someone"),
    );
  }

  async function emitDMTypingUpdate(conversationId: string) {
    const key = `typing:dm:${conversationId}`;
    const entries = await ctx.redis.hgetall(key);
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
      await ctx.redis.hdel(key, ...expiredUserIds);
    }

    ctx.io.to(`dm:${conversationId}`).emit("dm:typing:update", {
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
    await ctx.redis.hdel(`typing:dm:${conversationId}`, ctx.userId);
    await emitDMTypingUpdate(conversationId);
  }

  async function startDMTyping(conversationId: string) {
    const key = `typing:dm:${conversationId}`;
    dmTypingConversations.add(conversationId);

    const existingTimeout = dmTypingTimeouts.get(conversationId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    await ctx.redis.hset(
      key,
      ctx.userId,
      JSON.stringify({
        expiresAt: Date.now() + DM_TYPING_EXPIRY,
        username: ctx.socket.data.username,
      }),
    );
    await ctx.redis.expire(key, TYPING_KEY_TTL_SECONDS);

    const timeout = setTimeout(() => {
      void stopDMTyping(conversationId);
    }, DM_TYPING_EXPIRY);

    dmTypingTimeouts.set(conversationId, timeout);
    await emitDMTypingUpdate(conversationId);
  }

  async function isTypingEventAllowed(scope: string) {
    try {
      return await (options.checkTypingEventAllowed ?? checkTypingRateLimit)(scope);
    } catch (error) {
      logError("[socket] Typing rate limit unavailable", error);
      return false;
    }
  }

  async function checkTypingRateLimit(scope: string) {
    return checkRateLimit(
      ctx.rateRedis,
      `rate:typing:${ctx.userId}:${scope}`,
      TYPING_RATE_LIMIT,
      TYPING_RATE_WINDOW_SECONDS,
    );
  }

  ctx.socket.on("typing:start", async (rawChannelId: string) => {
    try {
      const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
      if (!(await isTypingEventAllowed(`channel:${channelId}`))) {
        return;
      }
      await requireChannelPermissionForUser(ctx.userId, channelId, PermissionBits.SEND_MESSAGES, {
        forbiddenCode: "FORBIDDEN",
        forbiddenMessage: "You cannot type in this channel.",
        lockedCode: "CHANNEL_LOCKED",
        lockedMessage: "This channel is read-only.",
        requiredType: ChannelType.TEXT,
        respectLocked: true,
      });
      const key = `typing:${channelId}`;
      ctx.socket.data.typingChannels.add(channelId);

      await ctx.redis.hset(key, ctx.userId, Date.now() + CHANNEL_TYPING_EXPIRY);
      await ctx.redis.expire(key, TYPING_KEY_TTL_SECONDS);
      const typingUsers = await getChannelTypingUsers(channelId);

      await emitToChannelViewers(ctx.io, channelId, "typing:update", {
        channelId,
        users: typingUsers,
      });
    } catch (error) {
      emitSocketError("TYPING_ERROR", "Unable to update typing state.", error);
    }
  });

  ctx.socket.on("typing:stop", async (rawChannelId: string) => {
    try {
      const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
      await ensureChannelMembership(ctx.userId, channelId);
      const key = `typing:${channelId}`;
      ctx.socket.data.typingChannels.delete(channelId);

      await ctx.redis.hdel(key, ctx.userId);
      const typingUsers = await getChannelTypingUsers(channelId);

      await emitToChannelViewers(ctx.io, channelId, "typing:update", {
        channelId,
        users: typingUsers,
      });
    } catch (error) {
      emitSocketError("TYPING_ERROR", "Unable to update typing state.", error);
    }
  });

  ctx.socket.on("dm:typing:start", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
      if (!(await isDMParticipantForUser(ctx.userId, data.conversationId))) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      if (!(await isTypingEventAllowed(`dm:${data.conversationId}`))) {
        return;
      }

      await startDMTyping(data.conversationId);
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to update DM typing state.", error);
    }
  });

  ctx.socket.on("dm:typing:stop", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketConversationPayloadSchema, rawData);
      if (!(await isDMParticipantForUser(ctx.userId, data.conversationId))) {
        emitDMError("FORBIDDEN", "You are not a participant in this DM");
        return;
      }

      if (!(await isTypingEventAllowed(`dm:${data.conversationId}`))) {
        return;
      }

      await stopDMTyping(data.conversationId);
    } catch (error) {
      emitSafeDMError("FORBIDDEN", "Unable to update DM typing state.", error);
    }
  });

  return {
    async cleanup() {
      const channelTypingCleanups = Array.from(ctx.socket.data.typingChannels).map((channelId) =>
        ctx.redis.hdel(`typing:${channelId}`, ctx.userId),
      );
      await Promise.all(channelTypingCleanups);

      for (const timeout of dmTypingTimeouts.values()) {
        clearTimeout(timeout);
      }
      dmTypingTimeouts.clear();

      await Promise.all(
        Array.from(dmTypingConversations).map((conversationId) => stopDMTyping(conversationId)),
      );
    },
    stopDMTyping,
  };
}
