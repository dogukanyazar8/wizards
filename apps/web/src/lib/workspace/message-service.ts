import { ChannelType, Prisma, prisma } from "@wizards/db";
import {
  MESSAGE_CONTENT_DEFAULT_LIMIT,
  MESSAGE_CONTENT_HARD_LIMIT,
  type ChatMessage,
  type ChatMessageType,
  type MessageAttachment,
  type MessageReaction,
  type MessageThreadSummary,
  type ReplyTo,
  type UploadedAttachmentInput,
} from "@wizards/types";
import { ApiError } from "@/lib/api";
import {
  claimUploadedMessageAttachments,
  normalizeMessageContentForSend,
} from "@/lib/messages/attachments";
import { UNKNOWN_ATTRIBUTION, type ClientAttribution } from "@/lib/analytics/client-attribution";
import { mapAttachmentsForViewer } from "@/lib/messages/attachment-visibility";
import { enqueueMessageCreatedAnalyticsJob } from "@/lib/outbox/service";
import { requireChannelPermissionForUser } from "@/lib/workspace/permission-service";
import { PermissionBits, hasPermission } from "@/lib/workspace/permissions";

function normalizeMessageType(type: string): ChatMessageType {
  if (type === "SYSTEM_JOIN" || type === "SYSTEM_LEAVE") {
    return type;
  }

  return "DEFAULT";
}

function validateReactionEmoji(emoji: string) {
  const trimmed = emoji.trim();
  if (!trimmed || trimmed.length > 64) {
    throw new ApiError("Invalid emoji", 400, "INVALID_EMOJI");
  }

  return trimmed;
}

function validateEditableMessageContent(
  content: string,
  maxLength: number | null = MESSAGE_CONTENT_DEFAULT_LIMIT,
) {
  const trimmed = content.trim();
  const effectiveMaxLength =
    maxLength === null
      ? MESSAGE_CONTENT_HARD_LIMIT
      : Math.min(maxLength, MESSAGE_CONTENT_HARD_LIMIT);

  if (!trimmed || trimmed.length > effectiveMaxLength) {
    throw new ApiError(
      `Message content must be between 1 and ${effectiveMaxLength} characters.`,
      400,
      "MESSAGE_TOO_LONG",
    );
  }

  return trimmed;
}

const messageInclude = {
  author: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      status: true,
      customStatus: true,
    },
  },
  attachments: {
    select: {
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
    },
  },
  reactions: {
    select: {
      emoji: true,
      userId: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  },
  reply: {
    select: {
      id: true,
      content: true,
      author: {
        select: { displayName: true, username: true },
      },
    },
  },
} as const;

type RawMessage = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

type MessageThreadSummaryRow = {
  lastReplyAt: Date | null;
  replyCount: number;
  threadParentId: string;
};

const DEFAULT_DELETED_MESSAGE_NOTICE_MINUTES = 60;
const MASS_MENTION_PATTERN = /(^|[^\p{L}\p{N}_])@(everyone|here)(?=$|[^\p{L}\p{N}_-])/iu;

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function containsMassMention(content: string) {
  return MASS_MENTION_PATTERN.test(content);
}

export function assertCanMentionEveryone(content: string, permissions: bigint) {
  if (
    containsMassMention(content) &&
    !hasPermission(permissions, PermissionBits.MENTION_EVERYONE)
  ) {
    throw new ApiError(
      "You cannot mention everyone in this channel.",
      403,
      "MENTION_EVERYONE_FORBIDDEN",
    );
  }
}

function visibleMessageWhere(now: Date = new Date()): Prisma.MessageWhereInput {
  return {
    placeholderRemovedAt: null,
    OR: [{ deletedAt: null }, { placeholderExpiresAt: { gt: now } }],
  };
}

type ReactionUserEntry = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  reactedAt?: string;
};

