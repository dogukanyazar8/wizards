import { z } from "zod";

export interface NotificationActorDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface NotificationDTO {
  id: string;
  type:
    | "BADGE"
    | "FRIEND_REQUEST"
    | "FRIEND_ACCEPTED"
    | "DM"
    | "MENTION"
    | "MODERATION"
    | "SERVER_INVITE"
    | "SYSTEM";
  actor: NotificationActorDTO | null;
  message: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
  meta?: Record<string, string>;
}

export interface NotificationsListResponse {
  notifications: NotificationDTO[];
  unreadCount: number;
}

export const NotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const NotificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});
