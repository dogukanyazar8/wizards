import type { ChatMessage } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import {
  pinChannelMessage,
  unpinChannelMessage,
} from "@/lib/workspace/message-service";

type RouteContext = {
  params: Promise<{ channelId: string; messageId: string }>;
};

function emitPinUpdate(channelId: string, message: ChatMessage) {
  const io = getSocketServer();

  io?.to(channelId).emit("message:updated", message);
  io?.to(channelId).emit("message:pins_updated", { channelId });
}

export async function POST(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "message:pin");

    const { channelId, messageId } = await context.params;
    const message = await pinChannelMessage(userId, channelId, messageId);
    emitPinUpdate(channelId, message);

    return Response.json({ message });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "message:pin");

    const { channelId, messageId } = await context.params;
    const message = await unpinChannelMessage(userId, channelId, messageId);
    emitPinUpdate(channelId, message);

    return Response.json({ message });
  } catch (error) {
    return jsonError(error);
  }
}