function groupReactions(
  reactions: Array<{
    emoji: string;
    userId: string;
    createdAt?: Date;
    user?: {
      id: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
    };
  }>,
): MessageReaction[] {
  const grouped = new Map<
    string,
    {
      userIds: Set<string>;
      users: Map<string, ReactionUserEntry>;
    }
  >();
  for (const reaction of reactions) {
    if (!grouped.has(reaction.emoji)) {
      grouped.set(reaction.emoji, { userIds: new Set(), users: new Map() });
    }
    const entry = grouped.get(reaction.emoji)!;
    entry.userIds.add(reaction.userId);
    if (reaction.user) {
      entry.users.set(reaction.userId, {
        ...reaction.user,
        ...(reaction.createdAt ? { reactedAt: reaction.createdAt.toISOString() } : {}),
      });
    }
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

function normalizeThreadSummary(summary?: MessageThreadSummary): MessageThreadSummary {
  return summary ?? createEmptyThreadSummary();
}

async function requireChannelAccess(
  userId: string,
  channelId: string,
  options: { requireManageMessages?: boolean } = {},
) {
  const { channel, permissions } = await requireChannelPermissionForUser(
    userId,
    channelId,
    options.requireManageMessages ? PermissionBits.MANAGE_MESSAGES : PermissionBits.VIEW_CHANNEL,
    {
      forbiddenMessage: options.requireManageMessages
        ? "You cannot manage pinned messages in this channel."
        : "You do not have permission to access this channel.",
      requiredType: ChannelType.TEXT,
    },
  );

  return {
    channel,
    canManageMessages: hasPermission(permissions, PermissionBits.MANAGE_MESSAGES),
    serverId: channel.serverId,
  };
}

async function getThreadSummaryMap(parentMessageIds: string[]) {
  if (parentMessageIds.length === 0) {
    return new Map<string, MessageThreadSummary>();
  }

  const counts = await prisma.$queryRaw<MessageThreadSummaryRow[]>(Prisma.sql`
    SELECT
      "threadParentId",
      COUNT(*)::int AS "replyCount",
      MAX("createdAt") AS "lastReplyAt"
      FROM "Message"
      WHERE "threadParentId" IN (${Prisma.join(parentMessageIds)})
        AND "deletedAt" IS NULL
        AND "placeholderRemovedAt" IS NULL
      GROUP BY "threadParentId"
    `);

  const latestReplies = await prisma.message.findMany({
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

export function mapRawMessage(
  message: RawMessage,
  threadSummary?: MessageThreadSummary,
  viewerId?: string | null,
): ChatMessage {
  const attachments: MessageAttachment[] = mapAttachmentsForViewer(message.attachments, viewerId);

  const replyTo: ReplyTo | undefined = message.reply
    ? {
        id: message.reply.id,
        content: message.reply.content.substring(0, 100),
        authorName: message.reply.author.displayName ?? message.reply.author.username,
      }
    : undefined;

  return {
    id: message.id,
    channelId: message.channelId,
    author: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.displayName ?? message.author.username,
      avatarUrl: message.author.avatarUrl,
      status:
        message.author.status === "ONLINE" ||
        message.author.status === "IDLE" ||
        message.author.status === "DND"
          ? message.author.status
          : "OFFLINE",
      customStatus: message.author.customStatus,
    },
    content: message.deletedAt ? "[deleted]" : message.content,
    type: normalizeMessageType(message.type),
    mentionEveryone: message.mentionEveryone,
    threadParentId: message.threadParentId,
    alsoSentToChannel: message.alsoSentToChannel,
    threadSummary: normalizeThreadSummary(threadSummary),
    isPinned: message.isPinned,
    pinnedAt: message.pinnedAt?.toISOString() ?? null,
    pinnedById: message.pinnedById,
    reactions: groupReactions(message.reactions),
    attachments,
    replyTo,
    createdAt: message.createdAt.toISOString(),
    forwardedAt: message.forwardedAt?.toISOString() ?? null,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    deletedById: message.deletedById,
    placeholderExpiresAt: message.placeholderExpiresAt?.toISOString() ?? null,
  };
}

export async function getChannelMessages(
  channelId: string,
  cursor?: string,
  limit: number = 50,
  viewerId?: string,
) {
  const queryArgs: Prisma.MessageFindManyArgs = {
    where: {
      channelId,
      threadId: null,
      // 8d: thread replies stay out of the channel stream unless their author
      // ticked "also send to channel" while replying.
      AND: [{ OR: [{ threadParentId: null }, { alsoSentToChannel: true }] }, visibleMessageWhere()],
    },
    include: messageInclude,
    orderBy: { createdAt: "desc" as const },
    take: limit + 1,
  };

  if (cursor) {
    queryArgs.cursor = { id: cursor };
    queryArgs.skip = 1;
  }

  const messages = (await prisma.message.findMany(queryArgs)) as RawMessage[];

  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(0, limit) : messages;
  const summaries = await getThreadSummaryMap(pageMessages.map((message) => message.id));
  const formatted = pageMessages.map((message) =>
    mapRawMessage(message, summaries.get(message.id), viewerId),
  );
  const nextCursor = hasMore ? pageMessages[pageMessages.length - 1]?.id : undefined;

  return {
    messages: formatted.reverse(),
    hasMore,
    ...(nextCursor && { nextCursor }),
  };
}

export async function getChannelThreadMessages(
  channelId: string,
  parentMessageId: string,
  viewerId: string,
  cursor?: string,
  limit: number = 50,
) {
  await requireChannelPermissionForUser(viewerId, channelId, PermissionBits.VIEW_CHANNEL, {
    requiredType: ChannelType.TEXT,
  });

  const parent = (await prisma.message.findFirst({
    where: {
      id: parentMessageId,
      channelId,
      threadParentId: null,
      ...visibleMessageWhere(),
    },
    include: messageInclude,
  })) as RawMessage | null;

  if (!parent) {
    throw new ApiError("Thread parent message not found", 404, "THREAD_PARENT_NOT_FOUND");
  }

  const queryArgs: Prisma.MessageFindManyArgs = {
    where: {
      channelId,
      threadParentId: parentMessageId,
      ...visibleMessageWhere(),
    },
    include: messageInclude,
    orderBy: { createdAt: "desc" as const },
    take: limit + 1,
  };

  if (cursor) {
    queryArgs.cursor = { id: cursor };
    queryArgs.skip = 1;
  }

  const messages = (await prisma.message.findMany(queryArgs)) as RawMessage[];
  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(0, limit) : messages;
  const parentSummary = await getThreadSummaryMap([parent.id]);
  const nextCursor = hasMore ? pageMessages[pageMessages.length - 1]?.id : undefined;

  return {
    parent: mapRawMessage(parent, parentSummary.get(parent.id), viewerId),
    messages: pageMessages.reverse().map((message) => mapRawMessage(message, undefined, viewerId)),
    hasMore,
    ...(nextCursor && { nextCursor }),
  };
}

export async function getMessageById(
  messageId: string,
  viewerId?: string | null,
): Promise<ChatMessage | null> {
  const message = (await prisma.message.findFirst({
    where: { id: messageId, ...visibleMessageWhere() },
    include: messageInclude,
  })) as RawMessage | null;

  if (!message) {
    return null;
  }

  const summaries = await getThreadSummaryMap([message.id]);
  return mapRawMessage(message, summaries.get(message.id), viewerId);
}

export async function listChannelPinnedMessages(
  userId: string,
  channelId: string,
  limit: number = 30,
) {
  await requireChannelAccess(userId, channelId);

  const pinnedMessages = await prisma.pinnedMessage.findMany({
    where: {
      channelId,
      message: {
        deletedAt: null,
        placeholderRemovedAt: null,
      },
    },
    orderBy: { pinnedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      message: {
        include: messageInclude,
      },
    },
  });

  const parentIds = pinnedMessages.map((pin) => pin.message.id);
  const threadSummaries = await getThreadSummaryMap(parentIds);

  return {
    messages: pinnedMessages.map((pin) =>
      mapRawMessage(pin.message as RawMessage, threadSummaries.get(pin.message.id), userId),
    ),
  };
}

export async function pinChannelMessage(userId: string, channelId: string, messageId: string) {
  await requireChannelAccess(userId, channelId, { requireManageMessages: true });

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      channelId,
      deletedAt: null,
      placeholderRemovedAt: null,
    },
    select: { id: true },
  });

  if (!message) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  const pinnedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.pinnedMessage.upsert({
      where: {
        channelId_messageId: {
          channelId,
          messageId,
        },
      },
      create: {
        channelId,
        messageId,
        pinnedAt,
        pinnedById: userId,
      },
      update: {
        pinnedAt,
        pinnedById: userId,
      },
    });

    await tx.channel.update({
      where: { id: channelId },
      data: { lastPinAt: pinnedAt },
    });

    await tx.message.update({
      where: { id: messageId },
      data: {
        isPinned: true,
        pinnedAt,
        pinnedById: userId,
      },
    });

    return tx.message.findUniqueOrThrow({
      where: { id: messageId },
      include: messageInclude,
    });
  });

  const summaries = await getThreadSummaryMap([updated.id]);
  return mapRawMessage(updated as RawMessage, summaries.get(updated.id), userId);
}

