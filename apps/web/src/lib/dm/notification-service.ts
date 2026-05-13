import { prisma } from "@wizards/db";

import { logError } from "@/lib/logger";
import { normalizeAppLocale, translate } from "@/lib/locale";
import {
  isMessageGifContentType,
  isMessageImageContentType,
} from "@/lib/messages/attachments";
import { serializeNotification, type NotificationRecord } from "@/lib/socket/notification-payload";
import type { AppSocketServer } from "@/lib/socket/runtime";

export type DMNotificationAttachment = {
  contentType: string;
} | null | undefined;

export type DMNotificationParticipant = {
  userId: string;
  user: {
    locale: string | null;
  };
};

export function getDMAttachmentLabelKey(firstAttachment: DMNotificationAttachment) {
  return firstAttachment && isMessageGifContentType(firstAttachment.contentType)
    ? "chat.attachments.gif"
    : firstAttachment && isMessageImageContentType(firstAttachment.contentType)
      ? "chat.attachments.image"
      : "chat.attachments.file";
}

export function getDMConversationPreview(content: string, firstAttachment: DMNotificationAttachment) {
  return content.length > 0
    ? content.slice(0, 50)
    : firstAttachment && isMessageGifContentType(firstAttachment.contentType)
      ? "GIF"
      : firstAttachment && isMessageImageContentType(firstAttachment.contentType)
        ? "Image"
        : firstAttachment
          ? "File"
          : "";
}

export async function createDMMessageNotifications(args: {
  attachmentLabelKey: string;
  content: string;
  conversationId: string;
  io: AppSocketServer;
  participants: DMNotificationParticipant[];
  senderId: string;
  senderName: string;
}) {
  try {
    const notificationPromises = args.participants
      .filter((participant) => participant.userId !== args.senderId)
      .map(async (participant) => {
        const locale = normalizeAppLocale(participant.user.locale);
        const notification = await prisma.notification.create({
          data: {
            userId: participant.userId,
            type: "DM",
            title: translate(locale, "dm.notification.title", {
              name: args.senderName,
            }),
            body:
              args.content.length > 0
                ? args.content
                : translate(locale, args.attachmentLabelKey),
            actionUrl: `/channels/@me/${args.conversationId}`,
            metadata: {
              conversationId: args.conversationId,
              senderId: args.senderId,
            },
          },
        });

        return {
          participantId: participant.userId,
          payload: serializeNotification(notification as NotificationRecord),
        };
      });

    const createdNotifications = await Promise.all(notificationPromises);
    for (const notification of createdNotifications) {
      args.io.to(`user:${notification.participantId}`).emit(
        "notification:new",
        notification.payload,
      );
    }
  } catch (notificationError) {
    logError("[socket] DM notification error", notificationError);
  }
}
