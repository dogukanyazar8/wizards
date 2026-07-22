import { MobileChannelMessagePinResponseSchema, type ChatMessage } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { redactMessageAttachmentUrlsForViewer } from "@/lib/messages/attachment-visibility";
import { emitToUserRooms, getPermittedChannelViewerUserIds } from "@/lib/socket/emitters";
import { getSocketServer } from "@/lib/socket/runtime";
import { pinChannelMessage, unpinChannelMessage } from "@/lib/workspace/message-service";
import type { MobileChannelMessageRouteContext } from "../../route-logic";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function emitMobilePinUpdate(channelId: string, message: ChatMessage, actorUserId: string) {
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

async function handleMobilePinRoute(
  request: Request,
  context: MobileChannelMessageRouteContext,
  shouldPin: boolean,
) {
  try {
    const userId = await requireMobileApiUserId(request);
    await enforceApiRateLimit(userId, "mobile:channel:messages:pin");

    const { channelId, messageId } = await context.params;
    const message = shouldPin
      ? await pinChannelMessage(userId, channelId, messageId)
      : await unpinChannelMessage(userId, channelId, messageId);
    await emitMobilePinUpdate(channelId, message, userId);

    return Response.json(MobileChannelMessagePinResponseSchema.parse({ message }), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: MobileChannelMessageRouteContext) {
  return handleMobilePinRoute(request, context, true);
}

export async function DELETE(request: Request, context: MobileChannelMessageRouteContext) {
  return handleMobilePinRoute(request, context, false);
}
