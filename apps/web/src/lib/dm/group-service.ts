import {
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_DM_MIN_PARTICIPANTS,
  type DMConversationDTO,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

import {
  dmConversationInclude,
  getDeletedMessageLabel,
  mapDMConversationDTO,
  type RawDMConversation,
} from "./service";

export type GroupConversationRow = {
  iconUrl: string | null;
  id: string;
  name: string | null;
  ownerId: string | null;
  participantUserIds: string[];
  /**
   * The full DTO projection, when the writer already loaded it inside its own
   * transaction. Present means "do not read this row again": the write path used
   * to commit and then re-read the same conversation to build the response.
   *
   * Optional because a caller may hand in a row it assembled itself (the tests
   * do), and because `loadConversation` deliberately keeps its narrow select —
   * it answers ownership questions, not rendering ones.
   */
  included?: RawDMConversation;
};

/** Whether one target may be pulled into a group by one actor. */
export type GroupMemberEligibility = {
  readonly blocked: boolean;
  readonly isFriend: boolean;
};

export type GroupMemberRemovalResult = {
  /**
   * A member who is still in the group after the removal, so callers can load the
   * broadcast projection as somebody who can actually read it. Null once the group
   * itself is gone.
   *
   * The actor is not usable here: on a leave the actor is the person who just
   * left, and the conversation read requires participation, so it would come back
   * empty and the remaining members would never be told.
   */
  readonly broadcastViewerId: string | null;
};

export type GroupServiceDependencies = {
  deleteConversation(conversationId: string): Promise<void>;
  getDeletedMessageLabel(userId: string): Promise<string>;
  /**
   * Friendship and block state for the whole picker in one call. Per-target
   * lookups cost two round trips each, so a 32-person group paid 62 serial
   * queries before a single row was written.
   */
  loadGroupEligibility(
    actorId: string,
    targetIds: readonly string[],
  ): Promise<ReadonlyMap<string, GroupMemberEligibility>>;
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
  writeGroupMetadata(input: {
    actorId: string;
    conversationId: string;
    iconUrl?: string | null;
    name?: string | null;
    systemType: "ICON_CHANGED" | "NAME_CHANGED";
    systemValue: string | null;
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

  if (targets.length === 0) {
    return targets;
  }

  const eligibility = await dependencies.loadGroupEligibility(actorId, targets);

  // Verdicts stay in the caller's order and blocks still win over friendship, so
  // the error reported is the one a per-target loop reported. A target the query
  // said nothing about fails closed as "not a friend".
  for (const targetId of targets) {
    const state = eligibility.get(targetId);

    if (state?.blocked) {
      throw new ApiError("You cannot add this user to a group", 403, "BLOCKED");
    }

    if (!state?.isFriend) {
      throw new ApiError("You can only add friends to a group", 403, "NOT_FRIENDS");
    }
  }

  return targets;
}

/**
 * Row-to-verdict projection for `loadGroupEligibility`, kept separate from the
 * query because this is the half that can be wrong: which end of the row is the
 * target, and what happens when a pair carries both an ACCEPTED and a BLOCKED
 * row. A target no row mentions stays a non-friend, so the check fails closed.
 */
export function toGroupEligibilityMap(
  actorId: string,
  targetIds: readonly string[],
  rows: ReadonlyArray<{ receiverId: string; senderId: string; status: string }>,
): Map<string, GroupMemberEligibility> {
  const eligibility = new Map<string, GroupMemberEligibility>(
    targetIds.map((targetId) => [targetId, { blocked: false, isFriend: false }]),
  );

  for (const row of rows) {
    const targetId = row.senderId === actorId ? row.receiverId : row.senderId;
    const state = eligibility.get(targetId);

    if (!state) {
      continue;
    }

    eligibility.set(
      targetId,
      row.status === "BLOCKED"
        ? { blocked: true, isFriend: state.isFriend }
        : { blocked: state.blocked, isFriend: true },
    );
  }

  return eligibility;
}

const defaults: GroupServiceDependencies = {
  deleteConversation: async (conversationId) => {
    // Cascades clear participants, messages, reactions and attachments.
    await prisma.dMConversation.delete({ where: { id: conversationId } });
  },
  getDeletedMessageLabel,
  loadGroupEligibility: async (actorId, targetIds) => {
    // Friendship and blocks are both FriendRequest rows, so one read answers
    // both questions for every target at once.
    const rows = await prisma.friendRequest.findMany({
      where: {
        status: { in: ["ACCEPTED", "BLOCKED"] },
        OR: [
          { senderId: actorId, receiverId: { in: [...targetIds] } },
          { receiverId: actorId, senderId: { in: [...targetIds] } },
        ],
      },
      select: { receiverId: true, senderId: true, status: true },
    });

    return toGroupEligibilityMap(actorId, targetIds, rows);
  },
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
    // The writers load this projection in-transaction, so the common path costs
    // nothing here. The read stays for callers that pass a row without it.
    const row =
      conversation.included ??
      (await prisma.dMConversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: dmConversationInclude,
      }));

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

      // One read instead of two: the roster this returns and the projection the
      // response needs are the same rows, and `dmConversationInclude` already
      // orders participants by `joinedAt`.
      const included = await tx.dMConversation.findUniqueOrThrow({
        include: dmConversationInclude,
        where: { id: input.conversationId },
      });

      return {
        ...conversation,
        included,
        participantUserIds: included.participants.map((participant) => participant.userId),
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

      const included = await tx.dMConversation.findUniqueOrThrow({
        include: dmConversationInclude,
        where: { id: conversation.id },
      });

      return { ...conversation, included, participantUserIds: input.participantUserIds };
    }),
  writeGroupMetadata: async (input) =>
    prisma.$transaction(async (tx) => {
      const conversation = await tx.dMConversation.update({
        data: {
          lastMessageAt: new Date(),
          ...(input.iconUrl === undefined ? {} : { iconUrl: input.iconUrl }),
          ...(input.name === undefined ? {} : { name: input.name }),
        },
        select: { iconUrl: true, id: true, name: true, ownerId: true },
        where: { id: input.conversationId },
      });

      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId: input.conversationId,
          systemTargetUserIds: [],
          systemType: input.systemType,
          systemValue: input.systemValue,
          userId: input.actorId,
        },
      });

      const included = await tx.dMConversation.findUniqueOrThrow({
        include: dmConversationInclude,
        where: { id: input.conversationId },
      });

      return {
        ...conversation,
        included,
        participantUserIds: included.participants.map((participant) => participant.userId),
      };
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

