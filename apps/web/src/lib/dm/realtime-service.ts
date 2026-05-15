import type { UploadedAttachmentInput } from "@wizards/types";

import { prisma } from "@wizards/db";

import { claimUploadedMessageAttachments } from "@/lib/messages/attachments";
import { enqueueMessageCreatedAnalyticsJob } from "@/lib/outbox/service";

import { dmMessageInclude, getDirectMessageConversationRealtimeViews } from "./service";

export type DMRealtimeParticipant = {
  userId: string;
};

export async function createRealtimeDMMessage(args: {
  attachmentInputs: UploadedAttachmentInput[];
  content: string;
  conversationId: string;
  participants: DMRealtimeParticipant[];
  replyToId?: string | null;
  threadParentId?: string | null;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const createdMessage = await tx.dMMessage.create({
      data: {
        conversationId: args.conversationId,
        userId: args.userId,
        content: args.content,
        replyToId: args.replyToId ?? null,
        threadParentId: args.threadParentId ?? null,
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
      idempotencyKey: `analytics:dm-message:${createdMessage.id}`,
      isDm: true,
      uploadedBytes,
      userId: args.userId,
    });

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
