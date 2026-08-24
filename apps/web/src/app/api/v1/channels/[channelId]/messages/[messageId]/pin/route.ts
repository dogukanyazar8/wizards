import type { ChatMessage } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { emitToUserRooms, getPermittedChannelViewerUserIds } from "@/lib/socket/emitters";
import { redactMessageAttachmentUrlsForViewer } from "@/lib/messages/attachment-visibility";
import { getSocketServer } from "@/lib/socket/runtime";
import { pinChannelMessage, unpinChannelMessage } from "@/lib/workspace/message-service";

type RouteContext = {
  params: Promise<{ channelId: string; messageId: string }>;
};

async function emitPinUpdate(channelId: string, message: ChatMessage, actorUserId: string) {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  const viewerUserIds = await getPermittedChannelViewerUserIds(channelId);
  const actorViewerIds = viewerUserIds.filter((viewerUserId) => viewerUserId === actorUserId);
  const otherViewerIds = viewerUserIds.filter((viewerUserId) => viewerUserId !== actorUserId);

  emitToUserRooms(io, actorViewerIds, "message:updated", message);
  emitToUserRooms(
    io,
    otherViewerIds,
    "message:updated",
    redactMessageAttachmentUrlsForViewer(message, null),
  );
  emitToUserRooms(io, viewerUserIds, "message:pins_updated", { channelId });
}

export async function POST(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "message:pin");

    const { channelId, messageId } = await context.params;
    const message = await pinChannelMessage(userId, channelId, messageId);
    await emitPinUpdate(channelId, message, userId);

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
    await emitPinUpdate(channelId, message, userId);

    return Response.json({ message });
  } catch (error) {
    return jsonError(error);
  }
}
