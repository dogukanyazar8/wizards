import { getActiveChannelViewerUserIds } from "@/lib/workspace/unread-service";
import { filterUserIdsByChannelPermission } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { ServerToClientEvents } from "./events";
import type { AppSocketServer } from "./runtime";

export async function emitToChannelViewers<EventName extends keyof ServerToClientEvents>(
  io: AppSocketServer,
  channelId: string,
  event: EventName,
  ...args: Parameters<ServerToClientEvents[EventName]>
) {
  const activeViewerUserIds = await getActiveChannelViewerUserIds(channelId);
  const viewerUserIds = await filterUserIdsByChannelPermission(
    channelId,
    activeViewerUserIds,
    PermissionBits.VIEW_CHANNEL,
  );

  for (const viewerUserId of viewerUserIds) {
    io.to(`user:${viewerUserId}`).emit(event, ...args);
  }
}
