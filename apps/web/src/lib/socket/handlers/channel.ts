import { PermissionBits } from "@/lib/workspace/permissions";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { parseSocketPayload, SocketIdSchema } from "@/lib/socket/schemas";
import { buildChannelViewersKey } from "@/lib/workspace/unread-service";
import type { HandlerContext } from "../context";
import { createSocketErrorEmitter } from "../errors";
import type { SocketHandlerRegistration } from ".";
export function registerChannelHandlers(
  ctx: HandlerContext,
  options: {
    requireChannelPermission?: typeof requireChannelPermissionForUser;
  } = {},
): SocketHandlerRegistration {
  const emitSocketError = createSocketErrorEmitter(ctx.socket);
  const requireChannelPermission =
    options.requireChannelPermission ?? requireChannelPermissionForUser;

  ctx.socket.on("channel:join", async (rawChannelId: string) => {
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

      ctx.socket.join(channelId);
      ctx.socket.join(`server:${channel.serverId}`);
      try {
        const key = buildChannelViewersKey(channelId);
        await ctx.redis.sadd(key, ctx.userId);
        await ctx.redis.expire(key, 60 * 60 * 12);
      } catch {
        // Viewer membership is derived state. Joining the real Socket.IO room
        // remains authoritative when Redis is temporarily unavailable.
      }
    } catch (error) {
      emitSocketError("CHANNEL_JOIN_ERROR", "Unable to join channel.", error);
    }
  });

  ctx.socket.on("channel:leave", async (rawChannelId: string) => {
    try {
      const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
      ctx.socket.leave(channelId);
      try {
        await ctx.redis.srem(buildChannelViewersKey(channelId), ctx.userId);
      } catch {
        // Same best-effort derived-state rule as channel:join above.
      }
    } catch (error) {
      emitSocketError("VALIDATION_ERROR", "Invalid channel payload.", error);
    }
  });

  return {};
}
