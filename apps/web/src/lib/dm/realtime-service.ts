import type { UploadedAttachmentInput } from "@wizards/types";

import { prisma } from "@wizards/db";

import {
  claimUploadedMessageAttachments,
} from "@/lib/messages/attachments";

import {
  dmMessageInclude,
  getDirectMessageConversationForUser,
} from "./service";

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
) {
  return Promise.all(
    participants.map(async (participant) => {
      const conversation = await getDirectMessageConversationForUser(
        conversationId,
        participant.userId,
      );
      const currentParticipant = conversation.participants.find(
        (candidate) => candidate.userId === participant.userId,
      );

      return {
        participantId: participant.userId,
        unreadCount: currentParticipant?.unreadCount ?? 0,
        conversation,
      };
    }),
  );
}
