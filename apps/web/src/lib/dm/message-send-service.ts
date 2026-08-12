import {
  resolveDisappearingExpiry,
  type DMMessagePayload,
  type DMNotifyLevel,
  type GroupDisappearingWindow,
  type UploadedAttachmentInput,
} from "@wizards/types";

import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import type { ClientAttribution } from "@/lib/analytics/client-attribution";
import { assertUnblockedDMParticipants } from "@/lib/dm/blocking";
import { getBlockedUserIdsForUser } from "@/lib/friends/helpers";
import {
  assertGroupPermission,
  groupAuthSelect,
  toGroupAuthContext,
  type GroupAuthConversationRow,
} from "@/lib/dm/group-permissions";
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
import { deferMessageFanout } from "@/lib/messages/deferred-fanout";
import type { AppSocketServer } from "@/lib/socket/runtime";
import { extractMentionUsernames } from "@/lib/workspace/message-notification-service";

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

/**
 * Validates the reply target and hands back its author. 2f §2's `MENTIONS` tier
 * reads "@adın geçtiğinde **ve yanıtlarda**", so the author id the check already
 * had in hand is returned rather than thrown away and re-fetched.
 */
async function assertDMReplyTarget(input: {
  conversationId: string;
  replyToId: string | null | undefined;
}): Promise<string | null> {
  if (!input.replyToId) {
    return null;
  }

  const replyToMessage = await prisma.dMMessage.findFirst({
    where: {
      id: input.replyToId,
      conversationId: input.conversationId,
      deletedAt: null,
      placeholderRemovedAt: null,
    },
    select: { userId: true },
  });

  if (!replyToMessage) {
    throw new ApiError("Reply target was not found.", 404, "NOT_FOUND");
  }

  return replyToMessage.userId;
}

/**
 * Which participants the body addresses by name. The pattern is
 * `extractMentionUsernames` — the same one the channel fan-out and the mobile
 * highlighter use — so a token that renders as a pill is exactly a token that
 * moves a counter.
 *
 * Resolution is in memory against the roster the send already loaded: no extra
 * query, and a handle nobody in the conversation answers to simply matches
 * nothing.
 */
