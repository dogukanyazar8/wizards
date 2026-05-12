import { prisma } from "@wizards/db";
import type { NotificationType, Prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import type { NotificationDTO } from "./types";

type NotificationRow = Prisma.NotificationGetPayload<{
  select: {
    id: true;
    type: true;
    body: true;
    actionUrl: true;
    readAt: true;
    createdAt: true;
    metadata: true;
  };
}>;

type UserRow = Prisma.UserGetPayload<{
  select: {
    id: true;
    username: true;
    displayName: true;
    avatarUrl: true;
  };
}>;

const VISIBLE_NOTIFICATION_TYPES: NotificationType[] = [
  "FRIEND_REQUEST",
  "FRIEND_ACCEPTED",
  "DM",
  "MENTION",
  "SERVER_INVITE",
  "MODERATION",
];

type VisibleNotificationType =
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "DM"
  | "MENTION"
  | "MODERATION"
  | "SERVER_INVITE";

export async function listNotifications(
  userId: string,
  limit: number,
): Promise<NotificationDTO[]> {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      type: { in: VISIBLE_NOTIFICATION_TYPES },
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
    .map((n) => {
      const meta = (n.metadata as Record<string, unknown>) ?? {};
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

  return notifications.map((n): NotificationDTO => {
    const meta = (n.metadata as Record<string, unknown>) ?? {};
    const senderId = (meta.senderId as string) || "";
    const actor = userMap.get(senderId) ?? null;

    return {
      id: n.id,
      type: n.type as VisibleNotificationType,
      actor: actor
        ? {
            id: actor.id,
            username: actor.username,
            displayName: actor.displayName,
            avatarUrl: actor.avatarUrl,
          }
        : null,
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
      type: { in: VISIBLE_NOTIFICATION_TYPES },
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
  notification: NotificationRow,
  userMap: Map<string, UserRow>,
): Promise<NotificationDTO> {
  const meta = (notification.metadata as Record<string, unknown>) ?? {};
  const senderId = (meta.senderId as string) || "";
  const actor = userMap.get(senderId) ?? null;

  return {
    id: notification.id,
    type: notification.type as VisibleNotificationType,
    actor: actor
      ? {
          id: actor.id,
          username: actor.username,
          displayName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        }
      : null,
    message: notification.body,
    actionUrl: notification.actionUrl,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    meta: (meta as Record<string, string>) || undefined,
  };
}
