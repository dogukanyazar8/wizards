import { ChannelType, prisma } from "@wizards/db";
import type { ConversationPrivacy } from "@wizards/types";
import { isDMParticipant } from "@/lib/dm/participant-service";
import { logError } from "@/lib/logger";
import { createMessagePrivacyCache } from "@/lib/messages/typing-visibility";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureChannelMembership } from "@/lib/socket/channel-membership";
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
/**
 * Participant sets change only when a group DM gains or loses a member, so the
 * lookup behind the personal-room fan-out is cached per connection. A member
 * added inside this window simply misses typing dots until it lapses.
 */
const DM_PARTICIPANT_CACHE_TTL_MS = 60_000;

type DMTypingEntry = {
  expiresAt: number;
  username: string;
};

type CheckTypingEventAllowed = (scope: string) => Promise<boolean>;
type IsDMParticipant = (userId: string, conversationId: string) => Promise<boolean>;
type ReadMessagePrivacy = (userId: string) => Promise<ConversationPrivacy>;
type RequireChannelPermission = typeof requireChannelPermissionForUser;

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
    readMessagePrivacy?: ReadMessagePrivacy;
    requireChannelPermission?: RequireChannelPermission;
  } = {},
): SocketHandlerRegistration {
  const emitDMError = createDMErrorEmitter(ctx.socket);
  const emitSafeDMError = createSafeDMErrorEmitter(ctx.socket);
  const emitSocketError = createSocketErrorEmitter(ctx.socket);
  const dmTypingConversations = new Set<string>();
  const dmTypingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const dmParticipantCache = new Map<string, { expiresAt: number; userIds: string[] }>();
  const requireChannelPermission =
    options.requireChannelPermission ?? requireChannelPermissionForUser;
  /**
   * §15.5's `Yazıyor göstergesi` switch (karar K9), enforced on the publishing
   * side: an opted-out person's keystrokes never become an event, rather than
   * becoming one that readers are asked to ignore.
   *
   * Cached for the same reason the participant lookup above is — this is asked
   * once per keystroke burst, and a per-keypress settings read would cost more
   * than the dots are worth. Flipping the switch takes effect within the window.
   */
  const readMessagePrivacy = options.readMessagePrivacy ?? createMessagePrivacyCache();

  async function isTypingIndicatorPublishable() {
    return (await readMessagePrivacy(ctx.userId)).typingIndicator;
  }

  /**
   * The conversation list needs typing dots for chats the reader does not
   * currently have open, and `dm:${conversationId}` is only joined while a
   * conversation *is* open. So every participant's personal room gets the update
   * too. Socket.IO delivers to the union of the named rooms, so a reader sitting
   * in the conversation still receives it exactly once.
   */
  async function getDMParticipantUserIds(conversationId: string): Promise<string[]> {
    const cached = dmParticipantCache.get(conversationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.userIds;
    }

    const participants = await prisma.dMParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    const userIds = participants.map((participant) => participant.userId);
    dmParticipantCache.set(conversationId, {
      expiresAt: Date.now() + DM_PARTICIPANT_CACHE_TTL_MS,
      userIds,
    });

    return userIds;
  }
  const isDMParticipantForUser = options.isDMParticipant ?? isDMParticipant;

  async function getChannelTypingUsers(channelId: string) {
    const key = `typing:${channelId}`;
    const typingData = await ctx.redis.hgetall(key);
    const now = Date.now();
    const expiredUserIds: string[] = [];
    const activeEntries = Object.entries(typingData)
      .map(([typingUserId, value]) => ({ typingUserId, value: parseDMTypingEntry(value) }))
      .filter(({ typingUserId, value }) => {
        const isActive = Boolean(value && value.expiresAt > now);
        if (!isActive) {
          expiredUserIds.push(typingUserId);
        }
        return isActive;
      });

    if (expiredUserIds.length > 0) {
      await ctx.redis.hdel(key, ...expiredUserIds);
    }

    if (activeEntries.length === 0) {
      return [];
    }

    return activeEntries.map(({ value }) => value!.username);
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

    let emitter = ctx.io.to(`dm:${conversationId}`);
    for (const participantUserId of await getDMParticipantUserIds(conversationId)) {
      emitter = emitter.to(`user:${participantUserId}`);
    }

    emitter.emit("dm:typing:update", {
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
      if (!(await isTypingIndicatorPublishable())) {
        return;
      }
      if (!(await isTypingEventAllowed(`channel:${channelId}`))) {
        return;
      }
      await requireChannelPermission(ctx.userId, channelId, PermissionBits.SEND_MESSAGES, {
        forbiddenCode: "FORBIDDEN",
        forbiddenMessage: "You cannot type in this channel.",
        lockedCode: "CHANNEL_LOCKED",
        lockedMessage: "This channel is read-only.",
        requiredType: ChannelType.TEXT,
        respectLocked: true,
      });
      const key = `typing:${channelId}`;
      ctx.socket.data.typingChannels.add(channelId);

      await ctx.redis.hset(
        key,
        ctx.userId,
        JSON.stringify({
          expiresAt: Date.now() + CHANNEL_TYPING_EXPIRY,
          username: ctx.socket.data.displayName || ctx.socket.data.username,
        }),
      );
      await ctx.redis.expire(key, TYPING_KEY_TTL_SECONDS);
      const typingUsers = await getChannelTypingUsers(channelId);

      // Typing dots are short-lived UI decoration. Everyone already in the
      // authoritative channel room may receive them; re-running a permission
      // fan-out on every keystroke costs more than the signal is worth.
      ctx.io.to(channelId).emit("typing:update", {
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

      ctx.io.to(channelId).emit("typing:update", {
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

      if (!(await isTypingIndicatorPublishable())) {
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

  /**
   * Deliberately ungated by the privacy switch. `stop` only clears state and
   * republishes the (now shorter) list, so it is what removes a dot somebody
   * left behind when they turned the switch off mid-sentence.
   */
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
