import { PermissionBits } from "@/lib/workspace/permissions";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { parseSocketPayload, SocketIdSchema } from "@/lib/socket/schemas";
import type { HandlerContext } from "../context";
import { createSocketErrorEmitter } from "../errors";
import type { SocketHandlerRegistration } from ".";

export function registerChannelHandlers(ctx: HandlerContext): SocketHandlerRegistration {
  const emitSocketError = createSocketErrorEmitter(ctx.socket);

  ctx.socket.on("channel:join", async (rawChannelId: string) => {
    try {
      const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
      const { channel } = await requireChannelPermissionForUser(
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
    } catch (error) {
      emitSocketError("CHANNEL_JOIN_ERROR", "Unable to join channel.", error);
    }
  });

  ctx.socket.on("channel:leave", (rawChannelId: string) => {
    try {
      const channelId = parseSocketPayload(SocketIdSchema, rawChannelId);
      ctx.socket.leave(channelId);
    } catch (error) {
      emitSocketError("VALIDATION_ERROR", "Invalid channel payload.", error);
    }
  });

  return {};
}
