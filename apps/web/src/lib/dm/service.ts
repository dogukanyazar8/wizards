import { randomUUID } from "node:crypto";
import type {
  DMConversationDTO,
  DMMessagePayload,
  DMParticipantDTO,
  MessageThreadSummary,
  MessageReaction,
} from "@wizards/types";
import { Prisma, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  areFriends,
  getBlockStatus,
  haveMutualServers,
} from "@/lib/friends/helpers";
import { getRedis } from "@/lib/redis";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { readPresenceMap, type PresenceFields } from "@/lib/presence";
import { canStartDirectMessage } from "@/lib/privacy-policy";
import type {
  DMConversationsPageResponse,
  DMMessagesResponse,
} from "./types";

export const dmAuthorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  status: true,
  customStatus: true,
} as const;

const dmParticipantUserSelect = {
  ...dmAuthorSelect,
  customStatus: true,
} as const;

export const dmNotificationUserSelect = {
  ...dmAuthorSelect,
  locale: true,
} as const;

export const dmAttachmentSelect = {
  id: true,
  url: true,
  filename: true,
  contentType: true,
  size: true,
  width: true,
  height: true,
  duration: true,
  thumbnailUrl: true,
} as const;

const dmReplyInclude = {
  author: { select: dmAuthorSelect },
  attachments: { select: dmAttachmentSelect },
  reply: {
    include: {
      author: { select: dmAuthorSelect },
      attachments: { select: dmAttachmentSelect },
    },
  },
} as const;

export const dmMessageInclude = {
  author: { select: dmAuthorSelect },
  attachments: { select: dmAttachmentSelect },
  reply: { include: dmReplyInclude },
} as const;

const dmConversationInclude = {
  participants: {
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      unreadCount: true,
      hiddenAt: true,
      user: { select: dmParticipantUserSelect },
    },
  },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: dmMessageInclude,
  },
} as const;

type DMMessageNode = {
  id: string;
  conversationId: string;
  userId: string;
  content: string;
  replyToId: string | null;
  threadParentId: string | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
    customStatus: string | null;
  };
  attachments: Array<{
    id: string;
    url: string;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
    duration: number | null;
    thumbnailUrl: string | null;
  }>;
  reactions?: Array<{
    emoji: string;
    userId: string;
  }>;
  reply?: DMMessageNode | null;
};

type RawDMMessage = Prisma.DMMessageGetPayload<{
  include: typeof dmMessageInclude;
}>;

type RawDMConversation = Prisma.DMConversationGetPayload<{
  include: typeof dmConversationInclude;
}>;

type DMReactionRow = {
  emoji: string;
  messageId: string;
  userId: string;
};

type DMConversationPageRow = {
  conversationId: string;
  participantId: string;
};

type DMThreadSummaryRow = {
  lastReplyAt: Date | null;
  replyCount: number;
  threadParentId: string;
};

async function readPresence(userId: string, fallback: PresenceFields): Promise<PresenceFields> {
  const presence = await readPresenceMap(getRedis(), [{ ...fallback, userId }]);
  return presence.get(userId) ?? fallback;
}

function normalizeConversationType(type: string): DMConversationDTO["type"] {
  return type === "GROUP_DM" ? "GROUP_DM" : "DM";
}

function validateDMReactionEmoji(emoji: string) {
  const trimmed = emoji.trim();
  if (!trimmed || trimmed.length > 64) {
    throw new ApiError("Invalid emoji", 400, "INVALID_EMOJI");
  }

  return trimmed;
}

function groupDMReactions(
  reactions: Array<{ emoji: string; userId: string }> = [],
): MessageReaction[] {
  const grouped = new Map<string, Set<string>>();

  for (const reaction of reactions) {
    if (!grouped.has(reaction.emoji)) {
      grouped.set(reaction.emoji, new Set());
    }

    grouped.get(reaction.emoji)!.add(reaction.userId);
  }

  return Array.from(grouped.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.size,
    userIds: Array.from(userIds),
  }));
}

function createEmptyThreadSummary(): MessageThreadSummary {
  return {
    replyCount: 0,
    lastReplyAt: null,
    recentRepliers: [],
  };
}