export async function unpinChannelMessage(userId: string, channelId: string, messageId: string) {
  await requireChannelAccess(userId, channelId, { requireManageMessages: true });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.pinnedMessage.deleteMany({
      where: {
        channelId,
        messageId,
      },
    });

    await tx.message.updateMany({
      where: { id: messageId, channelId },
      data: {
        isPinned: false,
        pinnedAt: null,
        pinnedById: null,
      },
    });

    const latestPin = await tx.pinnedMessage.findFirst({
      where: { channelId },
      orderBy: { pinnedAt: "desc" },
      select: { pinnedAt: true },
    });

    await tx.channel.update({
      where: { id: channelId },
      data: { lastPinAt: latestPin?.pinnedAt ?? null },
    });

    return tx.message.findFirst({
      where: { id: messageId, channelId },
      include: messageInclude,
    });
  });

  if (!updated) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  const summaries = await getThreadSummaryMap([updated.id]);
  return mapRawMessage(updated as RawMessage, summaries.get(updated.id), userId);
}

export async function createMessage(
  channelId: string,
  userId: string,
  content: string,
  replyToId?: string,
  attachments: UploadedAttachmentInput[] = [],
  threadParentId?: string,
  options: {
    alsoSendToChannel?: boolean;
    attribution?: ClientAttribution;
    forwardOfMessageId?: string | null;
    permissions?: bigint;
  } = {},
): Promise<ChatMessage> {
  return createTypedMessage({
    channelId,
    attachments,
    content,
    ...(options.attribution ? { attribution: options.attribution } : {}),
    ...(options.alsoSendToChannel ? { alsoSendToChannel: true } : {}),
    ...(options.forwardOfMessageId ? { forwardOfMessageId: options.forwardOfMessageId } : {}),
    ...(options.permissions !== undefined ? { permissions: options.permissions } : {}),
    ...(threadParentId ? { threadParentId } : {}),
    type: "DEFAULT",
    userId,
    ...(replyToId ? { replyToId } : {}),
  });
}

