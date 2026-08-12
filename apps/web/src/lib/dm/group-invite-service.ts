import {
  GROUP_DM_MAX_PARTICIPANTS,
  GROUP_INVITE_CODE_LENGTH,
  buildGroupInviteDisplayUrl,
  buildGroupInviteUrl,
  pickNextMemberNameColor,
  resolveGroupInviteBlock,
  resolveHistoryFloor,
  type DMConversationDTO,
  type GroupInviteDTO,
  type GroupInvitePreviewDTO,
  type GroupInviteJoinBlockReason,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";
import { resolveAppOrigin, resolveAppOriginDisplayHost } from "@/lib/app-origin";
import { getBlockedUserIdsForUser } from "@/lib/friends/helpers";
import { generateUniqueInviteCode } from "@/lib/invite/code";

import {
  assertGroupConversation,
  assertGroupPermission,
  groupAuthSelect,
  toGroupAuthContext,
  type GroupAuthConversationRow,
  type GroupAuthParticipantRow,
} from "./group-permissions";
import { serializeGroupMembershipWrite } from "./group-membership-lock";
import { getDirectMessageConversationForUser } from "./service";

/**
 * Grup sohbetleri 2a–2f, Faz 2 §B. The group's single invite link: switching it
 * on, rotating it, previewing it as a stranger, and redeeming it.
 *
 * Permission comes from `group-permissions.ts` (Faz 1 binding decision 1) — this
 * module never writes its own check. Everything the tests need to drive is a
 * dependency, because the web test runner has no database and "no permission, no
 * write" has to be proved by behaviour rather than asserted in a comment.
 */

export type GroupInviteParticipantRow = GroupAuthParticipantRow & {
  readonly nameColor: string | null;
};

/**
 * The projection every invite operation needs, in one read: the permission gate's
 * own columns plus the whole roster, which is what capacity, colour assignment
 * and the block check all consume. `toGroupAuthContext` picks the caller's row
 * out of the same array, so the gate costs no extra query.
 */
export type GroupInviteConversationRow = Omit<GroupAuthConversationRow, "participants"> & {
  readonly avatarColor: string | null;
  readonly iconUrl: string | null;
  readonly name: string | null;
  // `Omit` rather than a plain intersection: intersecting two array types leaves
  // the element type ambiguous, and `.map` would hand back the narrower row
  // without `nameColor`.
  readonly participants: readonly GroupInviteParticipantRow[];
};

export type GroupInviteRow = {
  readonly code: string;
  readonly conversationId: string;
  readonly createdAt: Date;
  readonly enabled: boolean;
  readonly expiresAt: Date | null;
  readonly id: string;
  readonly maxUses: number | null;
  readonly rotatedAt: Date | null;
  readonly uses: number;
};

export type GroupInviteJoinWrite = {
  readonly actorId: string;
  readonly conversationId: string;
  readonly inviteCode: string;
  readonly inviteId: string;
  readonly member: {
    readonly historyFromAt: Date | null;
    readonly nameColor: string;
    readonly role: "MEMBER";
    readonly userId: string;
  };
  readonly systemValue: string;
};

export type GroupInviteDependencies = {
  generateCode(): Promise<string>;
  loadBlockedUserIds(userId: string, candidateUserIds: readonly string[]): Promise<Set<string>>;
  loadConversation(conversationId: string): Promise<GroupInviteConversationRow | null>;
  loadConversationForViewer(conversationId: string, userId: string): Promise<DMConversationDTO>;
  loadInviteByCode(
    code: string,
  ): Promise<{ conversation: GroupInviteConversationRow; invite: GroupInviteRow } | null>;
  loadInviteByConversation(conversationId: string): Promise<GroupInviteRow | null>;
  now(): Date;
  resolveOrigin(): { displayHost: string | null; url: URL | null };
  /** `code`/`rotatedAt` absent means "leave what is already stored alone". */
  upsertInvite(input: {
    actorId: string;
    code?: string;
    conversationId: string;
    enabled: boolean;
    rotatedAt?: Date;
  }): Promise<GroupInviteRow>;
  writeJoin(input: GroupInviteJoinWrite): Promise<boolean>;
};

const inviteConversationSelect = {
  ...groupAuthSelect,
  avatarColor: true,
  iconUrl: true,
  name: true,
  participants: {
    orderBy: { joinedAt: "asc" },
    select: {
      historyFromAt: true,
      joinedAt: true,
      nameColor: true,
      notifyLevel: true,
      pinnedStripDismissedId: true,
      role: true,
      userId: true,
    },
  },
} as const;

const inviteSelect = {
  code: true,
  conversationId: true,
  createdAt: true,
  enabled: true,
  expiresAt: true,
  id: true,
  maxUses: true,
  rotatedAt: true,
  uses: true,
} as const;

const defaults: GroupInviteDependencies = {
  generateCode: () =>
    generateUniqueInviteCode({
      isTaken: async (code) =>
        Boolean(await prisma.groupInvite.findUnique({ where: { code }, select: { id: true } })),
      length: GROUP_INVITE_CODE_LENGTH,
    }),
  loadBlockedUserIds: getBlockedUserIdsForUser,
  loadConversation: (conversationId) =>
    prisma.dMConversation.findUnique({
      where: { id: conversationId },
      select: inviteConversationSelect,
    }),
  loadConversationForViewer: getDirectMessageConversationForUser,
  loadInviteByCode: async (code) => {
    // One read: the invite row and the conversation it points at. Preview and
    // join both need both, and `code` is a unique index.
    const invite = await prisma.groupInvite.findUnique({
      where: { code },
      select: { ...inviteSelect, conversation: { select: inviteConversationSelect } },
    });

    if (!invite) {
      return null;
    }

    const { conversation, ...row } = invite;
    return { conversation, invite: row };
  },
  loadInviteByConversation: (conversationId) =>
    prisma.groupInvite.findUnique({ where: { conversationId }, select: inviteSelect }),
  now: () => new Date(),
  resolveOrigin: () => ({
    displayHost: resolveAppOriginDisplayHost(),
    url: resolveAppOrigin(),
  }),
  upsertInvite: async ({ actorId, code, conversationId, enabled, rotatedAt }) =>
    prisma.groupInvite.upsert({
      where: { conversationId },
      create: {
        // A create without a code cannot happen: the service only omits it when
        // a row already exists, which is the update branch.
        code: code ?? "",
        conversationId,
        createdById: actorId,
        enabled,
        ...(rotatedAt === undefined ? {} : { rotatedAt }),
      },
      update: {
        enabled,
        // A rotation is the only write that touches the code, and it zeroes the
        // counter in the same statement: a fresh link carrying the old usage
        // count would be exhausted before anybody clicked it.
        ...(code === undefined ? {} : { code, uses: 0 }),
        ...(rotatedAt === undefined ? {} : { rotatedAt }),
      },
      select: inviteSelect,
    }),
  writeJoin: async ({ actorId, conversationId, inviteCode, inviteId, member, systemValue }) => {
    return await prisma.$transaction(async (tx) => {
      // Both ceilings are re-checked here, not only in `resolveJoinBlock`. That
      // check reads a snapshot; two people tapping the same link at 31 members —
      // or on the last use of a `maxUses` link — both pass it and both write.
      // The transaction-scoped lock is shared with the admin add-member path.
      // Once acquired, this transaction sees every roster write that won before
      // it, so the count is authoritative rather than another racing snapshot.
      await serializeGroupMembershipWrite(tx, conversationId);
      const claimAt = new Date();

      const participants = await tx.dMParticipant.findMany({
        select: { nameColor: true, userId: true },
        where: { conversationId },
      });
      const existingParticipant = participants.some(
        (participant) => participant.userId === member.userId,
      );
      if (existingParticipant) {
        return false;
      }

      if (participants.length >= GROUP_DM_MAX_PARTICIPANTS) {
        const failure = JOIN_BLOCK_ERRORS.full;
        throw new ApiError(failure.message, failure.status, failure.code);
      }

      // One statement decides and increments. The field reference is what lets
      // `uses < maxUses` be a database comparison instead of a read the next
      // transaction can invalidate; a null ceiling means unlimited.
      const claimed = await tx.groupInvite.updateMany({
        data: { uses: { increment: 1 } },
        where: {
          code: inviteCode,
          enabled: true,
          id: inviteId,
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gte: claimAt } }] },
            { OR: [{ maxUses: null }, { uses: { lt: prisma.groupInvite.fields.maxUses } }] },
          ],
        },
      });

      if (claimed.count === 0) {
        const failure = JOIN_BLOCK_ERRORS.exhausted;
        throw new ApiError(failure.message, failure.status, failure.code);
      }

      await tx.dMParticipant.create({
        data: {
          conversationId,
          historyFromAt: member.historyFromAt,
          nameColor: pickNextMemberNameColor(
            participants
              .map((participant) => participant.nameColor)
              .filter((color): color is string => typeof color === "string"),
          ),
          role: member.role,
          userId: member.userId,
        },
      });

      await tx.dMMessage.create({
        data: {
          content: "",
          conversationId,
          systemTargetUserIds: [member.userId],
          systemType: "MEMBER_ADDED",
          // Separates "davetle katıldı" from "X seni ekledi" without a second
          // system type; the actor and the target are the same person here.
          systemValue,
          userId: actorId,
        },
      });

      // A system row still lifts the conversation up the inbox, but no unread
      // counter moves — same rule the other group writes follow.
      await tx.dMConversation.update({
        data: { lastMessageAt: new Date() },
        where: { id: conversationId },
      });

      return true;
    });
  },
};

