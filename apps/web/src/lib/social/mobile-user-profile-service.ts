import { prisma } from "@wizards/db";
import type {
  MobileFriendRelationship,
  MobileProfileBadge,
  MobileUserProfile,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { listDirectMessageMutualServers } from "@/lib/dm/service";
import { mapStoredPresenceStatus } from "@/lib/friends/service";
import { getMobileUserNote } from "@/lib/social/mobile-user-note-service";

/**
 * Accounts registered before this instant carry the "early member" badge. Kept
 * as one env-overridable constant so the badge stays deterministic per
 * deployment instead of drifting with wall-clock maths.
 */
export const MOBILE_PROFILE_EARLY_MEMBER_BEFORE =
  process.env.WHISPR_EARLY_MEMBER_BEFORE ?? "2026-01-01T00:00:00.000Z";

const MUTUAL_PREVIEW_LIMIT = 12;

const profileUserSelect = {
  avatarUrl: true,
  bannerColor: true,
  bannerOffsetX: true,
  bannerOffsetY: true,
  bannerUrl: true,
  bio: true,
  customStatus: true,
  customStatusEmoji: true,
  customStatusExpiresAt: true,
  deletedAt: true,
  displayName: true,
  id: true,
  premiumType: true,
  pronouns: true,
  registeredAt: true,
  status: true,
  username: true,
} as const;

export type MobileUserProfileInput = {
  requesterId: string;
  serverId?: string | undefined;
  userId: string;
};

export type MobileUserProfileServiceDependencies = {
  getNote: typeof getMobileUserNote;
  listMutualServers: typeof listDirectMessageMutualServers;
};

const defaultDependencies: MobileUserProfileServiceDependencies = {
  getNote: getMobileUserNote,
  listMutualServers: listDirectMessageMutualServers,
};

/** Highest-precedence relationship wins when a pair carries several request rows. */
const RELATIONSHIP_PRECEDENCE: Record<MobileFriendRelationship, number> = {
  none: 0,
  outgoing: 1,
  incoming: 2,
  friend: 3,
  blocked: 4,
};

type RelationshipState = {
  blocked: boolean;
  blockedBy: boolean;
  relationship: MobileFriendRelationship;
};

export function resolveMobileProfileRelationship(
  requesterId: string,
  rows: readonly { receiverId: string; senderId: string; status: string }[],
): RelationshipState {
  let relationship: MobileFriendRelationship = "none";
  let blocked = false;
  let blockedBy = false;

  for (const row of rows) {
    if (row.status === "BLOCKED") {
      // A block row is directional: the sender is the one who blocked.
      if (row.senderId === requesterId) {
        blocked = true;
      } else {
        blockedBy = true;
      }
    }

    const candidate: MobileFriendRelationship =
      row.status === "BLOCKED"
        ? "blocked"
        : row.status === "ACCEPTED"
          ? "friend"
          : row.status === "PENDING"
            ? row.senderId === requesterId
              ? "outgoing"
              : "incoming"
            : "none";

    if (RELATIONSHIP_PRECEDENCE[candidate] > RELATIONSHIP_PRECEDENCE[relationship]) {
      relationship = candidate;
    }
  }

  return { blocked, blockedBy, relationship };
}

export function deriveMobileProfileBadges(input: {
  premiumType: string;
  registeredAt: Date;
  usedInviteCount: number;
}): MobileProfileBadge[] {
  const badges: MobileProfileBadge[] = [];
  if (input.registeredAt.getTime() < Date.parse(MOBILE_PROFILE_EARLY_MEMBER_BEFORE)) {
    badges.push("earlyMember");
  }

  if (input.premiumType !== "NONE") {
    badges.push("supporter");
  }

  if (input.usedInviteCount > 0) {
    badges.push("inviter");
  }

  return badges;
}

/** Expired custom statuses are treated as absent on read; no write-side sweep is needed. */
export function readActiveCustomStatus(
  customStatus: string | null,
  expiresAt: Date | null,
  now: Date = new Date(),
): string | null {
  if (!customStatus) {
    return null;
  }

  return expiresAt && expiresAt.getTime() <= now.getTime() ? null : customStatus;
}

/**
 * Handoff 1b draws an offline user as "Çevrimdışı" and nothing else, so an
 * offline row carries no status message. That rendering rule is also the one
 * that keeps "Görünmez" private: INVISIBLE is stored, published as OFFLINE, and
 * would otherwise still ship the custom status the user set while online —
 * which is exactly the signal invisibility is meant to withhold. Cropping it
 * here means no caller can leak it by forgetting to check the status.
 */
export function readProfilePresence(
  user: {
    customStatus: string | null;
    customStatusEmoji: string | null;
    customStatusExpiresAt: Date | null;
    status: string;
  },
  now: Date = new Date(),
): MobileUserProfile["presence"] {
  const status = mapStoredPresenceStatus(user.status);
  const customStatus =
    status === "OFFLINE"
      ? null
      : readActiveCustomStatus(user.customStatus, user.customStatusExpiresAt, now);

  return {
    customStatus,
    // The emoji only ever renders next to the message, so it follows it exactly.
    customStatusEmoji: customStatus === null ? null : user.customStatusEmoji,
    status,
  };
}

async function listAcceptedFriendIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.friendRequest.findMany({
    select: { receiverId: true, senderId: true },
    where: {
      status: "ACCEPTED",
      OR: [{ receiverId: userId }, { senderId: userId }],
    },
  });

  return new Set(rows.map((row) => (row.senderId === userId ? row.receiverId : row.senderId)));
}

