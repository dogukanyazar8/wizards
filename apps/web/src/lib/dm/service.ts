import { randomUUID } from "node:crypto";
import {
  MESSAGE_CONTENT_DEFAULT_LIMIT,
  type DMConversationDTO,
  type DMMessagePayload,
  type DMParticipantDTO,
  type MessageReaction,
  type MessageThreadSummary,
} from "@wizards/types";
import { Prisma, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { areFriends, getBlockStatus, haveMutualServers } from "@/lib/friends/helpers";
import { resolveLastSeenAtByUserId } from "@/lib/friends/last-seen";
import { getRedis } from "@/lib/redis";
import { normalizeAppLocale, translate } from "@/lib/locale";
import { mapAttachmentsForViewer } from "@/lib/messages/attachment-visibility";
import { readPresenceMap, type PresenceFields } from "@/lib/presence";
import { canStartDirectMessage } from "@/lib/privacy-policy";
import type {
  DMConversationsPageResponse,
  DMMessagesResponse,
  DMMutualServerSummary,
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
  userId: true,
  url: true,
  filename: true,
  contentType: true,
  size: true,
  width: true,
  height: true,
  duration: true,
  thumbnailUrl: true,
  scanStatus: true,
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

export const dmConversationInclude = {
  participants: {
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      unreadCount: true,
      muted: true,
      hiddenAt: true,
      user: { select: dmParticipantUserSelect },
    },
  },
  messages: {
    where: { placeholderRemovedAt: null },
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
  forwardedAt: Date | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedById: string | null;
  placeholderRemovedAt: Date | null;
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
    userId: string;
    url: string;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
    duration: number | null;
    thumbnailUrl: string | null;
    scanStatus: "PENDING" | "CLEAN" | "INFECTED" | "ERROR";
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
  avatarUrl: string | null;
  createdAt: Date | null;
  displayName: string | null;
  emoji: string;
  messageId: string;
  userId: string;
  username: string;
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

function getPresenceFallback(
  participant: RawDMConversation["participants"][number],
): PresenceFields {
  return {
    status: "OFFLINE",
    customStatus: participant.user.customStatus,
  };
}

async function readDMConversationPresenceMap(conversation: RawDMConversation) {
  return readPresenceMap(
    getRedis(),
    conversation.participants.map((participant) => ({
      ...getPresenceFallback(participant),
      userId: participant.userId,
    })),
  );
}

/**
 * The chat header's "Son görülme" line. Redis presence only says online/offline
 * right now, so an offline partner needs the same `AppSession.lastSeenAt` the
 * friends list reads — the header used to print `lastMessageAt` instead, which
 * moves whenever *either* side sends and therefore described the conversation,
 * not the partner.
 */
async function readDMConversationLastSeenMap(conversation: RawDMConversation) {
  return resolveLastSeenAtByUserId(
    conversation.participants.map((participant) => participant.userId),
  );
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
  reactions: Array<{
    avatarUrl?: string | null;
    createdAt?: Date | null;
    displayName?: string | null;
    emoji: string;
    userId: string;
    username?: string;
  }> = [],
): MessageReaction[] {
  const grouped = new Map<
    string,
    {
      userIds: Set<string>;
      users: Map<
        string,
        {
          id: string;
          username: string;
          displayName: string | null;
          avatarUrl: string | null;
          reactedAt?: string;
        }
      >;
    }
  >();

  for (const reaction of reactions) {
    if (!grouped.has(reaction.emoji)) {
      grouped.set(reaction.emoji, { userIds: new Set(), users: new Map() });
    }

    const entry = grouped.get(reaction.emoji)!;
    entry.userIds.add(reaction.userId);
    entry.users.set(reaction.userId, {
      id: reaction.userId,
      username: reaction.username ?? reaction.userId,
      displayName: reaction.displayName ?? null,
      avatarUrl: reaction.avatarUrl ?? null,
      ...(reaction.createdAt ? { reactedAt: reaction.createdAt.toISOString() } : {}),
    });
  }

  return Array.from(grouped.entries()).map(([emoji, entry]) => ({
    emoji,
    count: entry.userIds.size,
    userIds: Array.from(entry.userIds),
    users: Array.from(entry.users.values()),
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
        AND "placeholderRemovedAt" IS NULL
      GROUP BY "threadParentId"
    `);

  const latestReplies = await prisma.dMMessage.findMany({
    where: {
      threadParentId: { in: parentMessageIds },
      deletedAt: null,
      placeholderRemovedAt: null,
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
    SELECT
      r."messageId",
      r."emoji",
      r."userId",
      r."createdAt",
      u."username",
      u."displayName",
      u."avatarUrl"
    FROM "DMReaction" r
    INNER JOIN "User" u ON u."id" = r."userId"
    WHERE r."messageId" IN (${Prisma.join(messageIds)})
  `);
  const reactionsByMessageId = new Map<string, DMReactionRow[]>();

  for (const row of rows) {
    const current = reactionsByMessageId.get(row.messageId) ?? [];
    current.push(row);
    reactionsByMessageId.set(row.messageId, current);
  }

  return reactionsByMessageId;
}

export function getDMDisplayName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username;
}

function mapDMParticipantWithPresence(
  participant: RawDMConversation["participants"][number],
  presence: PresenceFields,
  lastSeenAt: string | null,
): DMParticipantDTO {
  return {
    userId: participant.userId,
    username: participant.user.username,
    displayName: participant.user.displayName,
    avatarUrl: participant.user.avatarUrl,
    unreadCount: participant.unreadCount,
    muted: participant.muted,
    lastSeenAt,
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
  viewerId?: string | null,
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
          viewerId,
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
    forwardedAt: message.forwardedAt?.toISOString() ?? null,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    deletedById: message.deletedById,
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
    attachments: mapAttachmentsForViewer(message.attachments, viewerId).map((attachment) => ({
      ...attachment,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      duration: attachment.duration ?? null,
      thumbnailUrl: attachment.thumbnailUrl ?? null,
    })),
    reactions: groupDMReactions(reactionsByMessageId.get(message.id) ?? message.reactions ?? []),
    replyTo: nextReply,
  };
}

export function mapDMMessagePayload(
  message: RawDMMessage,
  reactionsByMessageId?: Map<string, DMReactionRow[]>,
  threadSummaryByMessageId?: Map<string, MessageThreadSummary>,
  viewerId?: string | null,
): DMMessagePayload {
  return mapDMReply(
    message,
    2,
    reactionsByMessageId,
    threadSummaryByMessageId,
    viewerId,
  ) as DMMessagePayload;
}

export async function mapDMMessagePayloadWithReactions(
  message: RawDMMessage,
  viewerId?: string | null,
): Promise<DMMessagePayload> {
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap([message.id]),
    getDMThreadSummaryMap([message.id]),
  ]);
  return mapDMMessagePayload(message, reactionsByMessageId, threadSummaryByMessageId, viewerId);
}

function getDeletedMessageLabelForLocale(locale: string | null | undefined) {
  return translate(normalizeAppLocale(locale), "dm.message.deleted");
}

export async function getDeletedMessageLabel(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true },
  });

  return getDeletedMessageLabelForLocale(user?.locale);
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
  viewerId: string,
) {
  const latestMessage = conversation.messages[0];

  if (!latestMessage) {
    return null;
  }

  const payload = mapDMMessagePayload(latestMessage, undefined, undefined, viewerId);

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
  /**
   * Pre-resolved for a page of conversations, so a list is one last-seen query
   * for every participant on the page rather than one per conversation.
   */
  lastSeenByUserId?: Map<string, string>,
): Promise<DMConversationDTO> {
  const [presenceByUserId, resolvedLastSeenByUserId] = await Promise.all([
    readDMConversationPresenceMap(conversation),
    lastSeenByUserId ?? readDMConversationLastSeenMap(conversation),
  ]);
  return mapDMConversationDTOWithPresence(
    conversation,
    viewerId,
    deletedMessageLabel,
    presenceByUserId,
    resolvedLastSeenByUserId,
  );
}