export function resolveDMMentionedUserIds(
  content: string,
  participants: ReadonlyArray<{ user: { username: string }; userId: string }>,
  senderId: string,
): string[] {
  const usernames = extractMentionUsernames(content);

  if (usernames.length === 0) {
    return [];
  }

  const wanted = new Set(usernames);

  return participants
    .filter(
      (participant) =>
        participant.userId !== senderId &&
        wanted.has(participant.user.username.toLocaleLowerCase("en-US")),
    )
    .map((participant) => participant.userId);
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

/**
 * K3 / C2. The gate's projection plus the one column the disappearing stamp
 * needs. It rides the same row, so the window costs no extra statement.
 */
export type SendAuthConversationRow = GroupAuthConversationRow & {
  readonly disappearingAfter: GroupDisappearingWindow;
};

/**
 * The two reads that run in front of the permission gate, plus the write itself.
 * That is deliberate: it makes "no permission, no write" and "the right deadline
 * reaches the row" both testable without a database, and stops short of turning
 * the rest of the send path into a seam nobody asked for.
 */
export type SendDirectMessageDependencies = {
  createMessage: typeof createRealtimeDMMessage;
  /** The third read in front of the write; same rationale as the two below. */
  findBlockedUserIds(userId: string, candidateUserIds: readonly string[]): Promise<Set<string>>;
  loadAuthConversation(
    conversationId: string,
    userId: string,
  ): Promise<SendAuthConversationRow | null>;
  loadNotificationParticipants(conversationId: string): Promise<
    Array<{
      muted: boolean;
      /** 2f §2's tier. `muted` rides along as its mirror for older readers. */
      notifyLevel: DMNotifyLevel;
      user: { displayName: string | null; id: string; locale: string; username: string };
      userId: string;
    }>
  >;
  /** The instant the message is considered sent; the deadline derives from it. */
  now(): Date;
};

const sendDefaults: SendDirectMessageDependencies = {
  createMessage: createRealtimeDMMessage,
  findBlockedUserIds: getBlockedUserIdsForUser,
  loadAuthConversation: (conversationId, userId) =>
    prisma.dMConversation.findUnique({
      where: { id: conversationId },
      select: {
        ...groupAuthSelect,
        disappearingAfter: true,
        participants: {
          where: { userId },
          select: {
            historyFromAt: true,
            joinedAt: true,
            notifyLevel: true,
            pinnedStripDismissedId: true,
            role: true,
            userId: true,
          },
        },
      },
    }),
  loadNotificationParticipants: (conversationId) =>
    prisma.dMParticipant.findMany({
      where: { conversationId },
      select: {
        muted: true,
        notifyLevel: true,
        userId: true,
        user: {
          select: dmNotificationUserSelect,
        },
      },
    }),
  now: () => new Date(),
};

export async function sendDirectMessage(
  input: SendDirectMessageInput,
  dependencies: SendDirectMessageDependencies = sendDefaults,
) {
  const { attachmentInputs, content } = parseDMMessageInputs(input);
  // §4.12 / K4. The `sendMessage` permission is checked here rather than in the
  // route, because sending has two front doors — the HTTP route and the socket
  // handler — and a guard in one of them is a guard the other walks past.
  //
  // The roster read the notification fan-out already needed carries the columns
  // the gate wants, so the check costs one extra statement for the conversation
  // row and none per participant.
  const [conversation, participants] = await Promise.all([
    dependencies.loadAuthConversation(input.conversationId, input.userId),
    dependencies.loadNotificationParticipants(input.conversationId),
  ]);

  const sender = participants.find((participant) => participant.userId === input.userId);
  if (!conversation || !sender) {
    throw new ApiError("You are not a participant in this DM", 403, "FORBIDDEN");
  }

  assertGroupPermission(toGroupAuthContext(conversation, input.userId), "sendMessage");

  await assertUnblockedDMParticipants({
    currentUserId: input.userId,
    findBlockedUserIdsForUser: dependencies.findBlockedUserIds,
    participants,
  });

  const [replyToAuthorId] = await Promise.all([
    assertDMReplyTarget({
      conversationId: input.conversationId,
      replyToId: input.replyToId,
    }),
    assertDMThreadParent({
      conversationId: input.conversationId,
      threadParentId: input.threadParentId,
    }),
  ]);

  const mentionedUserIds = resolveDMMentionedUserIds(content, participants, input.userId);

  const senderName =
    input.senderName ??
    getDMDisplayName({
      username: sender.user.username,
      displayName: sender.user.displayName,
    });

  const { deduplicated, message: createdMessage } = await dependencies.createMessage({
    attachmentInputs,
    ...(input.attribution ? { attribution: input.attribution } : {}),
    clientNonce: input.clientNonce ?? null,
    content,
    conversationId: input.conversationId,
    // C2. The one place a disappearing deadline is stamped, because this is the
    // one path that creates a user message. V6 lives in the argument: the window
    // is read now and applied to this message only — changing it later cannot
    // reach back and re-date anything already written.
    expiresAt: resolveDisappearingExpiry(conversation.disappearingAfter, dependencies.now()),
    forwardOfMessageId: input.forwardOfMessageId ?? null,
    mentionedUserIds,
    notification: {
      mentionedUserIds,
      participants,
      ...(replyToAuthorId ? { replyToAuthorId } : {}),
      senderName,
    },
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

  // A retry gets an answer, not a second announcement: the first attempt already
  // told the other participants, bumped the conversation and moved unread
  // counts. The author still gets their own echo, because the socket sender has
  // no other reply and their optimistic bubble waits on it.
  if (deduplicated) {
    input.io?.to(`user:${input.userId}`).emit("dm:message:new", messagePayload);
    return messagePayload;
  }

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

  const io = input.io;
  if (io) {
    const firstAttachment = createdMessage.attachments[0];
    const preview = getDMConversationPreview(content, firstAttachment);
    const lastMessageAt = createdMessage.createdAt.toISOString();

    // Not awaited. The message copies are already on their way; this is the
    // inbox row every participant sees, and it costs a projection query per
    // conversation that the sender was made to wait for.
    void deferMessageFanout("[dm] Conversation update fan-out failed", async () => {
      const conversationUpdates = await getDMConversationRealtimeUpdates(
        input.conversationId,
        participants,
      );

      for (const update of conversationUpdates) {
        io.to(`user:${update.participantId}`).emit("dm:conversation:updated", {
          conversationId: input.conversationId,
          lastMessageAt,
          preview,
          hiddenAt: null,
          unreadCount: update.unreadCount,
          conversation: update.conversation,
        });
      }
    });
  }

  return messagePayload;
}