/** Total shared servers behind the capped preview; one indexed count, no rows read. */
async function countMutualServers(requesterId: string, userId: string): Promise<number> {
  if (requesterId === userId) {
    return 0;
  }

  return prisma.serverMember.count({
    where: {
      pending: false,
      server: { members: { some: { pending: false, userId } } },
      userId: requesterId,
    },
  });
}

async function getMutualFriends(requesterId: string, userId: string) {
  if (requesterId === userId) {
    return { count: 0, preview: [] };
  }

  const [requesterFriends, subjectFriends] = await Promise.all([
    listAcceptedFriendIds(requesterId),
    listAcceptedFriendIds(userId),
  ]);
  const mutualIds = [...requesterFriends].filter((id) => subjectFriends.has(id));
  if (mutualIds.length === 0) {
    return { count: 0, preview: [] };
  }

  const preview = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: { avatarUrl: true, displayName: true, id: true, username: true },
    take: MUTUAL_PREVIEW_LIMIT,
    where: { deletedAt: null, id: { in: mutualIds } },
  });

  return { count: mutualIds.length, preview };
}

async function getServerContext(input: {
  requesterId: string;
  serverId: string;
  userId: string;
}): Promise<MobileUserProfile["serverContext"]> {
  const [server, memberships] = await Promise.all([
    prisma.server.findUnique({
      select: { id: true, name: true },
      where: { id: input.serverId },
    }),
    prisma.serverMember.findMany({
      select: {
        joinedAt: true,
        roles: {
          select: { role: { select: { color: true, id: true, name: true, position: true } } },
        },
        userId: true,
      },
      take: 2,
      where: {
        pending: false,
        serverId: input.serverId,
        userId: { in: [input.requesterId, input.userId] },
      },
    }),
  ]);

  const viewerMembership = memberships.find((entry) => entry.userId === input.requesterId);
  const subjectMembership = memberships.find((entry) => entry.userId === input.userId);
  // Role chips are a member-visible fact: the viewer has to be in the server too.
  if (!server || !viewerMembership || !subjectMembership) {
    return null;
  }

  return {
    joinedAt: subjectMembership.joinedAt.toISOString(),
    roles: subjectMembership.roles
      .map((entry) => entry.role)
      .sort((left, right) => right.position - left.position)
      .map((role) => ({ color: role.color, id: role.id, name: role.name })),
    serverId: server.id,
    serverName: server.name,
  };
}

/**
 * One read for the quick card (11b) and the full page (11c). Everything the
 * viewer is not allowed to see is cropped here, not in the client.
 */
