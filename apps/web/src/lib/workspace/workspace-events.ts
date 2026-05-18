import { ChannelType, prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";

import type { NotificationSocketPayload } from "@/lib/socket/events";
import { leaveVoiceStateViewerRoomsForServer } from "@/lib/socket/rooms";
import { getSocketServer } from "@/lib/socket/runtime";

type WorkspaceNotificationRecord = {
  actionUrl: string | null;
  body: string;
  createdAt: Date;
  id: string;
  imageUrl: string | null;
  metadata: Prisma.JsonValue | null;
  read: boolean;
  readAt: Date | null;
  title: string;
  type: "MENTION" | "FRIEND_REQUEST" | "FRIEND_ACCEPTED" | "DM" | "SERVER_INVITE" | "SYSTEM" | "MODERATION";
  userId: string;
};

export function serializeWorkspaceNotification(
  notification: WorkspaceNotificationRecord,
): NotificationSocketPayload {
  return {
    actionUrl: notification.actionUrl,
    body: notification.body,
    createdAt: notification.createdAt.toISOString(),
    id: notification.id,
    imageUrl: notification.imageUrl,
    metadata:
      notification.metadata &&
      typeof notification.metadata === "object" &&
      !Array.isArray(notification.metadata)
        ? (notification.metadata as Record<string, unknown>)
        : null,
    read: notification.read,
    readAt: notification.readAt?.toISOString() ?? null,
    title: notification.title,
    type: notification.type,
    userId: notification.userId,
  };
}

export function formatRoleNameList(roleNames: string[]) {
  return roleNames.map((roleName) => `@${roleName}`).join(", ");
}

export async function detachUserFromServerSocketRoom(userId: string, serverId: string) {
  const io = getSocketServer();
  if (!io) {
    return null;
  }

  const voiceChannels = await prisma.channel.findMany({
    where: { serverId, type: ChannelType.VOICE },
    select: { id: true },
  });
  const voiceChannelIds = voiceChannels.map((channel) => channel.id);
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    await socket.leave(`server:${serverId}`);
    await leaveVoiceStateViewerRoomsForServer(socket, serverId, voiceChannelIds);
  }

  return io;
}
