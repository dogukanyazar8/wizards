import {
  broadcastPresenceUpdateToFriends,
  cacheUserPresence,
  getUserPresenceBroadcast,
} from "@/lib/friends/service";
import { logError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRedisOp } from "@/lib/redis";
import { parseSocketPayload, SocketPresenceActivityPayloadSchema } from "@/lib/socket/schemas";
import {
  addPresenceSocket,
  getPresenceSocketsKey,
  markPresenceSocketActive,
  removePresenceSocket,
} from "@/lib/socket/presence-helpers";
import { applyServerOnlinePresenceForSocket } from "@/lib/socket/server-online-presence";
import type { HandlerContext } from "../context";
import { createSocketErrorEmitter } from "../errors";
import type { SocketHandlerRegistration } from ".";

async function initializePresence(ctx: HandlerContext) {
  try {
    const preferredPresence = await getUserPresenceBroadcast(ctx.userId);
    const presence = await cacheUserPresence(
      ctx.userId,
      preferredPresence.status,
      preferredPresence.customStatus,
    );
    if (!presence) {
      await ctx.redis.del(getPresenceSocketsKey(ctx.userId));
      ctx.socket.disconnect(true);
      return;
    }
    // Assigned before the online-set write so `joinServerRoomsForUser`, which
    // starts in the same synchronous tick and reads this field, cannot mark an
    // invisible user online -- and so this chain's own write is decided by the
    // shared eligibility predicate rather than by the status alone (a socket
    // that disconnected while the presence lookup was in flight must not be
    // re-added).
    ctx.socket.data.presenceStatus = presence.status;
    ctx.socket.data.presenceCustomStatus = presence.customStatus;

    await applyServerOnlinePresenceForSocket(getRedisOp(), ctx.socket, ctx.userId);

    await addPresenceSocket(ctx.redis, ctx.userId, ctx.socket.id);

    await broadcastPresenceUpdateToFriends(presence);
  } catch (error) {
    logError("[socket] Presence connect error", error);
  }
}

async function cleanupPresence(ctx: HandlerContext) {
  const nextSocketCount = await removePresenceSocket(ctx.redis, ctx.userId, ctx.socket.id);

  if (nextSocketCount <= 0) {
    const presence = await cacheUserPresence(
      ctx.userId,
      "OFFLINE",
      ctx.socket.data.presenceCustomStatus,
    );
    if (presence) {
      await broadcastPresenceUpdateToFriends(presence);
    }
  }
}

export function registerPresenceHandlers(
  ctx: HandlerContext,
  options: {
    checkPresenceActivityAllowed?: () => Promise<boolean>;
    getUserPresence?: typeof getUserPresenceBroadcast;
    initialize?: typeof initializePresence;
  } = {},
): SocketHandlerRegistration {
  const emitSocketError = createSocketErrorEmitter(ctx.socket);
  const getUserPresence = options.getUserPresence ?? getUserPresenceBroadcast;
  const checkPresenceActivityAllowed =
    options.checkPresenceActivityAllowed ??
    (() => checkRateLimit(ctx.rateRedis, `rate:presence:${ctx.userId}`, 24, 10));

  void (options.initialize ?? initializePresence)(ctx);

  ctx.socket.on("presence:activity", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketPresenceActivityPayloadSchema, rawData);
      if (data.status === ctx.socket.data.presenceStatus) {
        return;
      }

      if (!(await checkPresenceActivityAllowed())) {
        return;
      }

      const preferredPresence = await getUserPresence(ctx.userId);

      if (preferredPresence.status === "DND" || preferredPresence.status === "OFFLINE") {
        return;
      }

      if (data.status === "ONLINE" && preferredPresence.status === "IDLE") {
        return;
      }

      const presence = await cacheUserPresence(
        ctx.userId,
        data.status,
        preferredPresence.customStatus,
      );

      if (!presence) {
        await ctx.redis.del(getPresenceSocketsKey(ctx.userId));
        ctx.socket.disconnect(true);
        return;
      }

      ctx.socket.data.presenceStatus = presence.status;
      ctx.socket.data.presenceCustomStatus = presence.customStatus;

      await applyServerOnlinePresenceForSocket(getRedisOp(), ctx.socket, ctx.userId);

      await markPresenceSocketActive(ctx.redis, ctx.userId, ctx.socket.id);
      await broadcastPresenceUpdateToFriends(presence);
    } catch (error) {
      emitSocketError("PRESENCE_UPDATE_ERROR", "Unable to update presence.", error);
    }
  });

  return {
    cleanup: () => cleanupPresence(ctx),
  };
}