function mapDMConversationDTOWithPresence(
  conversation: RawDMConversation,
  viewerId: string,
  deletedMessageLabel: string,
  presenceByUserId: Map<string, PresenceFields>,
  lastSeenByUserId: Map<string, string>,
): DMConversationDTO {
  return {
    id: conversation.id,
    type: normalizeConversationType(conversation.type),
    name: resolveConversationName(conversation, viewerId),
    iconUrl: conversation.iconUrl,
    ownerId: conversation.ownerId,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    participants: conversation.participants.map((participant) =>
      mapDMParticipantWithPresence(
        participant,
        presenceByUserId.get(participant.userId) ?? getPresenceFallback(participant),
        lastSeenByUserId.get(participant.userId) ?? null,
      ),
    ),
    lastMessage: mapConversationLastMessage(conversation, deletedMessageLabel, viewerId),
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
  const nextCursor = rows.length > limit ? (pageRows.at(-1)?.conversationId ?? null) : null;

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
  // One last-seen read for the whole page. Resolving it inside the per-row
  // mapper would put a `groupBy` behind every conversation on the page.
  const lastSeenByUserId = await resolveLastSeenAtByUserId(
    participations.flatMap((participation) =>
      participation.conversation.participants.map((participant) => participant.userId),
    ),
  );
  const conversations = await Promise.all(
    pageRows
      .map((row) => participationById.get(row.participantId))
      .filter((participant): participant is NonNullable<typeof participant> => Boolean(participant))
      .map((participant) =>
        mapDMConversationDTO(
          participant.conversation,
          userId,
          deletedMessageLabel,
          lastSeenByUserId,
        ),
      ),
  );

  return {
    conversations,
    nextCursor,
  };
}

export async function getDirectMessageUnreadCount(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ totalUnreadCount: number }>>(Prisma.sql`
    SELECT COALESCE(SUM(p."unreadCount"), 0)::int AS "totalUnreadCount"
    FROM "DMParticipant" p
    INNER JOIN "DMConversation" c ON c."id" = p."conversationId"
    WHERE p."userId" = ${userId}
      AND (p."hiddenAt" IS NULL OR c."lastMessageAt" > p."hiddenAt")
  `);

  return rows[0]?.totalUnreadCount ?? 0;
}

