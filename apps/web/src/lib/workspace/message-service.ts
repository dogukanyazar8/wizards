import { prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";
import type {
  ChatMessage,
  ChatMessageType,
  MessageAttachment,
  MessageReaction,
  ReplyTo,
  UploadedAttachmentInput,
} from "@wizards/types";
import { ApiError } from "@/lib/api";
import {
  claimUploadedMessageAttachments,
  normalizeMessageContentForSend,
} from "@/lib/messages/attachments";

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

function validateEditableMessageContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 2000) {
    throw new ApiError("Message content must be between 1 and 2000 characters.", 400);
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
    },
  },
  attachments: {
    select: {
      id: true,
      url: true,
      filename: true,
      contentType: true,
      size: true,
      width: true,
      height: true,
    },
  },
  reactions: {
    select: {
      emoji: true,
      userId: true,
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

function groupReactions(reactions: { emoji: string; userId: string }[]): MessageReaction[] {
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

function mapRawMessage(message: RawMessage): ChatMessage {
  const attachments: MessageAttachment[] = message.attachments.map((a) => ({
    id: a.id,
    url: a.url,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
  }));

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
    },
    content: message.deletedAt ? "[deleted]" : message.content,
    type: normalizeMessageType(message.type),
    reactions: groupReactions(message.reactions),
    attachments,
    replyTo,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
  };
}

export async function getChannelMessages(
  channelId: string,
  cursor?: string,
  limit: number = 50,
) {
  const queryArgs: Prisma.MessageFindManyArgs = {
    where: {
      channelId,
      threadId: null,
    },
    include: messageInclude,
    orderBy: { createdAt: "desc" as const },
    take: limit + 1,
  };

  if (cursor) {
    queryArgs.cursor = { id: cursor };
    queryArgs.skip = 1;
  }

  const messages = await prisma.message.findMany(queryArgs) as RawMessage[];

  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(0, limit) : messages;
  const formatted = pageMessages.map(mapRawMessage);
  const nextCursor = hasMore ? pageMessages[pageMessages.length - 1]?.id : undefined;

  return {
    messages: formatted.reverse(),
    hasMore,
    ...(nextCursor && { nextCursor }),
  };
}

export async function getMessageById(messageId: string): Promise<ChatMessage | null> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: messageInclude,
  }) as RawMessage | null;

  return message ? mapRawMessage(message) : null;
}

export async function createMessage(
  channelId: string,
  userId: string,
  content: string,
  replyToId?: string,
  attachments: UploadedAttachmentInput[] = [],
): Promise<ChatMessage> {
  return createTypedMessage({
    channelId,
    attachments,
    content,
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
  attachments?: UploadedAttachmentInput[];
  channelId: string;
  content: string;
  replyToId?: string;
  type: ChatMessageType;
  userId: string;
}): Promise<ChatMessage> {
  const attachments = args.attachments ?? [];
  const content = normalizeMessageContentForSend(args.content, attachments);

  return prisma.$transaction(async (tx) => {
    const createdMessage = await tx.message.create({
      data: {
        channelId: args.channelId,
        userId: args.userId,
        content,
        replyToId: args.replyToId ?? null,
        type: args.type,
      },
      select: { id: true },
    });

    await claimUploadedMessageAttachments(tx, args.userId, attachments, {
      messageId: createdMessage.id,
    });

    const message = await tx.message.findUniqueOrThrow({
      where: { id: createdMessage.id },
      include: messageInclude,
    }) as RawMessage;

    return mapRawMessage(message);
  });
}

export async function editMessage(
  messageId: string,
  userId: string,
  content: string,
): Promise<ChatMessage> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { userId: true },
  });

  if (!existing || existing.userId !== userId) {
    throw new ApiError("Cannot edit this message", 403);
  }

  const nextContent = validateEditableMessageContent(content);
  const message = await prisma.message.update({
    where: { id: messageId },
    data: { content: nextContent, editedAt: new Date() },
    include: messageInclude,
  }) as RawMessage;

  return mapRawMessage(message);
}

export async function deleteMessage(
  messageId: string,
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { userId: true },
  });

  if (!existing || (!isAdmin && existing.userId !== userId)) {
    throw new ApiError("Cannot delete this message", 403);
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
}

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<MessageReaction[]> {
  const normalizedEmoji = validateReactionEmoji(emoji);
  const existing = await prisma.reaction.findFirst({
    where: { messageId, userId, emoji: normalizedEmoji },
    select: { id: true },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({
      data: { messageId, userId, emoji: normalizedEmoji },
    });
  }

  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });

  return groupReactions(reactions);
}
