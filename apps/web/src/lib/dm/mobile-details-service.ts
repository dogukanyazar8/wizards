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
  const participant = conversation.participants.find((entry) => entry.userId !== input.userId);
  if (!participant) {
    throw new ApiError("Conversation participant not found", 404, "PARTICIPANT_NOT_FOUND");
  }

  const [mutualServers, page, mediaCount] = await Promise.all([
    dependencies.listMutualServers(input.userId, participant.userId, { limit: 12 }),
    dependencies.listMessages(input.userId, input.conversationId, input.cursor, input.limit),
    dependencies.countMedia(input.conversationId),
  ]);

  return {
    mediaCount,
    mutualServers,
    nextCursor: page.nextCursor,
    participant: {
      avatarUrl: participant.avatarUrl,
      customStatus: participant.customStatus,
      displayName: participant.displayName,
      id: participant.userId,
      status: participant.status,
      username: participant.username,
    },
    sharedAttachments: getDmSharedAttachmentSummary(page.messages.map((message) => ({
      attachments: message.attachments.map(({ height, width, ...attachment }) => ({
        ...attachment,
        ...(height === null ? {} : { height }),
        ...(width === null ? {} : { width }),
      })),
      createdAt: message.createdAt,
      deletedAt: message.deletedAt,
      id: message.id,
    })), {
      fileLimit: Math.min(input.limit, 30),
      mediaLimit: Math.min(input.limit, 30),
    }),
  };
}