function isMember(conversation: GroupInviteConversationRow, userId: string): boolean {
  return conversation.participants.some((participant) => participant.userId === userId);
}

async function requireConversation(
  conversationId: string,
  dependencies: GroupInviteDependencies,
): Promise<GroupInviteConversationRow> {
  const conversation = await dependencies.loadConversation(conversationId);

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  return conversation;
}

/**
 * The `editInfo` gate for the two write paths. Both the "is this a group" and
 * the "may you" question come from Faz 1's module; a non-participant fails
 * closed inside `toGroupAuthContext`.
 */
async function loadManageableConversation(
  actorId: string,
  conversationId: string,
  dependencies: GroupInviteDependencies,
): Promise<GroupInviteConversationRow> {
  const conversation = await requireConversation(conversationId, dependencies);
  const context = toGroupAuthContext(conversation, actorId);

  assertGroupConversation(context);
  assertGroupPermission(context, "editInfo");

  return conversation;
}

function toInviteDTO(
  invite: GroupInviteRow | null,
  dependencies: GroupInviteDependencies,
): GroupInviteDTO {
  const origin = dependencies.resolveOrigin();
  // E2. Off means the code never leaves the server — not "returned but greyed
  // out", because a greyed-out string is still a working link.
  const code = invite?.enabled ? invite.code : null;

  return {
    code,
    displayUrl: code ? buildGroupInviteDisplayUrl(origin.displayHost, code) : null,
    enabled: invite?.enabled ?? false,
    expiresAt: invite?.expiresAt?.toISOString() ?? null,
    maxUses: invite?.maxUses ?? null,
    rotatedAt: invite?.rotatedAt?.toISOString() ?? null,
    url: code ? buildGroupInviteUrl(origin.url, code) : null,
    uses: invite?.uses ?? 0,
  };
}