async function getDMThreadSummaryMap(parentMessageIds: string[]) {
  if (parentMessageIds.length === 0) {
    return new Map<string, MessageThreadSummary>();
  }

  const counts = await prisma.$queryRaw<DMThreadSummaryRow[]>(Prisma.sql`
    SELECT
      "threadParentId",
      COUNT(*)::int AS "replyCount",
      MAX("createdAt") AS "lastReplyAt"
    FROM "DMMessage"
    WHERE "threadParentId" IN (${Prisma.join(parentMessageIds)})
      AND "deletedAt" IS NULL
    GROUP BY "threadParentId"
  `);

  const latestReplies = await prisma.dMMessage.findMany({
    where: {
      threadParentId: { in: parentMessageIds },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(parentMessageIds.length * 4, 200),
    select: {
      threadParentId: true,
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const summaries = new Map<string, MessageThreadSummary>();
  for (const row of counts) {
    if (!row.threadParentId) {
      continue;
    }

    summaries.set(row.threadParentId, {
      replyCount: row.replyCount,
      lastReplyAt: row.lastReplyAt?.toISOString() ?? null,
      recentRepliers: [],
    });
  }

  for (const reply of latestReplies) {
    if (!reply.threadParentId) {
      continue;
    }

    const summary = summaries.get(reply.threadParentId);
    if (!summary || summary.recentRepliers.some((user) => user.userId === reply.author.id)) {
      continue;
    }

    if (summary.recentRepliers.length < 3) {
      summary.recentRepliers.push({
        userId: reply.author.id,
        username: reply.author.username,
        displayName: reply.author.displayName,
        avatarUrl: reply.author.avatarUrl,
      });
    }
  }

  return summaries;
}

async function getDMReactionMap(messageIds: string[]) {
  if (messageIds.length === 0) {
    return new Map<string, DMReactionRow[]>();
  }

  const rows = await prisma.$queryRaw<DMReactionRow[]>(Prisma.sql`
    SELECT "messageId", "emoji", "userId"
    FROM "DMReaction"
    WHERE "messageId" IN (${Prisma.join(messageIds)})
  `);
  const reactionsByMessageId = new Map<string, DMReactionRow[]>();

  for (const row of rows) {
    const current = reactionsByMessageId.get(row.messageId) ?? [];
    current.push(row);
    reactionsByMessageId.set(row.messageId, current);
  }

  return reactionsByMessageId;
}

export function getDMDisplayName(user: {
  username: string;
  displayName: string | null;
}) {
  return user.displayName ?? user.username;
}

async function mapDMParticipant(
  participant: RawDMConversation["participants"][number],
): Promise<DMParticipantDTO> {
  const presence = await readPresence(participant.userId, {
    status: "OFFLINE",
    customStatus: participant.user.customStatus,
  });

  return {
    userId: participant.userId,
    username: participant.user.username,
    displayName: participant.user.displayName,
    avatarUrl: participant.user.avatarUrl,
    unreadCount: participant.unreadCount,
    status: presence.status,
    customStatus: presence.customStatus,
    presence,
  };
}

function mapDMReply(
  message: DMMessageNode | null | undefined,
  depth: number,
  reactionsByMessageId: Map<string, DMReactionRow[]> = new Map(),
  threadSummaryByMessageId: Map<string, MessageThreadSummary> = new Map(),
): DMMessagePayload | null {
  if (!message) {
    return null;
  }

  const nextReply =
    depth > 0
      ? mapDMReply(
          message.reply ?? null,
          depth - 1,
          reactionsByMessageId,
          threadSummaryByMessageId,
        )
      : null;

  return {
    id: message.id,
    conversationId: message.conversationId,
    userId: message.userId,
    content: message.deletedAt ? "" : message.content,
    replyToId: message.replyToId,
    threadParentId: message.threadParentId,
    threadSummary: threadSummaryByMessageId.get(message.id) ?? createEmptyThreadSummary(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    author: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName,
      avatarUrl: message.author.avatarUrl,
      status:
        message.author.status === "ONLINE" ||
        message.author.status === "IDLE" ||
        message.author.status === "DND"
          ? message.author.status
          : "OFFLINE",
      customStatus: message.author.customStatus,
    },
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
      duration: attachment.duration,
      thumbnailUrl: attachment.thumbnailUrl,
    })),
    reactions: groupDMReactions(
      reactionsByMessageId.get(message.id) ?? message.reactions ?? [],
    ),
    replyTo: nextReply,
  };
}

export function mapDMMessagePayload(
  message: RawDMMessage,
  reactionsByMessageId?: Map<string, DMReactionRow[]>,
  threadSummaryByMessageId?: Map<string, MessageThreadSummary>,
): DMMessagePayload {
  return mapDMReply(
    message,
    2,
    reactionsByMessageId,
    threadSummaryByMessageId,
  ) as DMMessagePayload;
}

export async function mapDMMessagePayloadWithReactions(
  message: RawDMMessage,
): Promise<DMMessagePayload> {
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap([message.id]),
    getDMThreadSummaryMap([message.id]),
  ]);
  return mapDMMessagePayload(message, reactionsByMessageId, threadSummaryByMessageId);
}

