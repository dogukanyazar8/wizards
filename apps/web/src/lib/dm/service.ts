import { randomUUID } from "node:crypto";
import type {
  DMConversationDTO,
  DMMessagePayload,
  DMParticipantDTO,
  MessageReaction,
} from "@wizards/types";
import { Prisma, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { areFriends, getBlockStatus } from "@/lib/friends/helpers";
import { getRedis } from "@/lib/redis";
import { normalizeAppLocale, translate } from "@/lib/locale";
import type { DMMessagesResponse } from "./types";

export const dmAuthorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
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
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  attachments: Array<{
    id: string;
    url: string;
    filename: string;
    contentType: string;
    size: number;
    width: number | null;
    height: number | null;
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

const DM_PRESENCE_STATUSES = ["ONLINE", "IDLE", "DND", "OFFLINE", "INVISIBLE"] as const;

type RedisPresenceStatus = (typeof DM_PRESENCE_STATUSES)[number];

type PresenceFields = Pick<DMParticipantDTO, "customStatus" | "status">;

function isPresenceStatus(value: string): value is RedisPresenceStatus {
  return DM_PRESENCE_STATUSES.includes(value as RedisPresenceStatus);
}

function normalizePresenceStatus(value: unknown): RedisPresenceStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return isPresenceStatus(normalized) ? normalized : null;
}

function toVisiblePresenceStatus(
  status: RedisPresenceStatus | null,
): DMParticipantDTO["status"] | null {
  if (!status) {
    return null;
  }

  return status === "INVISIBLE" ? "OFFLINE" : status;
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePresenceRecord(
  record: Record<string, unknown>,
  fallback: PresenceFields,
): PresenceFields {
  const customStatus = normalizeNullableString(record.customStatus);
  const customStatusSnake = normalizeNullableString(record.custom_status);

  return {
    status:
      toVisiblePresenceStatus(normalizePresenceStatus(record.status)) ??
      toVisiblePresenceStatus(normalizePresenceStatus(record.presence)) ??
      fallback.status,
    customStatus:
      customStatus !== undefined
        ? customStatus
        : customStatusSnake !== undefined
          ? customStatusSnake
          : fallback.customStatus,
  };
}

function parsePresencePayload(rawValue: string | null, fallback: PresenceFields): PresenceFields {
  if (!rawValue) {
    return fallback;
  }

  const directStatus = normalizePresenceStatus(rawValue);
  if (directStatus) {
    return {
      ...fallback,
      status: toVisiblePresenceStatus(directStatus) ?? fallback.status,
    };
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (isRecord(parsed)) {
      return parsePresenceRecord(parsed, fallback);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

async function readPresence(userId: string, fallback: PresenceFields): Promise<PresenceFields> {
  const redis = getRedis();
  const key = `presence:${userId}`;

  try {
    const keyType = await redis.type(key);

    if (keyType === "string") {
      return parsePresencePayload(await redis.get(key), fallback);
    }

    if (keyType === "hash") {
      return parsePresenceRecord(await redis.hgetall(key), fallback);
    }
  } catch {
    return fallback;
  }

  return fallback;
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
): DMMessagePayload | null {
  if (!message) {
    return null;
  }

  const nextReply =
    depth > 0
      ? mapDMReply(message.reply ?? null, depth - 1, reactionsByMessageId)
      : null;

  return {
    id: message.id,
    conversationId: message.conversationId,
    userId: message.userId,
    content: message.deletedAt ? "" : message.content,
    replyToId: message.replyToId,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    author: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName,
      avatarUrl: message.author.avatarUrl,
    },
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      width: attachment.width,
      height: attachment.height,
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
): DMMessagePayload {
  return mapDMReply(message, 2, reactionsByMessageId) as DMMessagePayload;
}

export async function mapDMMessagePayloadWithReactions(
  message: RawDMMessage,
): Promise<DMMessagePayload> {
  const reactionsByMessageId = await getDMReactionMap([message.id]);
  return mapDMMessagePayload(message, reactionsByMessageId);
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

  const isFriend = await areFriends(userId, targetUserId);
  if (!isFriend) {
    throw new ApiError("You can only DM friends", 403, "NOT_FRIENDS");
  }

  const blockStatus = await getBlockStatus(userId, targetUserId);
  if (blockStatus.blocked) {
    throw new ApiError("You cannot DM this user", 403, "BLOCKED");
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

export async function listDirectMessages(userId: string): Promise<DMConversationDTO[]> {
  const [deletedMessageLabel, participations] = await Promise.all([
    getDeletedMessageLabel(userId),
    prisma.dMParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: dmConversationInclude,
        },
      },
    }),
  ]);

  const visibleParticipations = participations
    .filter(
      (participant) =>
        participant.hiddenAt === null ||
        participant.conversation.lastMessageAt > participant.hiddenAt,
    )
    .sort(
      (left, right) =>
        right.conversation.lastMessageAt.getTime() -
        left.conversation.lastMessageAt.getTime(),
    );

  return Promise.all(
    visibleParticipations.map((participant) =>
      mapDMConversationDTO(participant.conversation, userId, deletedMessageLabel),
    ),
  );
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
  const reactionsByMessageId = await getDMReactionMap(
    pageMessages.map((message) => message.id),
  );

  return {
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

  if (existing[0]) {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "DMReaction"
      WHERE "id" = ${existing[0].id}
    `);
  } else {
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
