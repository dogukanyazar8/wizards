import type { Prisma } from "@wizards/db";
import type { NotificationSocketContext, NotificationSocketPayload } from "./events";

export type NotificationRecord = {
  id: string;
  userId: string;
  type:
    | "MENTION"
    | "FRIEND_REQUEST"
    | "FRIEND_ACCEPTED"
    | "DM"
    | "SERVER_INVITE"
    | "SYSTEM"
    | "MODERATION";
  title: string;
  body: string;
  imageUrl: string | null;
  read: boolean;
  readAt: Date | null;
  actionUrl: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

function isRecord(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function serializeNotification(
  notification: NotificationRecord,
  context: NotificationSocketContext = {},
): NotificationSocketPayload {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    imageUrl: notification.imageUrl,
    read: notification.read,
    readAt: notification.readAt?.toISOString() ?? null,
    actionUrl: notification.actionUrl,
    metadata: isRecord(notification.metadata) ? notification.metadata : null,
    createdAt: notification.createdAt.toISOString(),
    // Only spread what the caller actually knows: an absent key and a null value
    // mean different things to a client deciding whether to trust the event.
    ...(context.actor === undefined ? {} : { actor: context.actor }),
    ...(context.channel === undefined ? {} : { channel: context.channel }),
    ...(context.server === undefined ? {} : { server: context.server }),
  };
}
