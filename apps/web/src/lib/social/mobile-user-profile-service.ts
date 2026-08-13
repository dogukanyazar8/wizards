import { prisma, type PremiumType } from "@wizards/db";
import type {
  MobileFriendRelationship,
  MobileProfileBadge,
  MobileUserProfile,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import { deriveBadges } from "@/lib/badges/badge-service";
import { listDirectMessageMutualServers } from "@/lib/dm/service";
import { mapStoredPresenceStatus } from "@/lib/friends/service";
import { readPresenceMap, type VisiblePresenceStatus } from "@/lib/presence";
import { getRedis } from "@/lib/redis";
import { evaluateVisibilityPolicy } from "@/lib/privacy/visibility-policy";
import { getMobileUserNote } from "@/lib/social/mobile-user-note-service";
import {
  attachReportToCaseInTransaction,
  type ModerationCaseStore,
} from "@/lib/moderation/case-service";
import { captureEvidenceForReport, type EvidenceStore } from "@/lib/moderation/evidence-service";

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
  /**
   * The stored badge rows ride along with the user row the profile read already
   * does, which is how `inviter` stopped costing its own invite count query.
   */
  badges: {
    select: { badge: true, revokedAt: true },
  },
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
  settings: { select: { presenceVisibility: true, profileVisibility: true } },
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
  /** Live presence for one peer, or null when Redis knows nothing about them. */
  readLivePresence: (userId: string) => Promise<{ status: VisiblePresenceStatus } | null>;
};

