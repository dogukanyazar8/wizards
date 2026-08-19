import { ChannelType, prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";

import { getRedisOp } from "@/lib/redis";
import type { NotificationSocketPayload } from "@/lib/socket/events";
import { leaveVoiceStateViewerRoomsForServer } from "@/lib/socket/rooms";
import { getSocketServer } from "@/lib/socket/runtime";
import {
  removeServerOnlineMember,
  type ServerOnlinePresenceRedis,
} from "@/lib/socket/server-online-presence";
import { detachUserFromVoiceSurface } from "@/lib/voice/service";

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
  type:
    | "BADGE"
    | "FEEDBACK"
    | "MENTION"
    | "FRIEND_REQUEST"
    | "FRIEND_ACCEPTED"
    | "DM"
    | "SERVER_INVITE"
    | "SYSTEM"
    | "MODERATION";
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

export async function detachUserFromServerSocketRoom(
  userId: string,
  serverId: string,
  options: {
    detachVoice?: typeof detachUserFromVoiceSurface;
    redis?: ServerOnlinePresenceRedis;
  } = {},
) {
  await (options.detachVoice ?? detachUserFromVoiceSurface)(userId);

  const io = getSocketServer();
  if (!io) {
    return null;
  }

  const serverChannels = await prisma.channel.findMany({
    where: { serverId },
    select: { id: true, type: true },
  });
  const channelIds = serverChannels.map((channel) => channel.id);
  const voiceChannelIds = serverChannels
    .filter((channel) => channel.type === ChannelType.VOICE)
    .map((channel) => channel.id);
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    await socket.leave(`server:${serverId}`);
    for (const channelId of channelIds) {
      await socket.leave(channelId);
    }
    await leaveVoiceStateViewerRoomsForServer(socket, serverId, voiceChannelIds);
    // This socket may still be present in other servers; only drop the one it
    // was just forced out of, so a later presence transition (which trusts
    // this list) cannot resurrect the user into a server they no longer
    // belong to.
    socket.data.onlineServerIds = (socket.data.onlineServerIds ?? []).filter(
      (onlineServerId) => onlineServerId !== serverId,
    );
  }

  // Independent of whether any socket was still connected to the room: a
  // kicked, banned, or departed member must never read back as online for
  // this server, even if the online set already held a stale entry (e.g. a
  // socket that crashed without a clean disconnect).
  await removeServerOnlineMember(options.redis ?? getRedisOp(), serverId, userId);

  return io;
}
