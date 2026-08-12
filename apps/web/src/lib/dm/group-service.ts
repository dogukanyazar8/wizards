import {
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_DM_MIN_PARTICIPANTS,
  pickNextMemberNameColor,
  resolveHistoryFloor,
  type DMConversationDTO,
  type DMNotifyLevel,
  type DMParticipantRole,
  type GroupDisappearingWindow,
  type GroupDMSettingsUpdateRequest,
  type GroupHistoryVisibility,
  type GroupMemberRoleUpdateRequest,
  type GroupPermissionLevel,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

import {
  assertGroupAdmin,
  assertGroupOwner,
  assertGroupPermission,
  countGroupAdmins,
  groupAuthSelect,
  toGroupAuthContext,
  type GroupAuthContext,
} from "./group-permissions";
import { serializeGroupMembershipWrite } from "./group-membership-lock";
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

/**
 * One membership row as the group writes need it: the identity fields plus the
 * Faz 1 columns the permission gate and the colour assignment read.
 */
export type GroupParticipantRow = {
  historyFromAt?: Date | null;
  joinedAt: Date;
  nameColor?: string;
  notifyLevel?: DMNotifyLevel;
  pinnedStripDismissedId?: string | null;
  role?: DMParticipantRole;
  userId: string;
};

/**
 * What `loadConversation` returns: the conversation's own settings and its full
 * roster in one read. The roster is what the group writes actually need (colour
 * assignment, member counts, ownership succession), and it doubles as the input
 * the permission gate projects a context from — so a group write still costs one
 * conversation query, not one for the roster and one for the gate.
 */
export type GroupConversationDetail = GroupConversationRow & {
  /** K3. Read so `updateGroupSettings` can tell a change from a repeat. */
  disappearingAfter: GroupDisappearingWindow;
  historyVisibility: GroupHistoryVisibility;
  participants: GroupParticipantRow[];
  permAddMembers: GroupPermissionLevel;
  permEditInfo: GroupPermissionLevel;
  permPinMessage: GroupPermissionLevel;
  permSendMessage: GroupPermissionLevel;
  pinnedMessageId: string | null;
  type: string;
};

/** Whether one target may be pulled into a group by one actor. */
export type GroupMemberEligibility = {
  readonly blocked: boolean;
  /** 2b §7. The target's own switch: a friend who takes no group invites. */
  readonly closed: boolean;
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

export type GroupMemberInsert = {
  historyFromAt: Date | null;
  nameColor: string;
  role: DMParticipantRole;
  userId: string;
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
  loadConversation(conversationId: string): Promise<GroupConversationDetail>;
  /** Guards the pin write: a message from another conversation is not pinnable. */
  loadPinnableMessage(input: {
    conversationId: string;
    messageId: string;
  }): Promise<{ authorName: string; id: string } | null>;
  mapConversation(
    conversation: GroupConversationRow,
    viewerId: string,
    deletedMessageLabel: string,
  ): Promise<DMConversationDTO>;
  writeAddedMembers(input: {
    actorId: string;
    members: GroupMemberInsert[];
    conversationId: string;
  }): Promise<GroupConversationRow>;
  writeCreatedGroup(input: {
    actorId: string;
    avatarColor: string | null;
    description: string | null;
    historyVisibility: GroupHistoryVisibility;
    iconUrl: string | null;
    name: string | null;
    permAddMembers: GroupPermissionLevel;
    participants: GroupMemberInsert[];
  }): Promise<GroupConversationRow>;
  writeGroupMetadata(input: {
    actorId: string;
    conversationId: string;
    iconUrl?: string | null;
    name?: string | null;
    systemType: "ICON_CHANGED" | "NAME_CHANGED";
    systemValue: string | null;
  }): Promise<GroupConversationRow>;
  writeGroupSettings(input: {
    actorId: string;
    /**
     * K3 / C2. The new window, when it actually changed. Present means "also
     * write the system row and bump the conversation"; absent keeps the silent
     * behaviour every other setting has.
     */
    announceDisappearing?: GroupDisappearingWindow;
    conversationId: string;
    patch: GroupDMSettingsUpdateRequest;
  }): Promise<GroupConversationRow>;
  writeMemberRole(input: {
    conversationId: string;
    nextOwnerId: string | null;
    previousOwnerId: string | null;
    role: DMParticipantRole;
    targetUserId: string;
  }): Promise<GroupConversationRow>;
  writePinnedMessage(input: {
    actorId: string;
    conversationId: string;
    messageId: string | null;
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

    // Last, because it is the mildest of the three: a friend who is simply not
    // taking invites should not be reported as a block.
    if (state.closed) {
      throw new ApiError("This user does not accept group invites", 403, "GROUP_INVITES_CLOSED");
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
  /**
   * 2b §7. Targets whose `UserSettings.allowGroupInvites` is off. A separate
   * argument rather than a fourth row status: the switch belongs to the target
   * alone and has nothing to do with the pair.
   */
  closedUserIds: Iterable<string> = [],
): Map<string, GroupMemberEligibility> {
  const closed = new Set(closedUserIds);
  const eligibility = new Map<string, GroupMemberEligibility>(
    targetIds.map((targetId) => [
      targetId,
      { blocked: false, closed: closed.has(targetId), isFriend: false },
    ]),
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
        ? { blocked: true, closed: state.closed, isFriend: state.isFriend }
        : { blocked: state.blocked, closed: state.closed, isFriend: true },
    );
  }

  return eligibility;
}

const groupParticipantSelect = {
  historyFromAt: true,
  joinedAt: true,
  nameColor: true,
  notifyLevel: true,
  pinnedStripDismissedId: true,
  role: true,
  userId: true,
} as const;

const defaults: GroupServiceDependencies = {
  deleteConversation: async (conversationId) => {
    // Cascades clear participants, messages, reactions and attachments.
    await prisma.dMConversation.delete({ where: { id: conversationId } });
  },
  getDeletedMessageLabel,
  loadGroupEligibility: async (actorId, targetIds) => {
    // Friendship and blocks are both FriendRequest rows, so one read answers
    // both questions for every target at once. The privacy switch is a second
    // read because it lives on the target's settings, not on the pair; only the
    // rows that are *off* come back, so the payload is empty in the normal case.
    const [rows, closed] = await Promise.all([
      prisma.friendRequest.findMany({
        where: {
          status: { in: ["ACCEPTED", "BLOCKED"] },
          OR: [
            { senderId: actorId, receiverId: { in: [...targetIds] } },
            { receiverId: actorId, senderId: { in: [...targetIds] } },
          ],
        },
        select: { receiverId: true, senderId: true, status: true },
      }),
      prisma.userSettings.findMany({
        where: { allowGroupInvites: false, userId: { in: [...targetIds] } },
        select: { userId: true },
      }),
    ]);

    return toGroupEligibilityMap(
      actorId,
      targetIds,
      rows,
      closed.map((row) => row.userId),
    );
  },
  loadConversation: async (conversationId) => {
    const conversation = await prisma.dMConversation.findUnique({
      where: { id: conversationId },
      select: {
        ...groupAuthSelect,
        disappearingAfter: true,
        iconUrl: true,
        name: true,
        participants: { orderBy: { joinedAt: "asc" }, select: groupParticipantSelect },
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
  loadPinnableMessage: async ({ conversationId, messageId }) => {
    const message = await prisma.dMMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        placeholderRemovedAt: null,
        systemType: null,
      },
      select: { author: { select: { displayName: true, username: true } }, id: true },
    });

    return message
      ? { authorName: message.author.displayName ?? message.author.username, id: message.id }
      : null;
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
      await serializeGroupMembershipWrite(tx, input.conversationId);

      const currentParticipants = await tx.dMParticipant.findMany({
        select: { nameColor: true, userId: true },
        where: { conversationId: input.conversationId },
      });
      const currentUserIds = new Set(currentParticipants.map((participant) => participant.userId));
      const members = input.members.filter((member) => !currentUserIds.has(member.userId));
      const colors = assignNameColors(
        currentParticipants
          .map((participant) => participant.nameColor)
          .filter((color): color is string => typeof color === "string"),
        members.map((member) => member.userId),
      );

      if (currentParticipants.length + members.length > GROUP_DM_MAX_PARTICIPANTS) {
        throw new ApiError(
          `A group holds at most ${GROUP_DM_MAX_PARTICIPANTS} people`,
          400,
          "GROUP_FULL",
        );
      }

      if (members.length > 0) {
        await tx.dMParticipant.createMany({
          data: members.map((member) => ({
            conversationId: input.conversationId,
            historyFromAt: member.historyFromAt,
            nameColor: colors.get(member.userId) ?? member.nameColor,
            role: member.role,
            userId: member.userId,
          })),
          skipDuplicates: true,
        });

        await tx.dMMessage.create({
          data: {
            content: "",
            conversationId: input.conversationId,
            systemTargetUserIds: members.map((member) => member.userId),
            systemType: "MEMBER_ADDED",
            userId: input.actorId,
          },
        });
      }

      // A system row still moves the conversation up the inbox, but it must not
      // light anyone's unread badge — no participant counters are touched.
      const conversation =
        members.length > 0
          ? await tx.dMConversation.update({
              data: { lastMessageAt: new Date() },
              select: { iconUrl: true, id: true, name: true, ownerId: true },
              where: { id: input.conversationId },
            })
          : await tx.dMConversation.findUniqueOrThrow({
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
          avatarColor: input.avatarColor,
          description: input.description,
          historyVisibility: input.historyVisibility,
          iconUrl: input.iconUrl,
          name: input.name,
          ownerId: input.actorId,
          participants: {
            create: input.participants.map((participant) => ({
              nameColor: participant.nameColor,
              role: participant.role,
              userId: participant.userId,
            })),
          },
          permAddMembers: input.permAddMembers,
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

      return {
        ...conversation,
        included,
        participantUserIds: input.participants.map((participant) => participant.userId),
      };
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
  writeGroupSettings: async (input) => {
    // No system row and no `lastMessageAt` bump: 2f's switches are configuration,
    // and announcing them would drag the group to the top of every inbox. The
    // one exception is the disappearing window, which changes what happens to
    // everybody's future messages — see `announceDisappearing`.
    const conversation = await prisma.dMConversation.update({
      data: {
        ...(input.patch.avatarColor === undefined ? {} : { avatarColor: input.patch.avatarColor }),
        ...(input.patch.description === undefined ? {} : { description: input.patch.description }),
        ...(input.patch.disappearingAfter === undefined
          ? {}
          : { disappearingAfter: input.patch.disappearingAfter }),
        ...(input.announceDisappearing === undefined ? {} : { lastMessageAt: new Date() }),
        ...(input.patch.historyVisibility === undefined
          ? {}
          : { historyVisibility: input.patch.historyVisibility }),
        ...(input.patch.permAddMembers === undefined
          ? {}
          : { permAddMembers: input.patch.permAddMembers }),
        ...(input.patch.permEditInfo === undefined
          ? {}
          : { permEditInfo: input.patch.permEditInfo }),
        ...(input.patch.permPinMessage === undefined
          ? {}
          : { permPinMessage: input.patch.permPinMessage }),
        ...(input.patch.permSendMessage === undefined
          ? {}
          : { permSendMessage: input.patch.permSendMessage }),
      },
      select: { iconUrl: true, id: true, name: true, ownerId: true },
      where: { id: input.conversationId },
    });

    if (input.announceDisappearing !== undefined) {
      await prisma.dMMessage.create({
        data: {
          content: "",
          conversationId: input.conversationId,
          systemTargetUserIds: [],
          systemType: "DISAPPEARING_CHANGED",
          // The window itself, so the reader builds the sentence in their own
          // locale like every other system row.
          systemValue: input.announceDisappearing,
          userId: input.actorId,
        },
      });
    }

    const included = await prisma.dMConversation.findUniqueOrThrow({
      include: dmConversationInclude,
      where: { id: input.conversationId },
    });

    return {
      ...conversation,
      included,
      participantUserIds: included.participants.map((participant) => participant.userId),
    };
  },
  writeMemberRole: async (input) =>
    prisma.$transaction(async (tx) => {
      await tx.dMParticipant.update({
        data: { role: input.role },
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.targetUserId,
          },
        },
      });

      // A handover is three writes that have to land together, or the group ends
      // up with two owners or none.
      if (input.nextOwnerId && input.previousOwnerId) {
        await tx.dMParticipant.update({
          data: { role: "ADMIN" },
          where: {
            conversationId_userId: {
              conversationId: input.conversationId,
              userId: input.previousOwnerId,
            },
          },
        });
      }

      const conversation = await tx.dMConversation.update({
        data: input.nextOwnerId === null ? {} : { ownerId: input.nextOwnerId },
        select: { iconUrl: true, id: true, name: true, ownerId: true },
        where: { id: input.conversationId },
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
  writePinnedMessage: async (input) =>
    prisma.$transaction(async (tx) => {
      const conversation = await tx.dMConversation.update({
        data: {
          pinnedAt: input.messageId === null ? null : new Date(),
          pinnedById: input.messageId === null ? null : input.actorId,
          pinnedMessageId: input.messageId,
        },
        select: { iconUrl: true, id: true, name: true, ownerId: true },
        where: { id: input.conversationId },
      });

      // A new pin is new information, so everybody's dismissal of the previous
      // one is cleared — otherwise whoever closed the last strip would never see
      // this one.
      await tx.dMParticipant.updateMany({
        data: { pinnedStripDismissedId: null },
        where: { conversationId: input.conversationId },
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

      // The new owner's membership row has to agree with `ownerId`, or the
      // permission gate keeps reading them as a plain member.
      if (input.nextOwnerId !== null) {
        await tx.dMParticipant.update({
          data: { role: "OWNER" },
          where: {
            conversationId_userId: {
              conversationId: input.conversationId,
              userId: input.nextOwnerId,
            },
          },
        });
      }
    }),
};

/**
 * The permission context for a conversation the caller already loaded. Reuses
 * the roster read rather than issuing the gate's own query — the rules still
 * live in `group-permissions.ts`, only the row comes from here.
 */
function toContext(conversation: GroupConversationDetail, actorId: string): GroupAuthContext {
  return toGroupAuthContext(
    {
      ...conversation,
      participants: conversation.participants.map((participant) => ({
        historyFromAt: participant.historyFromAt ?? null,
        joinedAt: participant.joinedAt,
        notifyLevel: participant.notifyLevel ?? "ALL",
        pinnedStripDismissedId: participant.pinnedStripDismissedId ?? null,
        role: participant.role ?? "MEMBER",
        userId: participant.userId,
      })),
    },
    actorId,
  );
}

/**
 * Hands out one colour per new membership, each pick aware of the ones made
 * moments earlier in the same request — a map over `pickNextMemberNameColor`
 * with a frozen `used` list would give a 3-person group three identical colours.
 */
function assignNameColors(
  usedColors: readonly string[],
  userIds: readonly string[],
): Map<string, string> {
  const used = [...usedColors];
  const assigned = new Map<string, string>();

  for (const userId of userIds) {
    const color = pickNextMemberNameColor(used);
    used.push(color);
    assigned.set(userId, color);
  }

  return assigned;
}

export async function createGroupConversation(
  actorId: string,
  input: {
    avatarColor?: string | null;
    description?: string | null;
    historyVisibility?: GroupHistoryVisibility;
    iconUrl?: string | null;
    name?: string | null;
    permAddMembers?: GroupPermissionLevel;
    userIds: readonly string[];
  },
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
  const colors = assignNameColors([], participantUserIds);
  const conversation = await dependencies.writeCreatedGroup({
    actorId,
    avatarColor: input.avatarColor ?? null,
    description: input.description ?? null,
    historyVisibility: input.historyVisibility ?? "LAST_30D",
    iconUrl: input.iconUrl ?? null,
    name,
    participants: participantUserIds.map((userId) => ({
      // Founding members see everything: the group has no history to hide yet.
      historyFromAt: null,
      nameColor: colors.get(userId) ?? "#C2185B",
      role: userId === actorId ? "OWNER" : "MEMBER",
      userId,
    })),
    permAddMembers: input.permAddMembers ?? "ALL",
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
  assertGroupConversation(conversation);
  // K4: the group's own `permAddMembers` decides, not ownership. A group that
  // left the row on "Tüm üyeler" lets any member add somebody.
  assertGroupPermission(toContext(conversation, actorId), "addMembers");

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

  // One instant for the whole request: the floor is derived from the same
  // moment the rows are stamped with, so a member cannot land a hair outside
  // their own window.
  const joinedAt = new Date();
  const historyFromAt = resolveHistoryFloor(conversation.historyVisibility, joinedAt);
  const colors = assignNameColors(
    conversation.participants
      .map((participant) => participant.nameColor)
      .filter((color): color is string => typeof color === "string"),
    addedUserIds,
  );

  const updated = await dependencies.writeAddedMembers({
    actorId,
    conversationId,
    members: addedUserIds.map((userId) => ({
      historyFromAt,
      nameColor: colors.get(userId) ?? "#C2185B",
      role: "MEMBER",
      userId,
    })),
  });

  return await dependencies.mapConversation(updated, actorId, deletedMessageLabel);
}

/**
 * V8. Admins first — handing a group to somebody the owner already trusted beats
 * handing it to whoever joined earliest. Within a tier, earliest `joinedAt` wins
 * and `userId` breaks a tie, so two servers replaying the same departure pick the
 * same owner.
 */
export function resolveNextGroupOwner(
  participants: ReadonlyArray<{ joinedAt: Date; role?: DMParticipantRole; userId: string }>,
  leavingUserId: string,
): string | null {
  const remaining = participants
    .filter((participant) => participant.userId !== leavingUserId)
    .sort((left, right) => {
      const leftIsAdmin = left.role === "ADMIN" || left.role === "OWNER" ? 0 : 1;
      const rightIsAdmin = right.role === "ADMIN" || right.role === "OWNER" ? 0 : 1;
      if (leftIsAdmin !== rightIsAdmin) {
        return leftIsAdmin - rightIsAdmin;
      }

      const byJoinedAt = left.joinedAt.getTime() - right.joinedAt.getTime();
      return byJoinedAt !== 0 ? byJoinedAt : left.userId.localeCompare(right.userId);
    });

  return remaining[0]?.userId ?? null;
}

export type GroupLeaveOptions = {
  /**
   * V8. Names the successor when the departing member is the group's last
   * administrator. Absent in that case is a 409, not an implicit choice.
   */
  transferOwnershipTo?: string | null;
};

export async function leaveGroupConversation(
  actorId: string,
  conversationId: string,
  dependencies: GroupServiceDependencies = defaults,
  options: GroupLeaveOptions = {},
): Promise<GroupMemberRemovalResult> {
  const conversation = await dependencies.loadConversation(conversationId);
  assertGroupConversation(conversation);

  const actor = conversation.participants.find((participant) => participant.userId === actorId);
  if (!actor) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  // Last member out. Nothing left to hand the group to and nobody left to
  // announce the departure to, so the conversation goes instead of getting a
  // system row no one will ever read.
  if (conversation.participants.length === 1) {
    await dependencies.deleteConversation(conversationId);
    return { broadcastViewerId: null };
  }

  const explicitSuccessorId = options.transferOwnershipTo ?? null;
  if (explicitSuccessorId !== null) {
    assertTransferTarget(conversation, actorId, explicitSuccessorId);
  }

  // 2f §5: "son yönetici ayrılıyorsa önce yönetici devri istenir". The group
  // would otherwise be left with nobody who can edit it, remove anyone, or
  // promote a replacement.
  if (
    countGroupAdmins(
      conversation.participants.map((participant) => ({
        role: participant.role ?? "MEMBER",
        userId: participant.userId,
      })),
      actorId,
    ) === 0 &&
    (actor.role === "OWNER" || actor.role === "ADMIN") &&
    explicitSuccessorId === null
  ) {
    throw new ApiError(
      "Pick somebody to take the group over before you leave",
      409,
      "OWNER_TRANSFER_REQUIRED",
    );
  }

  // The earliest remaining member: the owner the group falls to when the owner is
  // the one leaving, and either way somebody who can still read the conversation
  // once the actor is out of it.
  const earliestRemainingId = resolveNextGroupOwner(conversation.participants, actorId);
  // Only an owner's departure moves ownership. Null leaves `ownerId` untouched.
  const nextOwnerId =
    conversation.ownerId === actorId ? (explicitSuccessorId ?? earliestRemainingId) : null;

  await dependencies.writeRemovedMember({
    actorId,
    conversationId,
    nextOwnerId,
    systemType: "MEMBER_LEFT",
    targetUserId: actorId,
  });

  return { broadcastViewerId: nextOwnerId ?? earliestRemainingId };
}

function assertTransferTarget(
  conversation: GroupConversationDetail,
  actorId: string,
  targetUserId: string,
): void {
  if (targetUserId === actorId) {
    throw new ApiError("You cannot hand the group to yourself", 400, "INVALID_OWNER_TRANSFER");
  }

  if (!conversation.participants.some((participant) => participant.userId === targetUserId)) {
    throw new ApiError("That member is not in this group", 404, "NOT_FOUND");
  }
}

export async function removeGroupMember(
  actorId: string,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupServiceDependencies = defaults,
  options: GroupLeaveOptions = {},
): Promise<GroupMemberRemovalResult> {
  if (actorId === targetUserId) {
    return await leaveGroupConversation(actorId, conversationId, dependencies, options);
  }

  const conversation = await dependencies.loadConversation(conversationId);
  assertGroupConversation(conversation);
  const context = toContext(conversation, actorId);
  assertGroupAdmin(context);

  const target = conversation.participants.find(
    (participant) => participant.userId === targetUserId,
  );
  if (!target) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  const targetRole = target.role ?? "MEMBER";
  if (targetRole === "OWNER") {
    throw new ApiError("The group owner cannot be removed", 403, "FORBIDDEN");
  }

  // An admin outranks members only. Letting one admin remove another would make
  // the whole tier one race away from a single survivor.
  if (targetRole === "ADMIN" && context.role !== "OWNER") {
    throw new ApiError("Only the group owner can remove an admin", 403, "FORBIDDEN");
  }

  await dependencies.writeRemovedMember({
    actorId,
    conversationId,
    nextOwnerId: null,
    systemType: "MEMBER_REMOVED",
    targetUserId,
  });

  // The actor did the removing, so they are still inside and can read the
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
  assertGroupConversation(conversation);
  assertGroupPermission(toContext(conversation, actorId), "editInfo");
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

/**
 * 2f §3 and 2c §5/§7. Configuration rather than identity, so — unlike a name or
 * an icon change — it writes no system row and does not move the conversation up
 * anybody's inbox.
 */
export async function updateGroupSettings(
  actorId: string,
  conversationId: string,
  patch: GroupDMSettingsUpdateRequest,
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const conversation = await dependencies.loadConversation(conversationId);
  assertGroupConversation(conversation);
  assertGroupPermission(toContext(conversation, actorId), "editInfo");

  // K3 / C2. Only a real change announces itself. Re-saving the same window from
  // a settings screen must not post a system row saying nothing happened.
  const announceDisappearing =
    patch.disappearingAfter !== undefined &&
    patch.disappearingAfter !== conversation.disappearingAfter
      ? patch.disappearingAfter
      : undefined;

  const updated = await dependencies.writeGroupSettings({
    actorId,
    conversationId,
    patch,
    ...(announceDisappearing === undefined ? {} : { announceDisappearing }),
  });
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  return await dependencies.mapConversation(updated, actorId, deletedMessageLabel);
}

/**
 * 2e §7. Promotion, demotion and handover behind one call. Only the owner may
 * use any of them: an admin who could appoint admins is an owner with extra
 * steps.
 */
export async function updateMemberRole(
  actorId: string,
  conversationId: string,
  targetUserId: string,
  input: GroupMemberRoleUpdateRequest,
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const conversation = await dependencies.loadConversation(conversationId);
  assertGroupConversation(conversation);
  assertGroupOwner(toContext(conversation, actorId));

  if (targetUserId === actorId) {
    throw new ApiError("You cannot change your own role", 400, "INVALID_ROLE_CHANGE");
  }

  if (!conversation.participants.some((participant) => participant.userId === targetUserId)) {
    throw new ApiError("That member is not in this group", 404, "NOT_FOUND");
  }

  const nextRole: DMParticipantRole = input.transferOwnership === true ? "OWNER" : input.role;
  const transfers = nextRole === "OWNER";
  const updated = await dependencies.writeMemberRole({
    conversationId,
    // The old owner is demoted to ADMIN rather than dropped to MEMBER: they keep
    // the tier they were already exercising, and the group never passes through
    // a state with no administrator.
    nextOwnerId: transfers ? targetUserId : null,
    previousOwnerId: transfers ? actorId : null,
    role: nextRole,
    targetUserId,
  });
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  return await dependencies.mapConversation(updated, actorId, deletedMessageLabel);
}

/** 2d §2 / 2e §4. `messageId: null` unpins. */
export async function setPinnedMessage(
  actorId: string,
  conversationId: string,
  messageId: string | null,
  dependencies: GroupServiceDependencies = defaults,
): Promise<DMConversationDTO> {
  const conversation = await dependencies.loadConversation(conversationId);
  assertGroupConversation(conversation);
  assertGroupPermission(toContext(conversation, actorId), "pinMessage");

  if (messageId !== null) {
    // A message id from another conversation would pin content the members are
    // not allowed to read, and the FK alone would happily accept it.
    const message = await dependencies.loadPinnableMessage({ conversationId, messageId });

    if (!message) {
      throw new ApiError("Message not found in this conversation", 404, "NOT_FOUND");
    }
  }

  const updated = await dependencies.writePinnedMessage({ actorId, conversationId, messageId });
  const deletedMessageLabel = await dependencies.getDeletedMessageLabel(actorId);

  return await dependencies.mapConversation(updated, actorId, deletedMessageLabel);
}

/**
 * The three per-participant writes need no conversation read at all: membership
 * is the `where` clause, so a non-participant updates zero rows and that is the
 * 403. One statement, no gate query.
 */
export type ParticipantWriteDependencies = {
  updateParticipant(input: {
    conversationId: string;
    data: {
      muted?: boolean;
      notifyLevel?: DMNotifyLevel;
      pinnedAt?: Date | null;
      pinnedStripDismissedId?: string | null;
    };
    userId: string;
  }): Promise<number>;
};

const participantDefaults: ParticipantWriteDependencies = {
  updateParticipant: async ({ conversationId, data, userId }) => {
    // `updateMany` rather than `update`: a non-participant produces a count of
    // zero, which is a clean 403, where `update` would raise a Prisma P2025 the
    // route would have to translate.
    const result = await prisma.dMParticipant.updateMany({
      data,
      where: { conversationId, userId },
    });
    return result.count;
  },
};

async function writeOwnParticipant(
  userId: string,
  conversationId: string,
  data: Parameters<ParticipantWriteDependencies["updateParticipant"]>[0]["data"],
  dependencies: ParticipantWriteDependencies,
): Promise<void> {
  const updated = await dependencies.updateParticipant({ conversationId, data, userId });

  if (updated === 0) {
    throw new ApiError("You are not a participant in this conversation", 403, "FORBIDDEN");
  }
}

/**
 * 2f §2. §4.2's invariant: `notifyLevel` is the authority and `muted` is its
 * mirror, and the two are written in the same statement. Splitting them into two
 * updates is what lets a crash between them leave the app muted in one surface
 * and loud in another.
 */
export async function setNotifyLevel(
  userId: string,
  conversationId: string,
  notifyLevel: DMNotifyLevel,
  dependencies: ParticipantWriteDependencies = participantDefaults,
): Promise<{ notifyLevel: DMNotifyLevel }> {
  await writeOwnParticipant(
    userId,
    conversationId,
    { muted: notifyLevel === "NONE", notifyLevel },
    dependencies,
  );

  return { notifyLevel };
}

/** V3 / 2a §2. Personal, so it needs no permission and works on a 1:1 DM. */
export async function setConversationPin(
  userId: string,
  conversationId: string,
  pinned: boolean,
  dependencies: ParticipantWriteDependencies = participantDefaults,
  now: Date = new Date(),
): Promise<{ pinnedAt: string | null }> {
  const pinnedAt = pinned ? now : null;
  await writeOwnParticipant(userId, conversationId, { pinnedAt }, dependencies);

  return { pinnedAt: pinnedAt?.toISOString() ?? null };
}

/**
 * 2d §2. Records *which* pin was dismissed rather than a boolean, so the next pin
 * still shows for somebody who closed the previous strip.
 */
export async function dismissPinnedStrip(
  userId: string,
  conversationId: string,
  messageId: string,
  dependencies: ParticipantWriteDependencies = participantDefaults,
): Promise<void> {
  await writeOwnParticipant(
    userId,
    conversationId,
    { pinnedStripDismissedId: messageId },
    dependencies,
  );
}
