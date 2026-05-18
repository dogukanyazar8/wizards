import { prisma } from "@wizards/db";

import { normalizeAppLocale, translate } from "@/lib/locale";
import { isMessageGifContentType, isMessageImageContentType } from "@/lib/messages/attachments";
import { serializeNotification, type NotificationRecord } from "@/lib/socket/notification-payload";
import type { AppSocketServer } from "@/lib/socket/runtime";

export type DMNotificationAttachment =
  | {
      contentType: string;
    }
  | null
  | undefined;

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

export function getDMConversationPreview(
  content: string,
  firstAttachment: DMNotificationAttachment,
) {
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
  io?: AppSocketServer;
  messageId: string;
  participants: DMNotificationParticipant[];
  senderId: string;
  senderName: string;
}) {
  const recipients = args.participants.filter(
    (participant) => participant.userId !== args.senderId,
  );
  if (recipients.length === 0) {
    return;
  }

  const notifications = await prisma.notification.createManyAndReturn({
    data: recipients.map((participant) => {
      const locale = normalizeAppLocale(participant.user.locale);

      return {
        actionUrl: `/channels/@me/${args.conversationId}`,
        body: args.content.length > 0 ? args.content : translate(locale, args.attachmentLabelKey),
        dedupeKey: `dm-message:${args.messageId}:${participant.userId}`,
        metadata: {
          conversationId: args.conversationId,
          messageId: args.messageId,
          senderId: args.senderId,
        },
        title: translate(locale, "dm.notification.title", {
          name: args.senderName,
        }),
        type: "DM",
        userId: participant.userId,
      };
    }),
    skipDuplicates: true,
  });

  for (const notification of notifications) {
    args.io
      ?.to(`user:${notification.userId}`)
      .emit("notification:new", serializeNotification(notification as NotificationRecord));
  }
}
