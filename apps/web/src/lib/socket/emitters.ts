import { getActiveChannelViewerUserIds } from "@/lib/workspace/unread-service";
import { filterUserIdsByChannelPermission } from "@/lib/workspace/permission-service";
import { PermissionBits } from "@/lib/workspace/permissions";
import type { ServerToClientEvents } from "./events";
import type { AppSocketServer } from "./runtime";

export async function getPermittedChannelViewerUserIds(channelId: string) {
  const activeViewerUserIds = await getActiveChannelViewerUserIds(channelId);
  return filterUserIdsByChannelPermission(
    channelId,
    activeViewerUserIds,
    PermissionBits.VIEW_CHANNEL,
  );
}

export function emitToUserRooms<EventName extends keyof ServerToClientEvents>(
  io: AppSocketServer,
  userIds: string[],
  event: EventName,
  ...args: Parameters<ServerToClientEvents[EventName]>
) {
  if (userIds.length === 0) {
    return;
  }

  io.to(userIds.map((userId) => `user:${userId}`)).emit(event, ...args);
}

export async function emitToChannelViewers<EventName extends keyof ServerToClientEvents>(
  io: AppSocketServer,
  channelId: string,
  event: EventName,
  ...args: Parameters<ServerToClientEvents[EventName]>
) {
  const viewerUserIds = await getPermittedChannelViewerUserIds(channelId);
  emitToUserRooms(io, viewerUserIds, event, ...args);

  return viewerUserIds;
}
