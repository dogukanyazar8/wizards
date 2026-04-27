import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import type { NotificationDTO } from "./types";

const VISIBLE_NOTIFICATION_TYPES = [
  "FRIEND_REQUEST",
  "FRIEND_ACCEPTED",
  "DM",
  "MENTION",
];

export async function listNotifications(
  userId: string,
  limit: number,
): Promise<NotificationDTO[]> {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      type: { in: VISIBLE_NOTIFICATION_TYPES as any },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      body: true,
      actionUrl: true,
      readAt: true,
      createdAt: true,
      metadata: true,
    },
  });

  const senderIds = notifications
    .map((n: any) => {
      const meta = (n.metadata as any) || {};
      return (meta.senderId as string) || null;
    })
    .filter((id): id is string => id !== null);

  const users = await prisma.user.findMany({
    where: { id: { in: senderIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return notifications.map((n: any): NotificationDTO => {
    const meta = (n.metadata as any) || {};
    const senderId = (meta.senderId as string) || "";
    const actor = userMap.get(senderId);

    if (!actor) {
      throw new ApiError(
        "Actor not found for notification",
        500,
      );
    }

    return {
      id: n.id,
      type: n.type,
      actor: {
        id: actor.id,
        username: actor.username,
        displayName: actor.displayName,
        avatarUrl: actor.avatarUrl,
      },
      message: n.body,
      actionUrl: n.actionUrl,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      meta: (meta as Record<string, string>) || undefined,
    };
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  const count = await prisma.notification.count({
    where: {
      userId,
      read: false,
      type: { in: VISIBLE_NOTIFICATION_TYPES as any },
    },
  });

  return count;
}

export async function markRead(
  userId: string,
  notificationId: string,
): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw new ApiError("Notification not found", 404);
  }
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  });
}

export async function serializeNotificationToDTO(
  notification: any,
  userMap: Map<string, any>,
): Promise<NotificationDTO> {
  const meta = (notification.metadata as any) || {};
  const senderId = (meta.senderId as string) || "";
  const actor = userMap.get(senderId);

  if (!actor) {
    throw new ApiError("Actor not found for notification", 500);
  }

  return {
    id: notification.id,
    type: notification.type,
    actor: {
      id: actor.id,
      username: actor.username,
      displayName: actor.displayName,
      avatarUrl: actor.avatarUrl,
    },
    message: notification.body,
    actionUrl: notification.actionUrl,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    meta: (meta as Record<string, string>) || undefined,
  };
}