export async function getDirectMessageConversationForUser(
  conversationId: string,
  userId: string,
): Promise<DMConversationDTO> {
  const [deletedMessageLabel, conversation] = await Promise.all([
    getDeletedMessageLabel(userId),
    prisma.dMConversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: { userId },
        },
      },
      include: dmConversationInclude,
    }),
  ]);

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  return mapDMConversationDTO(conversation, userId, deletedMessageLabel);
}

export async function listDirectMessageMutualServers(
  requesterId: string,
  targetUserId: string,
  options: {
    limit?: number;
  } = {},
): Promise<DMMutualServerSummary[]> {
  if (!targetUserId || requesterId === targetUserId) {
    return [];
  }

  const limit = Math.min(Math.max(options.limit ?? 6, 1), 12);
  const memberships = await prisma.serverMember.findMany({
    where: {
      pending: false,
      userId: requesterId,
      server: {
        members: {
          some: {
            pending: false,
            userId: targetUserId,
          },
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
    select: {
      server: {
        select: {
          _count: {
            select: {
              members: true,
            },
          },
          iconUrl: true,
          id: true,
          name: true,
          shortName: true,
        },
      },
    },
    take: limit,
  });

  return memberships.map(({ server }) => ({
    iconUrl: server.iconUrl,
    id: server.id,
    memberCount: server._count.members,
    name: server.name,
    shortName: server.shortName,
  }));
}

/**
 * Every photo and video ever shared in a conversation. The details payload only
 * carries the newest page of messages, so the summary it derives cannot be
 * counted — the 1c profile header ("PAYLAŞILAN MEDYA — N") needs the real total
 * and this is one indexed count rather than a second history walk.
 */
export async function countDirectMessageMediaAttachments(conversationId: string): Promise<number> {
  return prisma.attachment.count({
    where: {
      dmMessage: { conversationId, deletedAt: null },
      OR: [{ contentType: { startsWith: "image/" } }, { contentType: { startsWith: "video/" } }],
    },
  });
}

export async function getDirectMessageConversationRealtimeViews(
  conversationId: string,
  userIds: string[],
): Promise<
  Array<{
    conversation: DMConversationDTO;
    participantId: string;
    unreadCount: number;
  }>
> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const conversation = await prisma.dMConversation.findUnique({
    where: { id: conversationId },
    include: dmConversationInclude,
  });

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  const participantIds = new Set(
    conversation.participants.map((participant) => participant.userId),
  );
  const latestMessageDeleted = Boolean(conversation.messages[0]?.deletedAt);
  const [localeByUserId, presenceByUserId, lastSeenByUserId] = await Promise.all([
    latestMessageDeleted
      ? prisma.user
          .findMany({
            where: { id: { in: uniqueUserIds } },
            select: { id: true, locale: true },
          })
          .then((users) => new Map(users.map((user) => [user.id, user.locale])))
      : Promise.resolve(new Map<string, string | null>()),
    readDMConversationPresenceMap(conversation),
    readDMConversationLastSeenMap(conversation),
  ]);
  const defaultDeletedMessageLabel = getDeletedMessageLabelForLocale(null);

  return uniqueUserIds
    .filter((userId) => participantIds.has(userId))
    .map((participantId) => {
      const currentParticipant = conversation.participants.find(
        (candidate) => candidate.userId === participantId,
      );

      return {
        participantId,
        unreadCount: currentParticipant?.unreadCount ?? 0,
        conversation: mapDMConversationDTOWithPresence(
          conversation,
          participantId,
          latestMessageDeleted
            ? getDeletedMessageLabelForLocale(localeByUserId.get(participantId))
            : defaultDeletedMessageLabel,
          presenceByUserId,
          lastSeenByUserId,
        ),
      };
    });
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
      placeholderRemovedAt: null,
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
  const nextCursor = hasMore ? (pageMessages[pageMessages.length - 1]?.id ?? null) : null;
  const messageIds = pageMessages.map((message) => message.id);
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap(messageIds),
    getDMThreadSummaryMap(messageIds),
  ]);

  return {
    messages: [...pageMessages]
      .reverse()
      .map((message) =>
        mapDMMessagePayload(message, reactionsByMessageId, threadSummaryByMessageId, userId),
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
      placeholderRemovedAt: null,
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
      placeholderRemovedAt: null,
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
  const nextCursor = hasMore ? (pageMessages[pageMessages.length - 1]?.id ?? null) : null;
  const messageIds = [parent.id, ...pageMessages.map((message) => message.id)];
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap(messageIds),
    getDMThreadSummaryMap([parent.id]),
  ]);

  return {
    parent: mapDMMessagePayload(parent, reactionsByMessageId, threadSummaryByMessageId, userId),
    messages: [...pageMessages]
      .reverse()
      .map((message) => mapDMMessagePayload(message, reactionsByMessageId, undefined, userId)),
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

export async function getDirectMessageParticipantReadStates(conversationId: string) {
  return prisma.dMParticipant.findMany({
    where: { conversationId },
    orderBy: { userId: "asc" },
    select: { lastDeliveredAt: true, lastReadAt: true, userId: true },
  });
}

export type DirectMessageDeliveryMark = {
  readonly conversationId: string;
  readonly lastDeliveredAt: Date;
  /** Everyone to notify, the delivering participant included. */
  readonly participantUserIds: readonly string[];
};

/**
 * Messaging redesign §2 "1a".6.4: marks that this participant's client now holds
 * everything in these conversations, which is the sender's second tick.
 *
 * Only conversations whose newest message is younger than the existing mark are
 * touched, so re-opening the list on a quiet account writes nothing and emits
 * nothing. Membership is the `where` clause rather than a separate guard: a
 * conversation the caller does not participate in simply matches no row.
 */
export async function markDirectMessagesDelivered(
  userId: string,
  conversationIds: readonly string[],
  now: Date = new Date(),
): Promise<readonly DirectMessageDeliveryMark[]> {
  const ids = [...new Set(conversationIds)].filter((id) => id.length > 0);
  if (ids.length === 0) {
    return [];
  }

  const rows = await prisma.dMParticipant.findMany({
    where: { conversationId: { in: ids }, userId },
    select: {
      conversationId: true,
      lastDeliveredAt: true,
      conversation: {
        select: {
          lastMessageAt: true,
          participants: { select: { userId: true } },
        },
      },
    },
  });

  const stale = rows.filter((row) => {
    const { lastMessageAt } = row.conversation;
    return lastMessageAt !== null && (!row.lastDeliveredAt || row.lastDeliveredAt < lastMessageAt);
  });
  if (stale.length === 0) {
    return [];
  }

  await prisma.dMParticipant.updateMany({
    where: { conversationId: { in: stale.map((row) => row.conversationId) }, userId },
    data: { lastDeliveredAt: now },
  });

  return stale.map((row) => ({
    conversationId: row.conversationId,
    lastDeliveredAt: now,
    participantUserIds: row.conversation.participants.map((participant) => participant.userId),
  }));
}

export async function markDirectMessageUnread(userId: string, conversationId: string) {
  await requireDMParticipant(userId, conversationId);

  await prisma.dMParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      lastReadAt: null,
      unreadCount: 1,
    },
  });
}

