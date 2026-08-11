import type { UploadedAttachmentInput } from "@wizards/types";

import { prisma } from "@wizards/db";

import { UNKNOWN_ATTRIBUTION, type ClientAttribution } from "@/lib/analytics/client-attribution";
import { claimUploadedMessageAttachments } from "@/lib/messages/attachments";
import {
  normalizeMessageClientNonce,
  resolveIdempotentMessageSend,
} from "@/lib/messages/client-nonce";
import {
  enqueueDMMessageNotificationJob,
  enqueueMessageCreatedAnalyticsJob,
} from "@/lib/outbox/service";

import { getDMAttachmentLabelKey } from "./notification-service";

import { dmMessageInclude, getDirectMessageConversationRealtimeViews } from "./service";

export type DMRealtimeParticipant = {
  userId: string;
};

/**
 * What the DM notification job needs beyond the message row. Supplied by senders
 * that want the recipients told; the job is written by this transaction so a
 * committed message cannot end up unannounced.
 */
export type DMMessageNotificationContext = {
  participants: Array<{
    muted: boolean;
    user: { locale: string | null };
    userId: string;
  }>;
  senderName: string;
};

export async function createRealtimeDMMessage(args: {
  attachmentInputs: UploadedAttachmentInput[];
  /** Socket senders carry it on `socket.data`; REST senders read the headers. */
  attribution?: ClientAttribution;
  /**
   * Minted by the author's client, one per send. Stored so a retry resolves to
   * the message it already wrote instead of a second one.
   */
  clientNonce?: string | null;
  content: string;
  conversationId: string;
  /**
   * K3 / C2. When the purge sweep removes this message, or null when the
   * conversation's disappearing window is off. Computed by the caller so the
   * whole send shares one instant.
   */
  expiresAt?: Date | null;
  forwardOfMessageId?: string | null;
  notification?: DMMessageNotificationContext;
  participants: DMRealtimeParticipant[];
  replyToId?: string | null;
  threadParentId?: string | null;
  userId: string;
}) {
  const clientNonce = normalizeMessageClientNonce(args.clientNonce);

  const writeMessage = () =>
    prisma.$transaction(async (tx) => {
      const createdMessage = await tx.dMMessage.create({
        data: {
          conversationId: args.conversationId,
          userId: args.userId,
          content: args.content,
          replyToId: args.replyToId ?? null,
          threadParentId: args.threadParentId ?? null,
          forwardedAt: args.forwardOfMessageId ? new Date() : null,
          expiresAt: args.expiresAt ?? null,
          clientNonce,
        },
        select: { id: true, createdAt: true },
      });

      await claimUploadedMessageAttachments(tx, args.userId, args.attachmentInputs, {
        dmMessageId: createdMessage.id,
      });

      const message = await tx.dMMessage.findUniqueOrThrow({
        where: { id: createdMessage.id },
        include: dmMessageInclude,
      });

      await tx.dMConversation.update({
        where: { id: args.conversationId },
        data: { lastMessageAt: createdMessage.createdAt },
      });
      const uploadedBytes = message.attachments.reduce(
        (total, attachment) => total + BigInt(attachment.size),
        0n,
      );

      await enqueueMessageCreatedAnalyticsJob(tx, {
        attachmentCount: message.attachments.length,
        attribution: args.attribution ?? UNKNOWN_ATTRIBUTION,
        idempotencyKey: `analytics:dm-message:${createdMessage.id}`,
        isDm: true,
        uploadedBytes,
        userId: args.userId,
      });

      if (args.notification) {
        await enqueueDMMessageNotificationJob(tx, {
          attachmentLabelKey: getDMAttachmentLabelKey(message.attachments[0]),
          content: args.content,
          conversationId: args.conversationId,
          messageId: createdMessage.id,
          participants: args.notification.participants,
          senderId: args.userId,
          senderName: args.notification.senderName,
        });
      }

      await Promise.all(
        args.participants.map((participant) =>
          tx.dMParticipant.update({
            where: {
              conversationId_userId: {
                conversationId: args.conversationId,
                userId: participant.userId,
              },
            },
            data:
              participant.userId === args.userId
                ? {
                    hiddenAt: null,
                  }
                : {
                    hiddenAt: null,
                    unreadCount: {
                      increment: 1,
                    },
                  },
          }),
        ),
      );

      return message;
    });

  return resolveIdempotentMessageSend({
    clientNonce,
    create: writeMessage,
    findExisting: () =>
      prisma.dMMessage.findFirst({
        where: { userId: args.userId, clientNonce },
        include: dmMessageInclude,
      }),
  });
}

export async function getDMConversationRealtimeUpdates(
  conversationId: string,
  participants: DMRealtimeParticipant[],
  options: {
    loadConversationViews?: typeof getDirectMessageConversationRealtimeViews;
  } = {},
) {
  const loadConversationViews =
    options.loadConversationViews ?? getDirectMessageConversationRealtimeViews;

  return loadConversationViews(
    conversationId,
    participants.map((participant) => participant.userId),
  );
}