async function getDeletedMessageLabel(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });

  return translate(normalizeAppLocale(user?.locale), "dm.message.deleted");
}

function resolveConversationName(conversation: RawDMConversation, viewerId: string) {
  if (conversation.name) {
    return conversation.name;
  }

  if (conversation.type !== "DM") {
    return null;
  }

  const otherParticipant = conversation.participants.find(
    (participant) => participant.userId !== viewerId,
  );

  return otherParticipant ? getDMDisplayName(otherParticipant.user) : null;
}

function mapConversationLastMessage(
  conversation: RawDMConversation,
  deletedMessageLabel: string,
) {
  const latestMessage = conversation.messages[0];

  if (!latestMessage) {
    return null;
  }

  const payload = mapDMMessagePayload(latestMessage);

  if (!payload.deletedAt) {
    return payload;
  }

  return {
    ...payload,
    content: deletedMessageLabel,
  };
}

export async function mapDMConversationDTO(
  conversation: RawDMConversation,
  viewerId: string,
  deletedMessageLabel: string,
): Promise<DMConversationDTO> {
  return {
    id: conversation.id,
    type: normalizeConversationType(conversation.type),
    name: resolveConversationName(conversation, viewerId),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    participants: await Promise.all(conversation.participants.map(mapDMParticipant)),
    lastMessage: mapConversationLastMessage(conversation, deletedMessageLabel),
  };
}

export async function requireDMParticipant(userId: string, conversationId: string) {
  const participant = await prisma.dMParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    select: { id: true },
  });

  if (!participant) {
    throw new ApiError("You are not a participant in this conversation", 403);
  }
}

async function findDirectConversation(userId: string, targetUserId: string) {
  return prisma.dMConversation.findFirst({
    where: {
      type: "DM",
      AND: [
        {
          participants: {
            some: { userId },
          },
        },
        {
          participants: {
            some: { userId: targetUserId },
          },
        },
        {
          participants: {
            every: {
              userId: { in: [userId, targetUserId] },
            },
          },
        },
      ],
    },
    include: dmConversationInclude,
  });
}

export async function createOrOpenDirectMessage(
  userId: string,
  targetUserId: string,
): Promise<DMConversationDTO> {
  if (userId === targetUserId) {
    throw new ApiError("Cannot DM yourself", 400);
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (!targetUser) {
    throw new ApiError("User not found", 404, "NOT_FOUND");
  }

  const blockStatus = await getBlockStatus(userId, targetUserId);
  if (blockStatus.blocked) {
    throw new ApiError("You cannot DM this user", 403, "BLOCKED");
  }

  const [isFriend, targetSettings, sharesMutualServers] = await Promise.all([
    areFriends(userId, targetUserId),
    prisma.userSettings.findUnique({
      where: { userId: targetUserId },
      select: { dmPolicy: true },
    }),
    haveMutualServers(userId, targetUserId),
  ]);
  const dmPolicy = targetSettings?.dmPolicy ?? "FRIENDS";

  if (
    !canStartDirectMessage(dmPolicy, {
      areFriends: isFriend,
      haveMutualServers: sharesMutualServers,
    })
  ) {
    throw new ApiError("You cannot DM this user", 403, "DM_POLICY");
  }

  const existingConversation = await findDirectConversation(userId, targetUserId);
  const deletedMessageLabel = await getDeletedMessageLabel(userId);

  if (existingConversation) {
    const currentParticipant = existingConversation.participants.find(
      (participant) => participant.userId === userId,
    );

    if (currentParticipant?.hiddenAt) {
      await prisma.dMParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: existingConversation.id,
            userId,
          },
        },
        data: { hiddenAt: null },
      });
    }

    return await mapDMConversationDTO(existingConversation, userId, deletedMessageLabel);
  }

  const conversation = await prisma.dMConversation.create({
    data: {
      type: "DM",
      participants: {
        create: [{ userId }, { userId: targetUserId }],
      },
    },
    include: dmConversationInclude,
  });

  return await mapDMConversationDTO(conversation, userId, deletedMessageLabel);
}

