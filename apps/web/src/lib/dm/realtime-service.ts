import type { DMNotifyLevel, UploadedAttachmentInput } from "@wizards/types";

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
  /** 2f §2. Who the body addressed by name; `MENTIONS` recipients need it. */
  mentionedUserIds: string[];
  participants: Array<{
    muted: boolean;
    /** Karar K8's deadline, carried so the worker can tell a live mute from a lapsed one. */
    mutedUntil: Date | null;
    notifyLevel: DMNotifyLevel;
    user: { locale: string | null };
    userId: string;
  }>;
  /** The other half of `MENTIONS`: a reply reaches the person replied to. */
  replyToAuthorId?: string;
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
  /**
   * 2a §5. The participants this body named. Their `mentionCount` moves in the
   * same transaction as the message, so the badge can never describe a message
   * that failed to commit.
   */
  mentionedUserIds?: readonly string[];
  notification?: DMMessageNotificationContext;
  participants: DMRealtimeParticipant[];
  /**
   * Mesajlar karar #1. Written inside the same transaction as the message, not
   * after it: a poll message whose options failed to commit would be a card with
   * nothing to vote on, and the send has already been announced by then.
   */
  poll?: {
    anonymous: boolean;
    closesAt: Date;
    multi: boolean;
    options: readonly string[];
    question: string;
  } | null;
  replyToId?: string | null;
  threadParentId?: string | null;
  /**
   * Mesajlar §6.1. Thread yanıtı ana sohbete de düşsün mü. Kök mesajda
   * anlamsız, o yüzden `threadParentId` ile birlikte değerlendiriliyor.
   */
  alsoSendToChannel?: boolean;
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
          // Bayrak yalnız gerçek bir thread yanıtında yazılır: kökte `true`
          // olsaydı ana sohbet sorgusu aynı satırı iki kez döndürürdü.
          alsoSentToChannel: Boolean(args.threadParentId && args.alsoSendToChannel),
          forwardedAt: args.forwardOfMessageId ? new Date() : null,
          expiresAt: args.expiresAt ?? null,
          clientNonce,
        },
        select: { id: true, createdAt: true },
      });

      await claimUploadedMessageAttachments(tx, args.userId, args.attachmentInputs, {
        dmMessageId: createdMessage.id,
      });

      if (args.poll) {
        await tx.poll.create({
          data: {
            anonymous: args.poll.anonymous,
            closesAt: args.poll.closesAt,
            createdById: args.userId,
            dmMessageId: createdMessage.id,
            multi: args.poll.multi,
            options: {
              create: args.poll.options.map((label, position) => ({ label, position })),
            },
            question: args.poll.question,
          },
        });
      }

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
          mentionedUserIds: args.notification.mentionedUserIds,
          messageId: createdMessage.id,
          participants: args.notification.participants,
          ...(args.notification.replyToAuthorId
            ? { replyToAuthorId: args.notification.replyToAuthorId }
            : {}),
          senderId: args.userId,
          senderName: args.notification.senderName,
        });
      }

      // Three set-based statements instead of one per participant. An
      // interactive transaction runs on a single connection, so the old
      // `Promise.all` of updates was 32 serialised round trips for a full group
      // — with the transaction held open for all of them.
      await tx.dMParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: args.conversationId,
            userId: args.userId,
          },
        },
        data: { hiddenAt: null },
      });

      await tx.dMParticipant.updateMany({
        where: {
          conversationId: args.conversationId,
          userId: { not: args.userId },
        },
        data: {
          hiddenAt: null,
          unreadCount: { increment: 1 },
        },
      });

      const mentionedUserIds = (args.mentionedUserIds ?? []).filter(
        (userId) => userId !== args.userId,
      );

      if (mentionedUserIds.length > 0) {
        await tx.dMParticipant.updateMany({
          where: {
            conversationId: args.conversationId,
            userId: { in: mentionedUserIds },
          },
          data: { mentionCount: { increment: 1 } },
        });

        // Ana Sayfa 1a, Faz 6. The counter above answers "how many"; these rows
        // answer "which ones", which is the only question "Bahsedilmeler" asks.
        // Both commit with the message: a badge whose row rolled back would
        // point at nothing, and a row without the badge would never be noticed.
        // `createdAt` is copied from the message rather than defaulted so the
        // keyset page and the message list cannot disagree by a few ms.
        // Bahsedilmeler Ş2: DM'de rol ve `@herkes` yoktur, bu dal her zaman `SELF`. Kolon yine
        // de yazılıyor: akış iki tabloyu tek `UNION` ile okuyor ve varsayılana güvenen bir dal,
        // varsayılan değiştiği gün sessizce yalan söyler.
        await tx.dMMessageMention.createMany({
          data: mentionedUserIds.map((userId) => ({
            createdAt: createdMessage.createdAt,
            kind: "SELF" as const,
            messageId: createdMessage.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }

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