export async function getMobileUserProfile(
  input: MobileUserProfileInput,
  dependencies: MobileUserProfileServiceDependencies = defaultDependencies,
): Promise<MobileUserProfile> {
  const user = await prisma.user.findUnique({
    select: profileUserSelect,
    where: { id: input.userId },
  });

  if (!user || user.deletedAt) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  const self = input.requesterId === input.userId;
  const relationRows = self
    ? []
    : await prisma.friendRequest.findMany({
        select: { receiverId: true, senderId: true, status: true },
        where: {
          OR: [
            { receiverId: input.userId, senderId: input.requesterId },
            { receiverId: input.requesterId, senderId: input.userId },
          ],
        },
      });
  const { blocked, blockedBy, relationship } = resolveMobileProfileRelationship(
    input.requesterId,
    relationRows,
  );
  const identity = {
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    id: user.id,
    username: user.username,
  };

  // A block in either direction reduces the payload to identity: the card shows
  // its restricted view and there is nothing else the viewer may read.
  if (blocked || blockedBy) {
    return {
      badges: [],
      bannerColor: null,
      bannerOffsetX: null,
      bannerOffsetY: null,
      bannerUrl: null,
      bio: null,
      blocked,
      blockedBy,
      mutualFriends: { count: 0, preview: [] },
      mutualServers: { count: 0, preview: [] },
      note: null,
      presence: { customStatus: null, customStatusEmoji: null, status: "OFFLINE" },
      pronouns: null,
      registeredAt: user.registeredAt.toISOString(),
      relationship,
      self: false,
      serverContext: null,
      user: identity,
    };
  }

  const isFriend = self || relationship === "friend";
  const [mutualServers, mutualServerCount, mutualFriends, usedInviteCount, serverContext, note] =
    await Promise.all([
      dependencies.listMutualServers(input.requesterId, input.userId, {
        limit: MUTUAL_PREVIEW_LIMIT,
      }),
      // The preview is capped at 12; the 1c header shows the real total, so it
      // cannot be inferred from the preview length.
      countMutualServers(input.requesterId, input.userId),
      getMutualFriends(input.requesterId, input.userId),
      prisma.serverInvite.count({ where: { createdById: input.userId, uses: { gt: 0 } } }),
      input.serverId
        ? getServerContext({
            requesterId: input.requesterId,
            serverId: input.serverId,
            userId: input.userId,
          })
        : Promise.resolve(null),
      // Your own card has nobody to keep a private note about, so it never asks.
      self
        ? Promise.resolve(null)
        : dependencies.getNote({ authorId: input.requesterId, subjectId: input.userId }),
    ]);

  return {
    badges: deriveMobileProfileBadges({
      premiumType: user.premiumType,
      registeredAt: user.registeredAt,
      usedInviteCount,
    }),
    // README 1b: a personal banner is a friends-only detail; everyone else gets
    // the neutral fallback the client draws from tokens.
    bannerColor: isFriend ? user.bannerColor : null,
    bannerOffsetX: isFriend ? user.bannerOffsetX : null,
    bannerOffsetY: isFriend ? user.bannerOffsetY : null,
    bannerUrl: isFriend ? user.bannerUrl : null,
    bio: user.bio,
    blocked: false,
    blockedBy: false,
    mutualFriends,
    mutualServers: { count: mutualServerCount, preview: mutualServers },
    // The viewer's own writing about this person. It is never sent to the person
    // it is about; a blocked pair returned above and carries no note either.
    note,
    presence: readProfilePresence(user),
    pronouns: user.pronouns,
    registeredAt: user.registeredAt.toISOString(),
    relationship,
    self,
    serverContext,
    user: identity,
  };
}

export async function createMobileUserReport(input: {
  details: string | null;
  reason: "HARASSMENT" | "IMPERSONATION" | "INAPPROPRIATE" | "OTHER" | "SPAM";
  reporterId: string;
  subjectId: string;
}): Promise<{ reportId: string }> {
  if (input.reporterId === input.subjectId) {
    throw new ApiError("Cannot report yourself", 400, "SELF_REPORT");
  }

  const subject = await prisma.user.findUnique({
    select: { id: true },
    where: { id: input.subjectId },
  });
  if (!subject) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  const report = await prisma.userReport.create({
    data: {
      details: input.details,
      reason: input.reason,
      reporterId: input.reporterId,
      subjectId: input.subjectId,
    },
    select: { id: true },
  });

  return { reportId: report.id };
}