export async function listDirectMessages(
  userId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {},
): Promise<DMConversationsPageResponse> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const deletedMessageLabel = await getDeletedMessageLabel(userId);
  let cursorSql = Prisma.sql``;

  if (options.cursor) {
    const cursorConversation = await prisma.dMConversation.findFirst({
      where: {
        id: options.cursor,
        participants: {
          some: {
            userId,
          },
        },
      },
      select: {
        id: true,
        lastMessageAt: true,
      },
    });

    if (!cursorConversation) {
      throw new ApiError("Conversation not found", 404, "NOT_FOUND");
    }

    cursorSql = Prisma.sql`
      AND (
        c."lastMessageAt" < ${cursorConversation.lastMessageAt}
        OR (
          c."lastMessageAt" = ${cursorConversation.lastMessageAt}
          AND c."id" < ${cursorConversation.id}
        )
      )
    `;
  }

  const rows = await prisma.$queryRaw<DMConversationPageRow[]>(Prisma.sql`
    SELECT
      p."id" AS "participantId",
      p."conversationId" AS "conversationId"
    FROM "DMParticipant" p
    INNER JOIN "DMConversation" c
      ON c."id" = p."conversationId"
    WHERE p."userId" = ${userId}
      AND (
        p."hiddenAt" IS NULL
        OR c."lastMessageAt" > p."hiddenAt"
      )
      ${cursorSql}
    ORDER BY c."lastMessageAt" DESC, c."id" DESC
    LIMIT ${limit + 1}
  `);

  const pageRows = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? pageRows.at(-1)?.conversationId ?? null : null;

  if (pageRows.length === 0) {
    return {
      conversations: [],
      nextCursor: null,
    };
  }

  const participations = await prisma.dMParticipant.findMany({
    where: {
      id: {
        in: pageRows.map((row) => row.participantId),
      },
    },
    include: {
      conversation: {
        include: dmConversationInclude,
      },
    },
  });

  const participationById = new Map(
    participations.map((participant) => [participant.id, participant]),
  );
  const conversations = await Promise.all(
    pageRows
      .map((row) => participationById.get(row.participantId))
      .filter((participant): participant is NonNullable<typeof participant> =>
        Boolean(participant),
      )
      .map((participant) =>
        mapDMConversationDTO(participant.conversation, userId, deletedMessageLabel),
      ),
  );

  return {
    conversations,
    nextCursor,
  };
}

export async function getDirectMessageConversationForUser(
  conversationId: string,
  userId: string,
): Promise<DMConversationDTO> {
  const [deletedMessageLabel, conversation] = await Promise.all([
    getDeletedMessageLabel(userId),
    prisma.dMConversation.findUnique({
      where: { id: conversationId },
      include: dmConversationInclude,
    }),
  ]);

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  return mapDMConversationDTO(conversation, userId, deletedMessageLabel);
}

