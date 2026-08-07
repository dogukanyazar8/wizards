import {
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_DM_MIN_PARTICIPANTS,
  type DMConversationDTO,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { areFriends, getBlockStatus } from "@/lib/friends/helpers";

import { dmConversationInclude, getDeletedMessageLabel, mapDMConversationDTO } from "./service";

export type GroupConversationRow = {
  iconUrl: string | null;
  id: string;
  name: string | null;
  ownerId: string | null;
  participantUserIds: string[];
};

export type GroupServiceDependencies = {
  areFriends(actorId: string, targetId: string): Promise<boolean>;
  deleteConversation(conversationId: string): Promise<void>;
  getBlockStatus(actorId: string, targetId: string): Promise<{ blocked: boolean }>;
  getDeletedMessageLabel(userId: string): Promise<string>;
  loadConversation(conversationId: string): Promise<
    GroupConversationRow & {
      participants: Array<{ joinedAt: Date; userId: string }>;
      type: string;
    }
  >;
  mapConversation(
    conversation: GroupConversationRow,
    viewerId: string,
    deletedMessageLabel: string,
  ): Promise<DMConversationDTO>;
  writeAddedMembers(input: {
    actorId: string;
    addedUserIds: string[];
    conversationId: string;
  }): Promise<GroupConversationRow>;
  writeCreatedGroup(input: {
    actorId: string;
    iconUrl: string | null;
    name: string | null;
    participantUserIds: string[];
  }): Promise<GroupConversationRow>;
  writeRemovedMember(input: {
    actorId: string;
    conversationId: string;
    nextOwnerId: string | null;
    systemType: "MEMBER_LEFT" | "MEMBER_REMOVED";
    targetUserId: string;
  }): Promise<void>;
};

/**
 * The picker is not trusted input: friendship and blocks are re-checked here on
 * every request, because either can change between the picker rendering and the
 * request landing.
 */
export async function assertGroupMembersEligible(
  actorId: string,
  userIds: readonly string[],
  dependencies: GroupServiceDependencies,
): Promise<string[]> {
  const targets = [...new Set(userIds)].filter((userId) => userId !== actorId);

  for (const targetId of targets) {
    const blockStatus = await dependencies.getBlockStatus(actorId, targetId);
    if (blockStatus.blocked) {
      throw new ApiError("You cannot add this user to a group", 403, "BLOCKED");
    }

    if (!(await dependencies.areFriends(actorId, targetId))) {
      throw new ApiError("You can only add friends to a group", 403, "NOT_FRIENDS");
    }
  }

  return targets;
}

const defaults: GroupServiceDependencies = {
  areFriends,
  deleteConversation: async (conversationId) => {
    // Cascades clear participants, messages, reactions and attachments.
    await prisma.dMConversation.delete({ where: { id: conversationId } });
  },
  getBlockStatus,
  getDeletedMessageLabel,
  loadConversation: async (conversationId) => {
    const conversation = await prisma.dMConversation.findUnique({
      where: { id: conversationId },
      select: {
        iconUrl: true,
        id: true,
        name: true,
        ownerId: true,
        participants: { orderBy: { joinedAt: "asc" }, select: { joinedAt: true, userId: true } },
        type: true,
      },
    });

    if (!conversation) {
      throw new ApiError("Conversation not found", 404, "NOT_FOUND");
    }

    return {
      ...conversation,
      participantUserIds: conversation.participants.map((participant) => participant.userId),
    };
  },
  mapConversation: async (conversation, viewerId, deletedMessageLabel) => {
    const row = await prisma.dMConversation.findUniqueOrThrow({
      where: { id: conversation.id },
      include: dmConversationInclude,
    });

    return await mapDMConversationDTO(row, viewerId, deletedMessageLabel);
  },
  writeAddedMembers: async (input) =>
    prisma.$transaction(async (tx) => {
      await tx.dMParticipant.createMany({
        data: input.addedUserIds.map((userId) => ({
          conversationId: input.conversationId,
          userId,
        })),
        skipDuplicates: true,
      });

      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId: input.conversationId,
          systemTargetUserIds: input.addedUserIds,
          systemType: "MEMBER_ADDED",
          userId: input.actorId,
        },
      });

      // A system row still moves the conversation up the inbox, but it must not
      // light anyone's unread badge — no participant counters are touched.
      const conversation = await tx.dMConversation.update({
        data: { lastMessageAt: new Date() },
        select: { iconUrl: true, id: true, name: true, ownerId: true },
        where: { id: input.conversationId },
      });

      const participants = await tx.dMParticipant.findMany({
        orderBy: { joinedAt: "asc" },
        select: { userId: true },
        where: { conversationId: input.conversationId },
      });

      return {
        ...conversation,
        participantUserIds: participants.map((participant) => participant.userId),
      };
    }),
  writeCreatedGroup: async (input) =>
    prisma.$transaction(async (tx) => {
      const conversation = await tx.dMConversation.create({
        data: {
          iconUrl: input.iconUrl,
          name: input.name,
          ownerId: input.actorId,
          participants: {
            create: input.participantUserIds.map((userId) => ({ userId })),
          },
          type: "GROUP_DM",
        },
        select: { iconUrl: true, id: true, name: true, ownerId: true },
      });

      // Written in the same transaction as the membership rows, so a committed
      // group can never exist without its opening system line.
      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId: conversation.id,
          systemTargetUserIds: [],
          systemType: "GROUP_CREATED",
          userId: input.actorId,
        },
      });

      return { ...conversation, participantUserIds: input.participantUserIds };
    }),
  writeRemovedMember: async (input) =>
    prisma.$transaction(async (tx) => {
      await tx.dMParticipant.delete({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.targetUserId,
          },
        },
      });

      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId: input.conversationId,
          systemTargetUserIds: input.systemType === "MEMBER_REMOVED" ? [input.targetUserId] : [],
          systemType: input.systemType,
          userId: input.actorId,
        },
      });

      await tx.dMConversation.update({
        data: {
          lastMessageAt: new Date(),
          ...(input.nextOwnerId === null ? {} : { ownerId: input.nextOwnerId }),
        },
        where: { id: input.conversationId },
      });
    }),
};

