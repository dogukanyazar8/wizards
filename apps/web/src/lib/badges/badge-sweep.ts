import { prisma, type PrismaClient } from "@wizards/db";
import { BADGE_CATALOG, type BadgeId } from "@wizards/types";

import {
  advanceBadgeProgress as advanceBadgeProgressService,
  revokeBadges as revokeBadgesService,
  type BadgeStore,
} from "@/lib/badges/badge-service";
import { rollUpBadgeRarity as rollUpBadgeRarityService } from "@/lib/badges/badge-rarity";
import { logError } from "@/lib/logger";

/**
 * The periodic half of the badge engine. It rides the outbox worker's hourly
 * block because that block is the only scheduler this application has.
 *
 * It deliberately never walks the user table. Each of its three jobs enters
 * from a narrow side: existing `founder` rows plus server ownership, moderation
 * cases that changed since the last pass, and expiring `event` grants.
 */

/** 00 §4 cancellation matrix: what an actioned case takes away. */
export const BADGES_REVOKED_ON_MODERATION_ACTION: readonly BadgeId[] = [
  "inviter",
  "founder",
  "contributor",
  "verified",
];

export const MODERATION_REVOKE_REASON = "moderation:case-actioned";

/**
 * Marks a `founder` row closed because the server shrank rather than because
 * anybody misbehaved, which is what lets the sweep reopen it later without
 * touching a moderation revocation.
 */
export const FOUNDER_THRESHOLD_REVOKE_REASON = "founder:member-threshold-lost";

const FOUNDER_ENTRY_THRESHOLD = BADGE_CATALOG.founder.thresholds[0] as number;

export type BadgeSweepStore = BadgeStore & {
  moderationCase: Pick<PrismaClient["moderationCase"], "findMany">;
  server: Pick<PrismaClient["server"], "findMany">;
  userBadge: BadgeStore["userBadge"] & Pick<PrismaClient["userBadge"], "count">;
};

const defaultSweepStore = prisma as unknown as BadgeSweepStore;

export type BadgeSweepDependencies = {
  advanceProgress: typeof advanceBadgeProgressService;
  revokeBadges: typeof revokeBadgesService;
  /**
   * The rarity rollup runs on its own daily clock inside an hourly sweep, and it
   * reads through aggregates the sweep store deliberately does not expose — so
   * it enters as a dependency rather than as another store method (08 §4).
   */
  rollUpRarity: typeof rollUpBadgeRarityService;
};

const defaultDependencies: BadgeSweepDependencies = {
  advanceProgress: advanceBadgeProgressService,
  revokeBadges: revokeBadgesService,
  rollUpRarity: rollUpBadgeRarityService,
};

export type BadgeSweepResult = {
  founderUpdated: number;
  revoked: number;
  expired: number;
  /** False on the 23 hourly passes a day that skip the rarity rollup. */
  rarityComputed: boolean;
};

/**
 * `founder` is the one badge whose tier can fall (00 §4): the member count that
 * earned it is a live number, not an event that happened. Everything else is
 * "you did this once" and stays.
 */
async function sweepFounderBadges(
  now: Date,
  store: BadgeSweepStore,
  dependencies: BadgeSweepDependencies,
): Promise<number> {
  const holders = await store.userBadge.findMany({
    where: { badge: "founder" },
    select: { revokeReason: true, revokedAt: true, tier: true, userId: true },
  });
  const holderIds = holders.map((row) => row.userId);
  const qualifyingServers = await store.server.findMany({
    where: { memberCount: { gte: FOUNDER_ENTRY_THRESHOLD } },
    select: { memberCount: true, ownerId: true },
  });
  const holderServers =
    holderIds.length === 0
      ? []
      : await store.server.findMany({
          where: { ownerId: { in: holderIds } },
          select: { memberCount: true, ownerId: true },
        });

  // 00 §4: the threshold must be met by a single server, so the counts of the
  // servers somebody owns are compared, never summed.
  const largestOwnedServer = new Map<string, number>();
  for (const server of [...qualifyingServers, ...holderServers]) {
    const members = server.memberCount;
    if (members > (largestOwnedServer.get(server.ownerId) ?? 0)) {
      largestOwnedServer.set(server.ownerId, members);
    }
  }

  const holderById = new Map(holders.map((row) => [row.userId, row]));

  // Owners who could newly qualify, plus everyone who already holds the badge
  // and might have lost it. No other user is looked at.
  const candidates = new Set<string>(holderById.keys());
  for (const [ownerId, members] of largestOwnedServer) {
    if (members >= FOUNDER_ENTRY_THRESHOLD) {
      candidates.add(ownerId);
    }
  }

  let updated = 0;

  for (const userId of candidates) {
    const members = largestOwnedServer.get(userId) ?? 0;
    const holder = holderById.get(userId);

    // Reopen only what the sweep itself closed for shrinking; a moderation
    // revocation is not undone by growing a server back.
    if (
      holder?.revokedAt != null &&
      holder.revokeReason === FOUNDER_THRESHOLD_REVOKE_REASON &&
      members >= FOUNDER_ENTRY_THRESHOLD
    ) {
      await store.userBadge.updateMany({
        where: { badge: "founder", revokeReason: FOUNDER_THRESHOLD_REVOKE_REASON, userId },
        data: { revokeReason: null, revokedAt: null },
      });
    }

    const result = await dependencies.advanceProgress({
      amount: members,
      badge: "founder",
      mode: "set",
      now,
      store,
      userId,
    });

    if (result.tier === 0 && holder != null && holder.revokedAt === null) {
      await dependencies.revokeBadges({
        badges: ["founder"],
        now,
        reason: FOUNDER_THRESHOLD_REVOKE_REASON,
        store,
        userId,
      });
      updated += 1;
      continue;
    }

    if (result.tier !== result.previousTier) {
      updated += 1;
    }
  }

  return updated;
}