/**
 * B2. `editInfo`. The first switch-on mints the code (K2: a closed invite has no
 * code); switching off keeps the row so switching back on restores the same
 * link rather than killing every copy already pasted into a chat.
 */
export async function setGroupInviteEnabled(
  actorId: string,
  conversationId: string,
  enabled: boolean,
  dependencies: GroupInviteDependencies = defaults,
): Promise<GroupInviteDTO> {
  await loadManageableConversation(actorId, conversationId, dependencies);

  const existing = await dependencies.loadInviteByConversation(conversationId);
  const code = existing ? undefined : await dependencies.generateCode();
  const invite = await dependencies.upsertInvite({
    actorId,
    conversationId,
    enabled,
    ...(code === undefined ? {} : { code }),
  });

  return toInviteDTO(invite, dependencies);
}

/** B2. `editInfo`. New code, counter back to zero, old code dead immediately. */
export async function rotateGroupInvite(
  actorId: string,
  conversationId: string,
  dependencies: GroupInviteDependencies = defaults,
): Promise<GroupInviteDTO> {
  await loadManageableConversation(actorId, conversationId, dependencies);

  const invite = await dependencies.upsertInvite({
    actorId,
    code: await dependencies.generateCode(),
    conversationId,
    // Rotating is an act of sharing. Producing a fresh code nobody can use would
    // be a button that appears to do nothing.
    enabled: true,
    rotatedAt: dependencies.now(),
  });

  return toInviteDTO(invite, dependencies);
}

/**
 * The settings surface's read. Membership is the only gate: once an admin has
 * switched the link on, any member may copy it — `editInfo` governs *changing*
 * the link, not reading one that is already public by definition.
 */
export async function readGroupInvite(
  actorId: string,
  conversationId: string,
  dependencies: GroupInviteDependencies = defaults,
): Promise<GroupInviteDTO> {
  const conversation = await requireConversation(conversationId, dependencies);

  // Throws 403 for a non-participant, which is the whole membership check.
  assertGroupConversation(toGroupAuthContext(conversation, actorId));

  return toInviteDTO(await dependencies.loadInviteByConversation(conversationId), dependencies);
}

