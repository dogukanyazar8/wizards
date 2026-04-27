import type { DMMessagePayload } from "@wizards/types";
import { prisma, type Prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { areFriends, getBlockStatus } from "@/lib/friends/helpers";
import { normalizeAppLocale, translate } from "@/lib/locale";
import type {
  DMConversationDTO,
  DMConversationTypeDto,
  DMMessagesResponse,
  DMParticipantDTO,
} from "./types";

export const dmAuthorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
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
      user: { select: dmAuthorSelect },
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
  reply?: DMMessageNode | null;
};

type RawDMMessage = Prisma.DMMessageGetPayload<{
  include: typeof dmMessageInclude;
}>;

type RawDMConversation = Prisma.DMConversationGetPayload<{
  include: typeof dmConversationInclude;
}>;

function normalizeConversationType(type: string): DMConversationTypeDto {
  return type === "GROUP_DM" ? "GROUP_DM" : "DM";
}

export function getDMDisplayName(user: {
  username: string;
  displayName: string | null;
}) {
  return user.displayName ?? user.username;
}

function mapDMParticipant(participant: RawDMConversation["participants"][number]): DMParticipantDTO {
  return {
    userId: participant.userId,
    username: participant.user.username,
    displayName: participant.user.displayName,
    avatarUrl: participant.user.avatarUrl,
    unreadCount: participant.unreadCount,
  };
}

function mapDMReply(message: DMMessageNode | null | undefined, depth: number): DMMessagePayload | null {
  if (!message) {
    return null;
  }

  const nextReply = depth > 0 ? mapDMReply(message.reply ?? null, depth - 1) : null;

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
    replyTo: nextReply,
  };
}

export function mapDMMessagePayload(message: RawDMMessage): DMMessagePayload {
  return mapDMReply(message, 2) as DMMessagePayload;
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

export function mapDMConversationDTO(
  conversation: RawDMConversation,
  viewerId: string,
  deletedMessageLabel: string,
): DMConversationDTO {
  return {
    id: conversation.id,
    type: normalizeConversationType(conversation.type),
    name: resolveConversationName(conversation, viewerId),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    participants: conversation.participants.map(mapDMParticipant),
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

    return mapDMConversationDTO(existingConversation, userId, deletedMessageLabel);
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

  return mapDMConversationDTO(conversation, userId, deletedMessageLabel);
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

  return participations
    .filter(
      (participant) =>
        participant.hiddenAt === null ||
        participant.conversation.lastMessageAt > participant.hiddenAt,
    )
    .sort(
      (left, right) =>
        right.conversation.lastMessageAt.getTime() -
        left.conversation.lastMessageAt.getTime(),
    )
    .map((participant) =>
      mapDMConversationDTO(participant.conversation, userId, deletedMessageLabel),
    );
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

  return {
    messages: [...pageMessages].reverse().map(mapDMMessagePayload),
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
