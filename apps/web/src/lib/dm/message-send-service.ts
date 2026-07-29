import type { DMMessagePayload, UploadedAttachmentInput } from "@wizards/types";

import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import type { ClientAttribution } from "@/lib/analytics/client-attribution";
import { assertUnblockedDMParticipants } from "@/lib/dm/blocking";
import { dmNotificationUserSelect, getDMDisplayName, mapDMMessagePayload } from "@/lib/dm/service";
import {
  createRealtimeDMMessage,
  getDMConversationRealtimeUpdates,
} from "@/lib/dm/realtime-service";
import { getDMConversationPreview } from "@/lib/dm/notification-service";
import {
  normalizeMessageContentForSend,
  parseUploadedAttachmentInputs,
} from "@/lib/messages/attachments";
import type { AppSocketServer } from "@/lib/socket/runtime";

export type SendDirectMessageInput = {
  attachments?: unknown;
  attribution?: ClientAttribution;
  /** Echoed back to the author so their optimistic bubble can absorb the echo. */
  clientNonce?: string | null;
  content: string;
  conversationId: string;
  forwardOfMessageId?: string | null;
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

  const senderName =
    input.senderName ??
    getDMDisplayName({
      username: sender.user.username,
      displayName: sender.user.displayName,
    });

  const createdMessage = await createRealtimeDMMessage({
    attachmentInputs,
    ...(input.attribution ? { attribution: input.attribution } : {}),
    content,
    conversationId: input.conversationId,
    forwardOfMessageId: input.forwardOfMessageId ?? null,
    notification: { participants, senderName },
    participants,
    replyToId: input.replyToId ?? null,
    threadParentId: input.threadParentId ?? null,
    userId: input.userId,
  });

  // Only the author gets the nonce: it is the key to their optimistic bubble and
  // means nothing to anyone else's cache.
  const clientNonce = input.clientNonce ?? null;
  const withAuthorNonce = (payload: DMMessagePayload, viewerUserId: string) =>
    clientNonce && viewerUserId === input.userId ? { ...payload, clientNonce } : payload;

  const messagePayload = withAuthorNonce(
    mapDMMessagePayload(createdMessage, undefined, undefined, input.userId),
    input.userId,
  );

  if (input.io) {
    for (const participant of participants) {
      input.io
        .to(`user:${participant.userId}`)
        .emit(
          "dm:message:new",
          withAuthorNonce(
            mapDMMessagePayload(createdMessage, undefined, undefined, participant.userId),
            participant.userId,
          ),
        );
    }
  }

  const firstAttachment = createdMessage.attachments[0];
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

  return messagePayload;
}
