import {
  broadcastPresenceUpdateToFriends,
  cacheUserPresence,
  getUserPresenceBroadcast,
} from "@/lib/friends/service";
import { logError } from "@/lib/logger";
import { getRedisOp } from "@/lib/redis";
import { parseSocketPayload, SocketPresenceActivityPayloadSchema } from "@/lib/socket/schemas";
import {
  addPresenceSocket,
  getPresenceSocketsKey,
  markPresenceSocketActive,
  removePresenceSocket,
} from "@/lib/socket/presence-helpers";
import {
  addServerOnlineMember,
  removeServerOnlineMember,
} from "@/lib/socket/server-online-presence";
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
    ctx.socket.data.presenceStatus = presence.status;
    ctx.socket.data.presenceCustomStatus = presence.customStatus;

    const presenceServerIds: string[] = ctx.socket.data.onlineServerIds ?? [];
    const applyPresence =
      presence.status === "OFFLINE" ? removeServerOnlineMember : addServerOnlineMember;
    await Promise.all(
      presenceServerIds.map((serverId) =>
        applyPresence(getRedisOp(), serverId, ctx.socket.data.userId as string),
      ),
    );

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

export function registerPresenceHandlers(ctx: HandlerContext): SocketHandlerRegistration {
  const emitSocketError = createSocketErrorEmitter(ctx.socket);

  void initializePresence(ctx);

  ctx.socket.on("presence:activity", async (rawData) => {
    try {
      const data = parseSocketPayload(SocketPresenceActivityPayloadSchema, rawData);
      const preferredPresence = await getUserPresenceBroadcast(ctx.userId);

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

      const presenceServerIds: string[] = ctx.socket.data.onlineServerIds ?? [];
      const applyPresence =
        presence.status === "OFFLINE" ? removeServerOnlineMember : addServerOnlineMember;
      await Promise.all(
        presenceServerIds.map((serverId) =>
          applyPresence(getRedisOp(), serverId, ctx.socket.data.userId as string),
        ),
      );

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