export async function setDirectMessageMuted(
  userId: string,
  conversationId: string,
  muted: boolean,
) {
  await requireDMParticipant(userId, conversationId);

  await prisma.dMParticipant.update({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    data: {
      muted,
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

type DMMessageMutationOptions = {
  conversationId?: string;
};

export type DMMessageRealtimeView = {
  message: DMMessagePayload;
  userId: string;
};

export type DMMessageEditResult = {
  message: DMMessagePayload;
  realtimeViews: DMMessageRealtimeView[];
};

export type DMDeleteMessageResult =
  | {
      conversationId: string;
      placeholderExpiresAt: null;
      status: "deleted";
    }
  | {
      conversationId: string;
      status: "removed";
    };

function validateEditableDMMessageContent(content: unknown) {
  const nextContent = typeof content === "string" ? content.trim() : "";
  if (!nextContent || nextContent.length > MESSAGE_CONTENT_DEFAULT_LIMIT) {
    throw new ApiError(
      `Message content must be between 1 and ${MESSAGE_CONTENT_DEFAULT_LIMIT} characters.`,
      400,
      "VALIDATION_ERROR",
    );
  }

  return nextContent;
}

async function mapDMMessageRealtimeViews(message: RawDMMessage, userIds: string[]) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const [reactionsByMessageId, threadSummaryByMessageId] = await Promise.all([
    getDMReactionMap([message.id]),
    getDMThreadSummaryMap([message.id]),
  ]);

  return uniqueUserIds.map((userId) => ({
    message: mapDMMessagePayload(message, reactionsByMessageId, threadSummaryByMessageId, userId),
    userId,
  }));
}

export async function editDMMessage(
  messageId: string,
  userId: string,
  content: string,
  options: DMMessageMutationOptions = {},
): Promise<DMMessageEditResult> {
  const existingMessage = await prisma.dMMessage.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      deletedAt: true,
      placeholderRemovedAt: true,
      userId: true,
    },
  });

  if (
    !existingMessage ||
    existingMessage.deletedAt ||
    existingMessage.placeholderRemovedAt ||
    (options.conversationId && existingMessage.conversationId !== options.conversationId)
  ) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  await requireDMParticipant(userId, existingMessage.conversationId);

  if (existingMessage.userId !== userId) {
    throw new ApiError("You can only edit your own DM messages.", 403, "FORBIDDEN");
  }

  const nextContent = validateEditableDMMessageContent(content);
  let updatedMessage: RawDMMessage;
  try {
    updatedMessage = await prisma.dMMessage.update({
      where: {
        id: messageId,
        userId,
        deletedAt: null,
        placeholderRemovedAt: null,
      },
      data: {
        content: nextContent,
        editedAt: new Date(),
      },
      include: dmMessageInclude,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ApiError("Message not found", 404, "NOT_FOUND");
    }

    throw error;
  }

  const participants = await prisma.dMParticipant.findMany({
    where: { conversationId: existingMessage.conversationId },
    select: { userId: true },
  });
  const realtimeViews = await mapDMMessageRealtimeViews(
    updatedMessage,
    participants.map((participant) => participant.userId),
  );
  const actorView = realtimeViews.find((view) => view.userId === userId);

  if (!actorView) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  return {
    message: actorView.message,
    realtimeViews,
  };
}

export async function deleteDMMessage(
  messageId: string,
  userId: string,
  options: DMMessageMutationOptions = {},
): Promise<DMDeleteMessageResult> {
  const existingMessage = await prisma.dMMessage.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      deletedAt: true,
      deletedById: true,
      placeholderRemovedAt: true,
      userId: true,
    },
  });

  if (
    !existingMessage ||
    existingMessage.placeholderRemovedAt ||
    (options.conversationId && existingMessage.conversationId !== options.conversationId)
  ) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  await requireDMParticipant(userId, existingMessage.conversationId);

  if (existingMessage.deletedAt) {
    const canRemovePlaceholder =
      existingMessage.deletedById === userId ||
      (!existingMessage.deletedById && existingMessage.userId === userId);

    if (!canRemovePlaceholder) {
      throw new ApiError("You can only remove your own deleted DM notices.", 403, "FORBIDDEN");
    }

    const removeResult = await prisma.dMMessage.updateMany({
      where: {
        deletedAt: { not: null },
        id: messageId,
        placeholderRemovedAt: null,
      },
      data: {
        placeholderRemovedAt: new Date(),
      },
    });

    if (removeResult.count !== 1) {
      throw new ApiError("Message not found", 404, "NOT_FOUND");
    }

    return { conversationId: existingMessage.conversationId, status: "removed" };
  }

  if (existingMessage.userId !== userId) {
    throw new ApiError("You can only delete your own DM messages.", 403, "FORBIDDEN");
  }

  const deleteResult = await prisma.dMMessage.updateMany({
    where: {
      deletedAt: null,
      id: messageId,
      placeholderRemovedAt: null,
      userId,
    },
    data: {
      deletedAt: new Date(),
      deletedById: userId,
    },
  });

  if (deleteResult.count !== 1) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  return {
    conversationId: existingMessage.conversationId,
    placeholderExpiresAt: null,
    status: "deleted",
  };
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
  options: { conversationId?: string } = {},
): Promise<MessageReaction[]> {
  const normalizedEmoji = validateDMReactionEmoji(emoji);
  const message = await prisma.dMMessage.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      deletedAt: true,
      placeholderRemovedAt: true,
    },
  });

  if (!message || message.deletedAt || message.placeholderRemovedAt) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  if (options.conversationId && message.conversationId !== options.conversationId) {
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
    SELECT
      r."messageId",
      r."emoji",
      r."userId",
      r."createdAt",
      u."username",
      u."displayName",
      u."avatarUrl"
    FROM "DMReaction" r
    INNER JOIN "User" u ON u."id" = r."userId"
    WHERE r."messageId" = ${messageId}
  `);

  return groupDMReactions(reactions);
}
