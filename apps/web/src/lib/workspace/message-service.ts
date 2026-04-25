import { prisma } from "@wizards/db";
import type {
  ChatMessage,
  MessageAttachment,
  MessageAuthor,
  MessageReaction,
  ReplyTo,
} from "@wizards/types";
import { ApiError } from "@/lib/api";

async function getMessageAuthor(userId: string): Promise<MessageAuthor> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });

  if (!user) throw new ApiError("User not found", 404);

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? user.username,
    avatarUrl: user.avatarUrl,
  };
}

async function getMessageAttachments(messageId: string): Promise<MessageAttachment[]> {
  const attachments = await prisma.attachment.findMany({
    where: { messageId },
    select: {
      id: true,
      url: true,
      filename: true,
      contentType: true,
      size: true,
      width: true,
      height: true,
    },
  });

  return attachments.map((a) => ({
    id: a.id,
    url: a.url,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    width: a.width ?? undefined,
    height: a.height ?? undefined,
  }));
}

async function getMessageReactions(messageId: string): Promise<MessageReaction[]> {
  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: {
      emoji: true,
      userId: true,
    },
  });

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

async function getReplyTo(messageId: string | null): Promise<ReplyTo | null> {
  if (!messageId) return null;

  const reply = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      content: true,
      author: {
        select: { displayName: true, username: true },
      },
    },
  });

  if (!reply) return null;

  return {
    id: reply.id,
    content: reply.content.substring(0, 100),
    authorName: reply.author.displayName ?? reply.author.username,
  };
}

async function formatMessage(
  message: any,
): Promise<ChatMessage> {
  const [author, attachments, reactions, replyTo] = await Promise.all([
    getMessageAuthor(message.userId),
    getMessageAttachments(message.id),
    getMessageReactions(message.id),
    getReplyTo(message.replyToId),
  ]);

  return {
    id: message.id,
    channelId: message.channelId,
    author,
    content: message.deletedAt ? "[deleted]" : message.content,
    reactions,
    attachments,
    replyTo: replyTo ?? undefined,
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
  const queryArgs: any = {
    where: {
      channelId,
      threadId: null,
    },
    select: {
      id: true,
      channelId: true,
      userId: true,
      content: true,
      replyToId: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: limit + 1,
  };

  if (cursor) {
    queryArgs.cursor = { id: cursor };
    queryArgs.skip = 1;
  }

  const messages = await prisma.message.findMany(queryArgs);

  const hasMore = messages.length > limit;
  const pageMessages = hasMore ? messages.slice(0, limit) : messages;

  const formatted = await Promise.all(pageMessages.map(formatMessage));

  const nextCursor = hasMore ? pageMessages[pageMessages.length - 1]?.id : undefined;

  return {
    messages: formatted.reverse(),
    hasMore,
    ...(nextCursor && { nextCursor }),
  };
}

export async function createMessage(
  channelId: string,
  userId: string,
  content: string,
  replyToId?: string,
): Promise<ChatMessage> {
  const message = await prisma.message.create({
    data: {
      channelId,
      userId,
      content,
      replyToId: replyToId ?? null,
      type: "DEFAULT",
    },
    select: {
      id: true,
      channelId: true,
      userId: true,
      content: true,
      replyToId: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
    },
  });

  return formatMessage(message);
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

  const message = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    select: {
      id: true,
      channelId: true,
      userId: true,
      content: true,
      replyToId: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
    },
  });

  return formatMessage(message);
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
  const existing = await prisma.reaction.findFirst({
    where: { messageId, userId, emoji },
    select: { id: true },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({
      data: { messageId, userId, emoji },
    });
  }

  return getMessageReactions(messageId);
}
