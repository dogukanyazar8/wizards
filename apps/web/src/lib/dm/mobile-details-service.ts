import { ApiError } from "@/lib/api";
import { getDmSharedAttachmentSummary } from "@/lib/dm/details";
import {
  countDirectMessageMediaAttachments,
  getDirectMessageConversationForUser,
  listDirectMessageMutualServers,
  listDMMessages,
} from "@/lib/dm/service";

export type MobileDMDetailsServiceDependencies = {
  countMedia: typeof countDirectMessageMediaAttachments;
  getConversation: typeof getDirectMessageConversationForUser;
  listMessages: typeof listDMMessages;
  listMutualServers: typeof listDirectMessageMutualServers;
};

const defaultDependencies: MobileDMDetailsServiceDependencies = {
  countMedia: countDirectMessageMediaAttachments,
  getConversation: getDirectMessageConversationForUser,
  listMessages: listDMMessages,
  listMutualServers: listDirectMessageMutualServers,
};

export async function getMobileDMDetails(
  input: { conversationId: string; cursor?: string | undefined; limit: number; userId: string },
  dependencies: MobileDMDetailsServiceDependencies = defaultDependencies,
) {
  const conversation = await dependencies.getConversation(input.conversationId, input.userId);
  const isGroup = conversation.type === "GROUP_DM";
  const participant = conversation.participants.find((entry) => entry.userId !== input.userId);
  if (!participant && !isGroup) {
    throw new ApiError("Conversation participant not found", 404, "PARTICIPANT_NOT_FOUND");
  }

  const [mutualServers, page, mediaCount] = await Promise.all([
    // A group has no single counterpart, so there is no "servers you both are
    // in" to compute. Asking anyway would pick an arbitrary member.
    isGroup || !participant
      ? []
      : dependencies.listMutualServers(input.userId, participant.userId, { limit: 12 }),
    dependencies.listMessages(input.userId, input.conversationId, input.cursor, input.limit),
    dependencies.countMedia(input.conversationId),
  ]);

  return {
    mediaCount,
    members: isGroup
      ? conversation.participants.map((entry) => ({
          avatarUrl: entry.avatarUrl,
          displayName: entry.displayName,
          id: entry.userId,
          isOwner: conversation.ownerId === entry.userId,
          status: entry.status,
          username: entry.username,
        }))
      : [],
    mutualServers,
    nextCursor: page.nextCursor,
    ownerId: conversation.ownerId,
    participant:
      isGroup || !participant
        ? null
        : {
            avatarUrl: participant.avatarUrl,
            customStatus: participant.customStatus,
            displayName: participant.displayName,
            id: participant.userId,
            status: participant.status,
            username: participant.username,
          },
    sharedAttachments: getDmSharedAttachmentSummary(
      page.messages.map((message) => ({
        attachments: message.attachments.map(({ height, width, ...attachment }) => ({
          ...attachment,
          ...(height === null ? {} : { height }),
          ...(width === null ? {} : { width }),
        })),
        createdAt: message.createdAt,
        deletedAt: message.deletedAt,
        id: message.id,
      })),
      {
        fileLimit: Math.min(input.limit, 30),
        mediaLimit: Math.min(input.limit, 30),
      },
    ),
  };
}
