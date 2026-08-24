import { shouldNotifyForDMMessage, type DMNotifyLevel } from "@wizards/types";
import { prisma } from "@wizards/db";

import { normalizeAppLocale, translate } from "@/lib/locale";
import { isMessageGifContentType, isMessageImageContentType } from "@/lib/messages/attachments";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import { loadNotificationActor } from "@/lib/notifications/socket-context";
import { serializeNotification, type NotificationRecord } from "@/lib/socket/notification-payload";
import type { AppSocketServer } from "@/lib/socket/runtime";

export type DMNotificationAttachment =
  | {
      contentType: string;
    }
  | null
  | undefined;

export type DMNotificationParticipant = {
  /**
   * §4.2's mirror. Still read so a job queued before `notifyLevel` shipped —
   * and any caller that has not been migrated — keeps its old behaviour.
   */
  muted: boolean;
  notifyLevel?: DMNotifyLevel | undefined;
  userId: string;
  user: {
    locale: string | null;
  };
};

/**
 * 2f §2. The tier decides, not the mirror: `MENTIONS` must stay silent for an
 * ordinary message, which is exactly what reading `muted` alone could not do —
 * `muted` is only true for `NONE`, so every `MENTIONS` member was being
 * notified about every message.
 */
export function selectDMNotificationRecipients<T extends DMNotificationParticipant>(args: {
  mentionedUserIds?: readonly string[];
  participants: readonly T[];
  replyToAuthorId?: string | undefined;
  senderId: string;
}): T[] {
  const mentioned = new Set(args.mentionedUserIds ?? []);

  return args.participants.filter((participant) => {
    if (participant.userId === args.senderId) {
      return false;
    }

    const notifyLevel = participant.notifyLevel ?? (participant.muted ? "NONE" : "ALL");

    return shouldNotifyForDMMessage(notifyLevel, {
      isMentioned: mentioned.has(participant.userId),
      isReplyToViewer: args.replyToAuthorId === participant.userId,
    });
  });
}

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
  mentionedUserIds?: readonly string[];
  messageId: string;
  participants: DMNotificationParticipant[];
  replyToAuthorId?: string | undefined;
  senderId: string;
  senderName: string;
}) {
  const mentionedUserIds = new Set(args.mentionedUserIds ?? []);
  const recipients = selectDMNotificationRecipients({
    ...(args.mentionedUserIds ? { mentionedUserIds: args.mentionedUserIds } : {}),
    participants: args.participants,
    ...(args.replyToAuthorId ? { replyToAuthorId: args.replyToAuthorId } : {}),
    senderId: args.senderId,
  });
  if (recipients.length === 0) {
    return;
  }

  const notifications = await prisma.notification.createManyAndReturn({
    data: recipients.map((participant) => {
      const locale = normalizeAppLocale(participant.user.locale);

      return {
        actionUrl: `/messages/${args.conversationId}`,
        body: args.content.length > 0 ? args.content : translate(locale, args.attachmentLabelKey),
        dedupeKey: `dm-message:${args.messageId}:${participant.userId}`,
        metadata: {
          conversationId: args.conversationId,
          messageId: args.messageId,
          // Notification rows are per recipient. Persisting this bit lets an
          // atomic feed read retire that recipient's mention badge exactly once.
          ...(mentionedUserIds.has(participant.userId) ? { mentioned: true } : {}),
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

  // A DM notification is drawn around the sender's avatar, so the event carries
  // them and the mobile feed needs no follow-up fetch to render the row. Only
  // worth a read when there is a socket to emit on.
  const actor = args.io && notifications.length ? await loadNotificationActor(args.senderId) : null;

  for (const notification of notifications) {
    args.io
      ?.to(`user:${notification.userId}`)
      .emit(
        "notification:new",
        serializeNotification(notification as NotificationRecord, { actor }),
      );
  }

  void sendMobilePushForNotifications(
    notifications.map((notification) => ({
      actionUrl: notification.actionUrl,
      body: notification.body,
      id: notification.id,
      title: notification.title,
      type: notification.type,
      userId: notification.userId,
    })),
  ).catch(() => undefined);
}