export async function listDMMessages(
  userId: string,
  conversationId: string,
  cursor: string | undefined,
  limit: number,
): Promise<DMMessagesResponse> {
  await requireDMParticipant(userId, conversationId);

  let cursorCreatedAt: Date | null = null;
  if (cursor) {
    const cursorMessage = await prisma.dMMessage.findFirst({
      where: {
        id: cursor,
        conversationId,
      },
      select: { createdAt: true },
    });

    if (!cursorMessage) {
      throw new ApiError("Message not found", 404, "NOT_FOUND");
    }

    cursorCreatedAt = cursorMessage.createdAt;
  }

  const messages = await prisma.dMMessage.findMany({
    where: {
      conversationId,
      threadParentId: null,
      ...(cursorCreatedAt
        ? {
            createdAt: {
              lt: cursorCreatedAt,
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: dmMessageInclude,
  });

  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? pageMessages[pageMessages.length - 1]?.id ?? null : null;
  const messageIds = pageMessages.map((message) => message.id);
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap(messageIds),
    getDMThreadSummaryMap(messageIds),
  ]);

  return {
    messages: [...pageMessages]
      .reverse()
      .map((message) =>
        mapDMMessagePayload(message, reactionsByMessageId, threadSummaryByMessageId),
      ),
    nextCursor,
  };
}

export async function listDMThreadMessages(
  userId: string,
  conversationId: string,
  parentMessageId: string,
  cursor: string | undefined,
  limit: number,
): Promise<DMMessagesResponse & { parent: DMMessagePayload }> {
  await requireDMParticipant(userId, conversationId);

  const parent = await prisma.dMMessage.findFirst({
    where: {
      id: parentMessageId,
      conversationId,
      threadParentId: null,
    },
    include: dmMessageInclude,
  });

  if (!parent) {
    throw new ApiError("Thread parent message not found", 404, "THREAD_PARENT_NOT_FOUND");
  }

  let cursorCreatedAt: Date | null = null;
  if (cursor) {
    const cursorMessage = await prisma.dMMessage.findFirst({
      where: {
        id: cursor,
        conversationId,
        threadParentId: parentMessageId,
      },
      select: { createdAt: true },
    });

    if (!cursorMessage) {
      throw new ApiError("Message not found", 404, "NOT_FOUND");
    }

    cursorCreatedAt = cursorMessage.createdAt;
  }

  const messages = await prisma.dMMessage.findMany({
    where: {
      conversationId,
      threadParentId: parentMessageId,
      ...(cursorCreatedAt
        ? {
            createdAt: {
              lt: cursorCreatedAt,
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: dmMessageInclude,
  });

  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(0, limit) : messages;
  const nextCursor = hasMore ? pageMessages[pageMessages.length - 1]?.id ?? null : null;
  const messageIds = [parent.id, ...pageMessages.map((message) => message.id)];
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap(messageIds),
    getDMThreadSummaryMap([parent.id]),
  ]);

  return {
    parent: mapDMMessagePayload(parent, reactionsByMessageId, threadSummaryByMessageId),
    messages: [...pageMessages]
      .reverse()
      .map((message) => mapDMMessagePayload(message, reactionsByMessageId)),
    nextCursor,
  };
}

export async function markDirectMessageRead(userId: string, conversationId: string) {
  await requireDMParticipant(userId, conversationId);

  await prisma.dMParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      lastReadAt: new Date(),
      unreadCount: 0,
    },
  });
}

export async function hideDirectMessage(userId: string, conversationId: string) {
  await requireDMParticipant(userId, conversationId);

  await prisma.dMParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      hiddenAt: new Date(),
    },
  });
}

export async function toggleDMReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<MessageReaction[]> {
  return setDMReaction(messageId, userId, emoji, undefined);
}

export async function setDMReaction(
  messageId: string,
  userId: string,
  emoji: string,
  shouldReact: boolean | undefined,
): Promise<MessageReaction[]> {
  const normalizedEmoji = validateDMReactionEmoji(emoji);
  const message = await prisma.dMMessage.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      deletedAt: true,
    },
  });

  if (!message || message.deletedAt) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  await requireDMParticipant(userId, message.conversationId);

  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "DMReaction"
    WHERE "messageId" = ${messageId}
      AND "userId" = ${userId}
      AND "emoji" = ${normalizedEmoji}
    LIMIT 1
  `);

  if (existing[0] && shouldReact !== true) {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "DMReaction"
      WHERE "id" = ${existing[0].id}
    `);
  } else if (!existing[0] && shouldReact !== false) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "DMReaction" ("id", "messageId", "userId", "emoji", "createdAt")
      VALUES (${randomUUID()}, ${messageId}, ${userId}, ${normalizedEmoji}, CURRENT_TIMESTAMP)
    `);
  }

  const reactions = await prisma.$queryRaw<DMReactionRow[]>(Prisma.sql`
    SELECT "messageId", "emoji", "userId"
    FROM "DMReaction"
    WHERE "messageId" = ${messageId}
  `);

  return groupDMReactions(reactions);
}
