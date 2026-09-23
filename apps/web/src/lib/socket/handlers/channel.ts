import { PermissionBits } from "@/lib/workspace/permissions";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { parseSocketPayload, SocketIdSchema } from "@/lib/socket/schemas";
import { buildChannelViewersKey } from "@/lib/workspace/unread-service";
import type { HandlerContext } from "../context";
import { createSocketErrorEmitter } from "../errors";
import type { SocketHandlerRegistration } from ".";

async function releaseChannelViewerMemberships(
  ctx: HandlerContext,
  channelIds: readonly string[],
): Promise<void> {
  if (channelIds.length === 0) {
    return;
  }

  const retainedBySibling = new Set<string>();
  try {
    const siblingSockets = await ctx.io.in(`user:${ctx.userId}`).fetchSockets();
    for (const sibling of siblingSockets) {
      if (sibling.id === ctx.socket.id) {
        continue;
      }
      for (const channelId of channelIds) {
        if (sibling.rooms.has(channelId)) {
          retainedBySibling.add(channelId);
        }
      }
    }
  } catch {
    // Fail open toward notifications: a false active-viewer entry suppresses durable unread
    // state, while an eager removal can only notify another still-open tab.
  }

  await Promise.all(
    channelIds
      .filter((channelId) => !retainedBySibling.has(channelId))
      .map(async (channelId) => {
        try {
          await ctx.redis.srem(buildChannelViewersKey(channelId), ctx.userId);
        } catch {
          // Viewer membership is derived state; Redis failure cannot break disconnect cleanup.
        }
      }),
  );
}

export function registerChannelHandlers(
  ctx: HandlerContext,
  options: {
    requireChannelPermission?: typeof requireChannelPermissionForUser;
  } = {},
): SocketHandlerRegistration {
  const emitSocketError = createSocketErrorEmitter(ctx.socket);
  const requireChannelPermission =
    options.requireChannelPermission ?? requireChannelPermissionForUser;
  const joinedChannelIds = (ctx.socket.data.channelViewerIds ??= new Set<string>());
  const isDisconnected = () => ctx.socket.connected === false;

  ctx.socket.on("channel:join", async (rawChannelId, acknowledge) => {
    try {
      const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
      const { channel } = await requireChannelPermission(
        ctx.userId,
        channelId,
        PermissionBits.VIEW_CHANNEL,
        {
          forbiddenCode: "FORBIDDEN",
          forbiddenMessage: "You do not have access to this channel.",
        },
      );

      if (isDisconnected()) {
        acknowledge?.({ ok: false });
        return;
      }

      await ctx.socket.join(channelId);
      await ctx.socket.join(`server:${channel.serverId}`);
      joinedChannelIds.add(channelId);
      try {
        const key = buildChannelViewersKey(channelId);
        await ctx.redis.sadd(key, ctx.userId);
        await ctx.redis.expire(key, 60 * 60 * 12);
        if (isDisconnected()) {
          joinedChannelIds.delete(channelId);
          await releaseChannelViewerMemberships(ctx, [channelId]);
        }
      } catch {
        // Viewer membership is derived state. Joining the real Socket.IO room
        // remains authoritative when Redis is temporarily unavailable.
      }
      acknowledge?.({ ok: !isDisconnected() });
    } catch (error) {
      acknowledge?.({ ok: false });
      emitSocketError("CHANNEL_JOIN_ERROR", "Unable to join channel.", error);
    }
  });

  ctx.socket.on("channel:leave", async (rawChannelId: string) => {
    try {
      const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
      ctx.socket.leave(channelId);
      joinedChannelIds.delete(channelId);
      await releaseChannelViewerMemberships(ctx, [channelId]);
    } catch (error) {
      emitSocketError("VALIDATION_ERROR", "Invalid channel payload.", error);
    }
  });

  return {
    cleanup: async () => {
      const channelIds = [...joinedChannelIds];
      joinedChannelIds.clear();
      await releaseChannelViewerMemberships(ctx, channelIds);
    },
  };
}