const defaultDependencies: MobileUserProfileServiceDependencies = {
  getNote: getMobileUserNote,
  listMutualServers: listDirectMessageMutualServers,
  readLivePresence: async (userId) => {
    // The same read the friends list and the DM inventory do, so every surface
    // in the app answers "is this person online" from one source.
    const presence = await readPresenceMap(getRedis(), [
      { customStatus: null, status: "OFFLINE", userId },
    ]);

    return presence.get(userId) ?? null;
  },
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

/**
 * The three ids a 0.8.x client can parse, in the order it already draws them.
 *
 * `docs/prompts/rozet-sistemi/00-ortak-baglam.md` §2 ("Uyumluluk kısıtı") froze
 * this field: `MobileUserProfileSchema` is `.strict()`, the mobile client parses
 * it, OTA is off and 0.8.15 installs are still in the field — so a fourth id
 * here would fail the parse and the profile card would never open. The badge
 * engine below is the new one; its answer is narrowed to these three. The rich
 * list lives on `/badges`.
 *
 * Removal procedure (08 §5), in this order and not before:
 *
 * 1. Condition: the admin analytics module reports zero mobile sessions below
 *    `LEGACY_MOBILE_APP_VERSION` in the last 30 days
 *    (`@/lib/admin/analytics/legacy-clients`, "Eski mobil istemciler" card).
 * 2. `packages/types/src/mobile-social.ts`: drop the `badges` field and
 *    `MobileProfileBadgeSchema`.
 * 3. This file: drop the narrowing block and `deriveMobileProfileBadges`.
 * 4. `mobile-user-profile-service.test.ts`: drop the compatibility guard test.
 * 5. Confirm no mobile client still reads the field (W2 already cut it).
 *
 * Doing this early does not degrade an old client's card — it stops the card
 * from opening at all, because the parse fails before anything renders.
 */
const FROZEN_PROFILE_BADGES = ["earlyMember", "supporter", "inviter"] as const;

export function deriveMobileProfileBadges(input: {
  premiumType: PremiumType;
  registeredAt: Date;
  /** Stored (AWARDED/GRANTED) badge ids — `inviter` is a row now, not a count. */
  storedBadgeIds?: readonly string[];
  suppressedBadgeIds?: readonly string[];
}): MobileProfileBadge[] {
  const stored = new Set(input.storedBadgeIds ?? []);
  const suppressed = new Set(input.suppressedBadgeIds ?? []);
  const derived = new Set(
    deriveBadges({
      // Of the three ids that survive the narrowing below, `earlyMember` and
      // `supporter` depend only on the two facts this function is given.
      // `staff` and `verified` are pinned off rather than read, so the profile
      // query never has to select columns the frozen field cannot carry.
      adminRole: null,
      emailVerified: false,
      hasActionedModerationCase: false,
      premiumSince: null,
      premiumType: input.premiumType,
      registeredAt: input.registeredAt,
      twoFactorEnabled: false,
    }).map((badge) => badge.id),
  );

  return FROZEN_PROFILE_BADGES.filter(
    (id) => !suppressed.has(id) && (derived.has(id) || stored.has(id)),
  );
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
/**
 * `User.status` is the presence the account *chose*, not whether it is reachable:
 * nothing clears it when the app closes, so a peer read straight off the column
 * reported everyone who had ever been online as still online. Redis is the live
 * source — `readPresenceMap` only reports a status while a socket is registered,
 * and reports OFFLINE otherwise — so peers read that, and the absence of a
 * record is itself an offline answer.
 *
 * Your own card keeps the stored value. It is the presence you picked (including
 * "Görünmez", which `mapStoredPresenceStatus` still publishes as OFFLINE), and
 * the status row on your own card is the control that changes it.
 */
export function resolveMobileProfilePresenceStatus(input: {
  livePresence: { status: VisiblePresenceStatus } | null;
  self: boolean;
  storedStatus: string;
}): string {
  if (input.self) {
    return input.storedStatus;
  }

  return input.livePresence?.status ?? "OFFLINE";
}

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

  const connectedTo = (peerId: string) => ({
    OR: [
      { friendRequestsSent: { some: { receiverId: peerId, status: "ACCEPTED" as const } } },
      { friendRequestsReceived: { some: { senderId: peerId, status: "ACCEPTED" as const } } },
    ],
  });
  const where = {
    AND: [connectedTo(requesterId), connectedTo(userId)],
    deletedAt: null,
    id: { notIn: [requesterId, userId] },
  };
  // The old implementation loaded both full friend lists into Node. Let
  // PostgreSQL intersect the indexed relations, returning only the preview and
  // its scalar total.
  const [count, preview] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      orderBy: { username: "asc" },
      select: { avatarUrl: true, displayName: true, id: true, username: true },
      take: MUTUAL_PREVIEW_LIMIT,
      where,
    }),
  ]);

  return { count, preview };
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
      registeredAt: "1970-01-01T00:00:00.000Z",
      relationship,
      self: false,
      serverContext: null,
      user: identity,
    };
  }

  const isFriend = self || relationship === "friend";
  const visibility = evaluateVisibilityPolicy({
    blocked: false,
    isFriend,
    presenceVisibility: user.settings?.presenceVisibility ?? "EVERYONE",
    profileVisibility: user.settings?.profileVisibility ?? "EVERYONE",
    self,
  });
  if (!visibility.canViewProfile) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }
  const [mutualServers, mutualServerCount, mutualFriends, serverContext, note, livePresence] =
    await Promise.all([
      dependencies.listMutualServers(input.requesterId, input.userId, {
        limit: MUTUAL_PREVIEW_LIMIT,
      }),
      // The preview is capped at 12; the 1c header shows the real total, so it
      // cannot be inferred from the preview length.
      countMutualServers(input.requesterId, input.userId),
      getMutualFriends(input.requesterId, input.userId),
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
      // Your own presence is the one you set, so it is read off the row, not off
      // the socket registry.
      self || !visibility.canViewPresence
        ? Promise.resolve(null)
        : dependencies.readLivePresence(input.userId),
    ]);

  return {
    badges: deriveMobileProfileBadges({
      premiumType: user.premiumType,
      registeredAt: user.registeredAt,
      storedBadgeIds: user.badges.filter((row) => row.revokedAt === null).map((row) => row.badge),
      suppressedBadgeIds: user.badges
        .filter((row) => row.revokedAt !== null)
        .map((row) => row.badge),
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
    presence: readProfilePresence({
      ...user,
      status: visibility.canViewPresence
        ? resolveMobileProfilePresenceStatus({ livePresence, self, storedStatus: user.status })
        : "OFFLINE",
    }),
    pronouns: user.pronouns,
    registeredAt: user.registeredAt.toISOString(),
    relationship,
    self,
    serverContext,
    user: identity,
  };
}

export async function createMobileUserReport(input: {
  /** Optional evidence pointers; each one is access-checked before capture. */
  attachmentId?: string | undefined;
  details: string | null;
  dmMessageId?: string | undefined;
  messageId?: string | undefined;
  reason: "HARASSMENT" | "IMPERSONATION" | "INAPPROPRIATE" | "OTHER" | "SPAM";
  reporterId: string;
  subjectId: string;
}): Promise<{ reportId: string }> {
  if (input.reporterId === input.subjectId) {
    throw new ApiError("Cannot report yourself", 400, "SELF_REPORT");
  }

  return prisma.$transaction(async (transaction) => {
    const subject = await transaction.user.findUnique({
      select: { id: true },
      where: { id: input.subjectId },
    });
    if (!subject) {
      throw new ApiError("User not found", 404, "USER_NOT_FOUND");
    }

    const report = await transaction.userReport.create({
      data: {
        details: input.details,
        reason: input.reason,
        reporterId: input.reporterId,
        subjectId: input.subjectId,
      },
      select: { id: true },
    });

    const attached = await attachReportToCaseInTransaction(
      transaction as unknown as ModerationCaseStore,
      {
        id: report.id,
        reason: input.reason,
        subjectId: input.subjectId,
      },
    );

    // Evidence is best effort and access-checked inside the capture: a pointer
    // the reporter cannot see is dropped, never the report itself.
    await captureEvidenceForReport(
      {
        ...(input.attachmentId ? { attachmentId: input.attachmentId } : {}),
        caseId: attached.caseId,
        ...(input.dmMessageId ? { dmMessageId: input.dmMessageId } : {}),
        ...(input.messageId ? { messageId: input.messageId } : {}),
        reportId: report.id,
        reporterId: input.reporterId,
      },
      transaction as unknown as EvidenceStore,
    );

    return { reportId: report.id };
  });
}
