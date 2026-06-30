import type { UploadedAttachmentInput } from "@wizards/types";

import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { assertUnblockedDMParticipants } from "@/lib/dm/blocking";
import {
  dmNotificationUserSelect,
  getDMDisplayName,
  mapDMMessagePayload,
} from "@/lib/dm/service";
import {
  createRealtimeDMMessage,
  getDMConversationRealtimeUpdates,
} from "@/lib/dm/realtime-service";
import {
  getDMAttachmentLabelKey,
  getDMConversationPreview,
} from "@/lib/dm/notification-service";
import { logError } from "@/lib/logger";
import {
  normalizeMessageContentForSend,
  parseUploadedAttachmentInputs,
} from "@/lib/messages/attachments";
import { enqueueDMMessageNotificationJob } from "@/lib/outbox/service";
import type { AppSocketServer } from "@/lib/socket/runtime";

export type SendDirectMessageInput = {
  attachments?: unknown;
  content: string;
  conversationId: string;
  io?: AppSocketServer | null;
  replyToId?: string | null;
  senderName?: string | null;
  threadParentId?: string | null;
  userId: string;
};

async function assertDMReplyTarget(input: {
  conversationId: string;
  replyToId: string | null | undefined;
}) {
  if (!input.replyToId) {
    return;
  }

  const replyToMessage = await prisma.dMMessage.findFirst({
    where: {
      id: input.replyToId,
      conversationId: input.conversationId,
      deletedAt: null,
      placeholderRemovedAt: null,
    },
    select: { id: true },
  });

  if (!replyToMessage) {
    throw new ApiError("Reply target was not found.", 404, "NOT_FOUND");
  }
}

async function assertDMThreadParent(input: {
  conversationId: string;
  threadParentId: string | null | undefined;
}) {
  if (!input.threadParentId) {
    return;
  }

  const threadParentMessage = await prisma.dMMessage.findFirst({
    where: {
      id: input.threadParentId,
      conversationId: input.conversationId,
      deletedAt: null,
      placeholderRemovedAt: null,
      threadParentId: null,
    },
    select: { id: true },
  });

  if (!threadParentMessage) {
    throw new ApiError("Thread parent message was not found.", 404, "NOT_FOUND");
  }
}

function parseDMMessageInputs(input: SendDirectMessageInput): {
  attachmentInputs: UploadedAttachmentInput[];
  content: string;
} {
  const attachmentInputs = parseUploadedAttachmentInputs(input.attachments);
  const content = normalizeMessageContentForSend(input.content, attachmentInputs);

  return { attachmentInputs, content };
}

export async function sendDirectMessage(input: SendDirectMessageInput) {
  const { attachmentInputs, content } = parseDMMessageInputs(input);
  const participants = await prisma.dMParticipant.findMany({
    where: { conversationId: input.conversationId },
    select: {
      muted: true,
      userId: true,
      user: {
        select: dmNotificationUserSelect,
      },
    },
  });

  const sender = participants.find((participant) => participant.userId === input.userId);
  if (!sender) {
    throw new ApiError("You are not a participant in this DM", 403, "FORBIDDEN");
  }

  await assertUnblockedDMParticipants({
    currentUserId: input.userId,
    participants,
  });

  await Promise.all([
    assertDMReplyTarget({
      conversationId: input.conversationId,
      replyToId: input.replyToId,
    }),
    assertDMThreadParent({
      conversationId: input.conversationId,
      threadParentId: input.threadParentId,
    }),
  ]);

  const createdMessage = await createRealtimeDMMessage({
    attachmentInputs,
    content,
    conversationId: input.conversationId,
    participants,
    replyToId: input.replyToId ?? null,
    threadParentId: input.threadParentId ?? null,
    userId: input.userId,
  });

  const messagePayload = mapDMMessagePayload(createdMessage);
  input.io?.to(`dm:${input.conversationId}`).emit("dm:message:new", messagePayload);

  const firstAttachment = createdMessage.attachments[0];
  const attachmentLabelKey = getDMAttachmentLabelKey(firstAttachment);
  const preview = getDMConversationPreview(content, firstAttachment);
  const lastMessageAt = createdMessage.createdAt.toISOString();
  const conversationUpdates = input.io
    ? await getDMConversationRealtimeUpdates(input.conversationId, participants)
    : [];

  for (const update of conversationUpdates) {
    input.io?.to(`user:${update.participantId}`).emit("dm:conversation:updated", {
      conversationId: input.conversationId,
      lastMessageAt,
      preview,
      hiddenAt: null,
      unreadCount: update.unreadCount,
      conversation: update.conversation,
    });
  }

  const senderName =
    input.senderName ??
    getDMDisplayName({
      username: sender.user.username,
      displayName: sender.user.displayName,
    });

  void enqueueDMMessageNotificationJob({
    attachmentLabelKey,
    content,
    conversationId: input.conversationId,
    messageId: createdMessage.id,
    participants,
    senderId: input.userId,
    senderName,
  }).catch((error) => {
    logError("[dm] DM notification enqueue failed", error);
  });

  return messagePayload;
}