/**
 * Faz 7 §20.1(b). The "this is not a group" guard is shared: `requireGroupOwner`
 * runs it before the ownership test, and leaving runs it on its own because
 * leaving needs no ownership. Two copies of the same throw were two places for
 * the code and the status to drift apart.
 */
function assertGroupConversation(conversation: { type: string }): void {
  if (conversation.type !== "GROUP_DM") {
    throw new ApiError("This conversation is not a group", 400, "NOT_A_GROUP");
  }
}

export function requireGroupOwner(
  actorId: string,
  conversation: { ownerId: string | null; type: string },
): void {
  assertGroupConversation(conversation);

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
): Promise<GroupMemberRemovalResult> {
  const conversation = await dependencies.loadConversation(conversationId);
  assertGroupConversation(conversation);

  if (!conversation.participants.some((participant) => participant.userId === actorId)) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  // Last member out. Nothing left to hand the group to and nobody left to
  // announce the departure to, so the conversation goes instead of getting a
  // system row no one will ever read.
  if (conversation.participants.length === 1) {
    await dependencies.deleteConversation(conversationId);
    return { broadcastViewerId: null };
  }

  // The earliest remaining member: the owner the group falls to when the owner is
  // the one leaving, and either way somebody who can still read the conversation
  // once the actor is out of it.
  const earliestRemainingId = resolveNextGroupOwner(conversation.participants, actorId);
  // Only an owner's departure moves ownership. Null leaves `ownerId` untouched.
  const nextOwnerId = conversation.ownerId === actorId ? earliestRemainingId : null;

  await dependencies.writeRemovedMember({
    actorId,
    conversationId,
    nextOwnerId,
    systemType: "MEMBER_LEFT",
    targetUserId: actorId,
  });

  return { broadcastViewerId: earliestRemainingId };
}

export async function removeGroupMember(
  actorId: string,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupServiceDependencies = defaults,
): Promise<GroupMemberRemovalResult> {
  if (actorId === targetUserId) {
    return await leaveGroupConversation(actorId, conversationId, dependencies);
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

  // The owner did the removing, so they are still inside and can read the
  // projection the remaining members are about to be sent.
  return { broadcastViewerId: actorId };
}

export async function updateGroupConversation(
  actorId: string,
  conversationId: string,
  patch: { iconUrl?: string | null; name?: string | null },
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const conversation = await dependencies.loadConversation(conversationId);
  requireGroupOwner(actorId, conversation);
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  const changesName = patch.name !== undefined;
  const changesIcon = patch.iconUrl !== undefined;

  if (!changesName && !changesIcon) {
    return await dependencies.mapConversation(conversation, actorId, deletedMessageLabel);
  }

  // A single request can only announce one thing; the name wins because it is
  // the change other members actually read in the inbox row.
  const systemType = changesName ? "NAME_CHANGED" : "ICON_CHANGED";
  const updated = await dependencies.writeGroupMetadata({
    actorId,
    conversationId,
    systemType,
    systemValue: changesName ? (patch.name ?? null) : null,
    ...(changesIcon ? { iconUrl: patch.iconUrl } : {}),
    ...(changesName ? { name: patch.name } : {}),
  });

  return await dependencies.mapConversation(updated, actorId, deletedMessageLabel);
}