async function sweepModerationRevocations(
  now: Date,
  lastSweepAt: Date | undefined,
  store: BadgeSweepStore,
  dependencies: BadgeSweepDependencies,
): Promise<number> {
  const cases = await store.moderationCase.findMany({
    where: {
      status: "ACTIONED",
      subjectId: { not: null },
      ...(lastSweepAt ? { updatedAt: { gte: lastSweepAt } } : {}),
    },
    distinct: ["subjectId"],
    select: { subjectId: true },
  });

  const subjects = new Set<string>();
  for (const row of cases) {
    if (row.subjectId !== null) {
      subjects.add(row.subjectId);
    }
  }

  let revoked = 0;
  const verifiedRevocations =
    subjects.size === 0
      ? []
      : await store.userBadge.findMany({
          where: {
            badge: "verified",
            revokeReason: MODERATION_REVOKE_REASON,
            revokedAt: { not: null },
            userId: { in: [...subjects] },
          },
          select: { userId: true },
        });
  const verifiedAlreadyRevoked = new Set(verifiedRevocations.map((row) => row.userId));

  for (const userId of subjects) {
    // Derived `verified` uses an upsert marker. Rewriting that marker every
    // hour made an idempotent sweep report a fresh revocation forever.
    const badges = verifiedAlreadyRevoked.has(userId)
      ? BADGES_REVOKED_ON_MODERATION_ACTION.filter((badge) => badge !== "verified")
      : BADGES_REVOKED_ON_MODERATION_ACTION;
    revoked += await dependencies.revokeBadges({
      badges,
      now,
      reason: MODERATION_REVOKE_REASON,
      store,
      userId,
    });
  }

  return revoked;
}

/**
 * Expiry is a metric, not a mutation: `readUserBadges` already filters an
 * expired grant, so deleting or rewriting the row would only destroy the record
 * that the grant once existed.
 */
async function countExpiredEventBadges(now: Date, store: BadgeSweepStore): Promise<number> {
  return store.userBadge.count({
    where: { badge: "event", expiresAt: { lt: now }, revokedAt: null },
  });
}

export async function sweepBadges(
  args: { lastSweepAt?: Date; now?: Date; store?: BadgeSweepStore },
  /** Merged over the defaults so a caller can replace one job in isolation. */
  overrides: Partial<BadgeSweepDependencies> = {},
): Promise<BadgeSweepResult> {
  const now = args.now ?? new Date();
  const store = args.store ?? defaultSweepStore;
  const dependencies: BadgeSweepDependencies = { ...defaultDependencies, ...overrides };

  const founderUpdated = await sweepFounderBadges(now, store, dependencies);
  const revoked = await sweepModerationRevocations(now, args.lastSweepAt, store, dependencies);
  const expired = await countExpiredEventBadges(now, store);
  // Counting holders is the one aggregate in the badge system. It stays here,
  // behind a daily guard, so no request ever pays for it. A failure is swallowed
  // on purpose: rarity is decoration, and losing it must not cost the founder
  // recomputation or a moderation revocation that already ran above.
  let rarityComputed = false;

  try {
    rarityComputed = (await dependencies.rollUpRarity({ now })).computed;
  } catch (error) {
    logError("[badges] Rarity rollup failed", error);
  }

  return { expired, founderUpdated, rarityComputed, revoked };
}