export async function createSystemMessage(args: {
  channelId: string;
  content: string;
  type: Exclude<ChatMessageType, "DEFAULT">;
  userId: string;
}): Promise<ChatMessage> {
  return createTypedMessage(args);
}

async function createTypedMessage(args: {
  alsoSendToChannel?: boolean;
  attachments?: UploadedAttachmentInput[];
  /** Only DEFAULT messages write analytics; system messages have no client. */
  attribution?: ClientAttribution;
  channelId: string;
  content: string;
  forwardOfMessageId?: string | null;
  permissions?: bigint;
  replyToId?: string;
  threadParentId?: string;
  type: ChatMessageType;
  userId: string;
}): Promise<ChatMessage> {
  const attachments = args.attachments ?? [];
  const content = normalizeMessageContentForSend(args.content, attachments);
  const mentionEveryone = args.type === "DEFAULT" && containsMassMention(content);

  if (mentionEveryone) {
    if (args.permissions === undefined) {
      await requireChannelPermissionForUser(
        args.userId,
        args.channelId,
        PermissionBits.MENTION_EVERYONE,
        {
          forbiddenCode: "MENTION_EVERYONE_FORBIDDEN",
          forbiddenMessage: "You cannot mention everyone in this channel.",
          lockedCode: "CHANNEL_LOCKED",
          lockedMessage: "This channel is read-only.",
          requiredType: ChannelType.TEXT,
          respectLocked: true,
        },
      );
    } else {
      assertCanMentionEveryone(content, args.permissions);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    if (args.threadParentId) {
      const parent = await tx.message.findFirst({
        where: {
          id: args.threadParentId,
          channelId: args.channelId,
          deletedAt: null,
          placeholderRemovedAt: null,
          threadParentId: null,
        },
        select: { id: true },
      });

      if (!parent) {
        throw new ApiError("Thread parent message not found", 404, "THREAD_PARENT_NOT_FOUND");
      }
    }

    const createdMessage = await tx.message.create({
      data: {
        channelId: args.channelId,
        userId: args.userId,
        content,
        replyToId: args.replyToId ?? null,
        threadParentId: args.threadParentId ?? null,
        // Only a reply that lives inside a thread can be mirrored to the channel.
        alsoSentToChannel: Boolean(args.threadParentId && args.alsoSendToChannel),
        forwardedAt: args.forwardOfMessageId ? new Date() : null,
        type: args.type,
        mentionEveryone,
      },
      select: { id: true },
    });

    await claimUploadedMessageAttachments(tx, args.userId, attachments, {
      messageId: createdMessage.id,
    });

    const message = (await tx.message.findUniqueOrThrow({
      where: { id: createdMessage.id },
      include: messageInclude,
    })) as RawMessage;
    const attachmentCount = message.attachments.length;
    const uploadedBytes = message.attachments.reduce(
      (total, attachment) => total + BigInt(attachment.size),
      0n,
    );

    if (args.type === "DEFAULT") {
      await enqueueMessageCreatedAnalyticsJob(tx, {
        attachmentCount,
        attribution: args.attribution ?? UNKNOWN_ATTRIBUTION,
        idempotencyKey: `analytics:channel-message:${createdMessage.id}`,
        uploadedBytes,
        userId: args.userId,
      });
    }

    return {
      payload: mapRawMessage(message, undefined, args.userId),
    };
  });

  return result.payload;
}