export async function createGroupConversation(
  actorId: string,
  input: { iconUrl?: string | null; name?: string | null; userIds: readonly string[] },
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const targets = await assertGroupMembersEligible(actorId, input.userIds, dependencies);
  const participantUserIds = [actorId, ...targets];

  if (participantUserIds.length < GROUP_DM_MIN_PARTICIPANTS) {
    throw new ApiError(
      `A group needs at least ${GROUP_DM_MIN_PARTICIPANTS} people`,
      400,
      "GROUP_TOO_SMALL",
    );
  }

  if (participantUserIds.length > GROUP_DM_MAX_PARTICIPANTS) {
    throw new ApiError(
      `A group holds at most ${GROUP_DM_MAX_PARTICIPANTS} people`,
      400,
      "GROUP_FULL",
    );
  }

  const name = input.name?.trim() ? input.name.trim() : null;
  const conversation = await dependencies.writeCreatedGroup({
    actorId,
    iconUrl: input.iconUrl ?? null,
    name,
    participantUserIds,
  });
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  return await dependencies.mapConversation(conversation, actorId, deletedMessageLabel);
}

export function requireGroupOwner(
  actorId: string,
  conversation: { ownerId: string | null; type: string },
): void {
  if (conversation.type !== "GROUP_DM") {
    throw new ApiError("This conversation is not a group", 400, "NOT_A_GROUP");
  }

  if (conversation.ownerId !== actorId) {
    throw new ApiError("Only the group owner can do this", 403, "NOT_GROUP_OWNER");
  }
}

export async function addGroupMembers(
  actorId: string,
  conversationId: string,
  userIds: readonly string[],
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const conversation = await dependencies.loadConversation(conversationId);
  requireGroupOwner(actorId, conversation);

  const existing = new Set(conversation.participants.map((participant) => participant.userId));
  const eligible = await assertGroupMembersEligible(actorId, userIds, dependencies);
  const addedUserIds = eligible.filter((userId) => !existing.has(userId));
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  if (addedUserIds.length === 0) {
    return await dependencies.mapConversation(conversation, actorId, deletedMessageLabel);
  }

  if (existing.size + addedUserIds.length > GROUP_DM_MAX_PARTICIPANTS) {
    throw new ApiError(
      `A group holds at most ${GROUP_DM_MAX_PARTICIPANTS} people`,
      400,
      "GROUP_FULL",
    );
  }

  const updated = await dependencies.writeAddedMembers({
    actorId,
    addedUserIds,
    conversationId,
  });

  return await dependencies.mapConversation(updated, actorId, deletedMessageLabel);
}

/**
 * Earliest `joinedAt` wins; `userId` breaks a tie so two servers replaying the
 * same departure pick the same owner.
 */
export function resolveNextGroupOwner(
  participants: ReadonlyArray<{ joinedAt: Date; userId: string }>,
  leavingUserId: string,
): string | null {
  const remaining = participants
    .filter((participant) => participant.userId !== leavingUserId)
    .sort((left, right) => {
      const byJoinedAt = left.joinedAt.getTime() - right.joinedAt.getTime();
      return byJoinedAt !== 0 ? byJoinedAt : left.userId.localeCompare(right.userId);
    });

  return remaining[0]?.userId ?? null;
}

export async function leaveGroupConversation(
  actorId: string,
  conversationId: string,
  dependencies: GroupServiceDependencies = defaults,
): Promise<void> {
  const conversation = await dependencies.loadConversation(conversationId);

  if (conversation.type !== "GROUP_DM") {
    throw new ApiError("This conversation is not a group", 400, "NOT_A_GROUP");
  }

  if (!conversation.participants.some((participant) => participant.userId === actorId)) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  // Last member out. Nothing left to hand the group to and nobody left to
  // announce the departure to, so the conversation goes instead of getting a
  // system row no one will ever read.
  if (conversation.participants.length === 1) {
    await dependencies.deleteConversation(conversationId);
    return;
  }

  // Only an owner's departure moves ownership. Null leaves `ownerId` untouched.
  const nextOwnerId =
    conversation.ownerId === actorId
      ? resolveNextGroupOwner(conversation.participants, actorId)
      : null;

  await dependencies.writeRemovedMember({
    actorId,
    conversationId,
    nextOwnerId,
    systemType: "MEMBER_LEFT",
    targetUserId: actorId,
  });
}

export async function removeGroupMember(
  actorId: string,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupServiceDependencies = defaults,
): Promise<void> {
  if (actorId === targetUserId) {
    await leaveGroupConversation(actorId, conversationId, dependencies);
    return;
  }

  const conversation = await dependencies.loadConversation(conversationId);
  requireGroupOwner(actorId, conversation);

  if (!conversation.participants.some((participant) => participant.userId === targetUserId)) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  await dependencies.writeRemovedMember({
    actorId,
    conversationId,
    nextOwnerId: null,
    systemType: "MEMBER_REMOVED",
    targetUserId,
  });
}