async function resolveJoinBlock(
  conversation: GroupInviteConversationRow,
  invite: GroupInviteRow,
  userId: string,
  dependencies: GroupInviteDependencies,
): Promise<GroupInviteJoinBlockReason | null> {
  const inviteBlock = resolveGroupInviteBlock(invite, dependencies.now());
  if (inviteBlock) {
    return inviteBlock;
  }

  if (conversation.participants.length >= GROUP_DM_MAX_PARTICIPANTS) {
    return "full";
  }

  // One query for the whole roster rather than one per member.
  const blocked = await dependencies.loadBlockedUserIds(
    userId,
    conversation.participants.map((participant) => participant.userId),
  );

  return blocked.size > 0 ? "blocked" : null;
}

function assertJoinableGroup(conversation: GroupInviteConversationRow): void {
  if (conversation.type !== "GROUP_DM") {
    throw new ApiError("This conversation is not a group", 400, "NOT_A_GROUP");
  }
}

/**
 * B2. Read-only, and deliberately not a conversation DTO: the caller is a
 * stranger to this group and the roster is exactly what they must not receive.
 *
 * Only an unknown code throws. Every other failure is a `reason` the page turns
 * into a sentence — one bodyless 403 would render the same "bir sorun oluştu"
 * for all eight branches.
 */
export async function previewGroupInvite(
  code: string,
  userId: string,
  dependencies: GroupInviteDependencies = defaults,
): Promise<GroupInvitePreviewDTO> {
  const found = await dependencies.loadInviteByCode(code);

  if (!found) {
    throw new ApiError("Invite not found", 404, "INVITE_NOT_FOUND");
  }

  const { conversation, invite } = found;
  assertJoinableGroup(conversation);

  const alreadyMember = isMember(conversation, userId);
  // Somebody already inside is never told the link is dead: they can open the
  // conversation whatever state the invite is in.
  const reason = alreadyMember
    ? null
    : await resolveJoinBlock(conversation, invite, userId, dependencies);

  return {
    alreadyMember,
    avatarColor: conversation.avatarColor,
    code: invite.code,
    iconUrl: conversation.iconUrl,
    joinable: reason === null,
    memberCount: conversation.participants.length,
    name: conversation.name,
    reason,
  };
}

const JOIN_BLOCK_ERRORS: Record<
  GroupInviteJoinBlockReason,
  { code: string; message: string; status: number }
> = {
  blocked: {
    code: "BLOCKED",
    message: "You cannot join this group while a block is active",
    status: 403,
  },
  disabled: { code: "INVITE_DISABLED", message: "This invite link is turned off", status: 403 },
  exhausted: {
    code: "INVITE_EXHAUSTED",
    message: "This invite has reached its usage limit",
    status: 410,
  },
  expired: { code: "INVITE_EXPIRED", message: "This invite has expired", status: 410 },
  full: { code: "GROUP_FULL", message: "This group is full", status: 409 },
};

/**
 * B2's eight branches, in order. Steps 1–4 are the invite row, 5 is a success,
 * 6–7 are the group, 8 is the write — and the write is one transaction, so a
 * membership row can never exist without its usage increment.
 */
export async function joinGroupViaInvite(
  code: string,
  userId: string,
  dependencies: GroupInviteDependencies = defaults,
): Promise<{ alreadyMember: boolean; conversation: DMConversationDTO }> {
  const found = await dependencies.loadInviteByCode(code);

  if (!found) {
    throw new ApiError("Invite not found", 404, "INVITE_NOT_FOUND");
  }

  const { conversation, invite } = found;
  assertJoinableGroup(conversation);

  // Step 5. Not an error: the link did its job, the person is where it pointed.
  if (isMember(conversation, userId)) {
    return {
      alreadyMember: true,
      conversation: await dependencies.loadConversationForViewer(conversation.id, userId),
    };
  }

  const blockReason = await resolveJoinBlock(conversation, invite, userId, dependencies);
  if (blockReason) {
    const failure = JOIN_BLOCK_ERRORS[blockReason];
    throw new ApiError(failure.message, failure.status, failure.code);
  }

  // One instant for the whole join, so the history floor and the membership row
  // cannot land a hair apart.
  const joinedAt = dependencies.now();

  const joined = await dependencies.writeJoin({
    actorId: userId,
    conversationId: conversation.id,
    inviteCode: invite.code,
    inviteId: invite.id,
    member: {
      historyFromAt: resolveHistoryFloor(conversation.historyVisibility, joinedAt),
      nameColor: pickNextMemberNameColor(
        conversation.participants
          .map((participant) => participant.nameColor)
          .filter((color): color is string => typeof color === "string"),
      ),
      role: "MEMBER",
      userId,
    },
    systemValue: "invite",
  });

  return {
    alreadyMember: !joined,
    conversation: await dependencies.loadConversationForViewer(conversation.id, userId),
  };
}