export async function editMessage(
  messageId: string,
  userId: string,
  content: string,
  maxLength?: number | null,
  options: { channelId?: string; permissions?: bigint } = {},
): Promise<ChatMessage> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      channelId: true,
      channel: {
        select: {
          server: {
            select: { messageCharacterLimit: true },
          },
          serverId: true,
        },
      },
      deletedAt: true,
      placeholderRemovedAt: true,
      userId: true,
    },
  });

  if (
    !existing ||
    !existing.channel.serverId ||
    !existing.channel.server ||
    existing.deletedAt ||
    existing.placeholderRemovedAt ||
    existing.userId !== userId
  ) {
    throw new ApiError("Cannot edit this message", 403);
  }

  if (options.channelId && existing.channelId !== options.channelId) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  const permissions =
    options.permissions ??
    (
      await requireChannelPermissionForUser(
        userId,
        existing.channelId,
        PermissionBits.SEND_MESSAGES,
        {
          forbiddenMessage: "Cannot edit this message",
          lockedCode: "CHANNEL_LOCKED",
          lockedMessage: "This channel is read-only.",
          requiredType: ChannelType.TEXT,
          respectLocked: true,
        },
      )
    ).permissions;

  const effectiveMaxLength =
    maxLength ??
    (hasPermission(permissions, PermissionBits.MANAGE_MESSAGES)
      ? null
      : existing.channel.server.messageCharacterLimit);
  const nextContent = validateEditableMessageContent(content, effectiveMaxLength);
  const mentionEveryone = containsMassMention(nextContent);
  if (mentionEveryone) {
    assertCanMentionEveryone(nextContent, permissions);
  }

  let message: RawMessage;
  try {
    message = (await prisma.message.update({
      where: { id: messageId, userId, deletedAt: null, placeholderRemovedAt: null },
      data: { content: nextContent, editedAt: new Date(), mentionEveryone },
      include: messageInclude,
    })) as RawMessage;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ApiError("Cannot edit this message", 403);
    }

    throw error;
  }

  return mapRawMessage(message, undefined, userId);
}

export type DeleteMessageResult =
  { status: "deleted"; placeholderExpiresAt: string | null } | { status: "removed" };

export async function deleteMessage(
  messageId: string,
  userId: string,
  options: { channelId?: string; isAdmin?: boolean } = {},
): Promise<DeleteMessageResult> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      deletedAt: true,
      deletedById: true,
      channelId: true,
      channel: {
        select: {
          server: {
            select: { deletedMessageNoticeMinutes: true },
          },
        },
      },
      placeholderRemovedAt: true,
      userId: true,
    },
  });

  if (!existing || existing.placeholderRemovedAt) {
    throw new ApiError("Cannot delete this message", 403);
  }

  if (options.channelId && existing.channelId !== options.channelId) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  const isAdmin =
    options.isAdmin ??
    hasPermission(
      (
        await requireChannelPermissionForUser(
          userId,
          existing.channelId,
          PermissionBits.VIEW_CHANNEL,
          { requiredType: ChannelType.TEXT },
        )
      ).permissions,
      PermissionBits.MANAGE_MESSAGES,
    );

  if (existing.deletedAt) {
    const canRemovePlaceholder =
      isAdmin ||
      existing.deletedById === userId ||
      (!existing.deletedById && existing.userId === userId);

    if (!canRemovePlaceholder) {
      throw new ApiError("Cannot remove this deleted message notice", 403);
    }

    const updateResult = await prisma.message.updateMany({
      where: {
        deletedAt: { not: null },
        id: messageId,
        placeholderRemovedAt: null,
      },
      data: { placeholderRemovedAt: new Date() },
    });

    if (updateResult.count !== 1) {
      throw new ApiError("Cannot remove this deleted message notice", 403);
    }

    return { status: "removed" };
  }

  if (!isAdmin && existing.userId !== userId) {
    throw new ApiError("Cannot delete this message", 403);
  }

  const deletedAt = new Date();
  const noticeMinutes =
    existing.channel.server?.deletedMessageNoticeMinutes ?? DEFAULT_DELETED_MESSAGE_NOTICE_MINUTES;
  const placeholderExpiresAt = addMinutes(deletedAt, noticeMinutes);

  const updateResult = await prisma.message.updateMany({
    where: { deletedAt: null, id: messageId, placeholderRemovedAt: null },
    data: {
      deletedAt,
      deletedById: userId,
      placeholderExpiresAt,
    },
  });

  if (updateResult.count !== 1) {
    throw new ApiError("Cannot delete this message", 403);
  }

  return { status: "deleted", placeholderExpiresAt: placeholderExpiresAt.toISOString() };
}

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<MessageReaction[]> {
  return setReaction(messageId, userId, emoji, undefined);
}

export async function setReaction(
  messageId: string,
  userId: string,
  emoji: string,
  shouldReact: boolean | undefined,
  options: { channelId?: string } = {},
): Promise<MessageReaction[]> {
  const normalizedEmoji = validateReactionEmoji(emoji);
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, deletedAt: true, placeholderRemovedAt: true },
  });

  if (!message || message.deletedAt || message.placeholderRemovedAt) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  if (options.channelId && message.channelId !== options.channelId) {
    throw new ApiError("Message not found", 404, "NOT_FOUND");
  }

  await requireChannelPermissionForUser(userId, message.channelId, PermissionBits.ADD_REACTIONS, {
    forbiddenMessage: "You cannot react in this channel.",
    requiredType: ChannelType.TEXT,
  });

  const existing = await prisma.reaction.findFirst({
    where: { messageId, userId, emoji: normalizedEmoji },
    select: { id: true },
  });

  if (existing && shouldReact !== true) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else if (!existing && shouldReact !== false) {
    await prisma.reaction.create({
      data: { messageId, userId, emoji: normalizedEmoji },
    });
  }

  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: {
      emoji: true,
      userId: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return groupReactions(reactions);
}
