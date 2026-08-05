import { prisma, type PrismaClient } from "@wizards/db";
import {
  BADGE_CATALOG,
  BadgeRarityResponseSchema,
  type BadgeId,
  type BadgeRarityEntry,
  type BadgeRarityResponse,
} from "@wizards/types";

import { logError } from "@/lib/logger";
import { getRedisOp } from "@/lib/redis";

/**
 * "%N kullanıcıda" needs a count, and a count is an aggregate — the one thing
 * the read path is not allowed to run (00 §3). So it is computed once a day by
 * the sweep and served from a cached summary that never touches the badge
 * tables on a request.
 *
 * Storage note (08 §4 asks for a single-row summary and forbids a new model):
 * neither named table fits. `FeatureFlag` has no payload field beyond a 280
 * character description and an integer percent, and `ClientHealthDailySummary`
 * is keyed by a closed `ClientHealthKind` enum that a badge rollup would have to
 * lie its way into. The summary therefore lives in Redis — the cache both the
 * presence layer and the rate limiter already share — under one key with a
 * one-day lifetime. Losing it costs nothing: an unavailable summary hides the
 * percentages, which is the same thing a small population does.
 */

export const BADGE_RARITY_CACHE_KEY = "badge:rarity:v1";

/** A day of cadence plus an hour of slack, so a skipped sweep still serves. */
export const BADGE_RARITY_TTL_SECONDS = 25 * 60 * 60;

const ROLLUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Accounts the percentages are measured against: not banned, not deleted. A
 * denominator that counted removed accounts would make every badge look rarer
 * than it is, and the number would only ever drift further.
 */
const ACTIVE_USER_FILTER = { deletedAt: null, isBanned: false } as const;

export type BadgeRarityStore = {
  user: Pick<PrismaClient["user"], "count">;
  userBadge: Pick<PrismaClient["userBadge"], "groupBy">;
};

const defaultStore: BadgeRarityStore = prisma;

export type BadgeRarityCache = {
  read: () => Promise<string | null>;
  write: (payload: string, ttlSeconds: number) => Promise<void>;
};

const defaultCache: BadgeRarityCache = {
  read: () => getRedisOp().get(BADGE_RARITY_CACHE_KEY),
  write: async (payload, ttlSeconds) => {
    await getRedisOp().set(BADGE_RARITY_CACHE_KEY, payload, "EX", ttlSeconds);
  },
};

const EMPTY_SUMMARY: BadgeRarityResponse = { badges: [], computedAt: null, totalUsers: 0 };

function toBadgeId(value: string): BadgeId | null {
  return value in BADGE_CATALOG ? (value as BadgeId) : null;
}

function parseSummary(payload: string | null): BadgeRarityResponse | null {
  if (payload === null) {
    return null;
  }

  try {
    return BadgeRarityResponseSchema.parse(JSON.parse(payload));
  } catch (error) {
    // A summary written by an older shape is not worth a failed request; the
    // next sweep overwrites it.
    logError("[badges] Discarding unreadable rarity summary", error);
    return null;
  }
}

export type ReadBadgeRarityArgs = {
  cache?: BadgeRarityCache;
};

/**
 * The read path for `GET /api/v1/badges/rarity`. One cache read, no database
 * access at all, and an empty summary when nothing has been computed yet.
 */
export async function readBadgeRarity(
  args: ReadBadgeRarityArgs = {},
): Promise<BadgeRarityResponse> {
  const cache = args.cache ?? defaultCache;

  try {
    return parseSummary(await cache.read()) ?? EMPTY_SUMMARY;
  } catch (error) {
    // Rarity is decoration. If the cache is unreachable the badge detail simply
    // shows no percentage, exactly as it does below the population floor.
    logError("[badges] Rarity summary read failed", error);
    return EMPTY_SUMMARY;
  }
}

export type ComputeBadgeRarityArgs = {
  now?: Date;
  store?: BadgeRarityStore;
};

/**
 * Counts holders per badge. Tiers are collapsed: rarity answers "how many people
 * have this badge", and a tier-2 holder holds the badge (00 §4 keeps the tier
 * inside the chip, not beside it).
 */
export async function computeBadgeRarity(
  args: ComputeBadgeRarityArgs = {},
): Promise<BadgeRarityResponse> {
  const store = args.store ?? defaultStore;
  const now = args.now ?? new Date();

  const [totalUsers, groups] = await Promise.all([
    store.user.count({ where: ACTIVE_USER_FILTER }),
    store.userBadge.groupBy({
      by: ["badge", "tier"],
      where: {
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        tier: { gte: 1 },
        user: ACTIVE_USER_FILTER,
      },
      _count: { _all: true },
    }),
  ]);

  const holdersByBadge = new Map<BadgeId, number>();

  for (const group of groups) {
    const id = toBadgeId(group.badge);
    if (id === null) {
      continue;
    }

    holdersByBadge.set(id, (holdersByBadge.get(id) ?? 0) + group._count._all);
  }

  const badges: BadgeRarityEntry[] = [...holdersByBadge.entries()].map(([id, holders]) => ({
    holders,
    id,
  }));
  badges.sort((left, right) => (left.id < right.id ? -1 : 1));

  return BadgeRarityResponseSchema.parse({
    badges,
    computedAt: now.toISOString(),
    totalUsers,
  });
}

export type RollUpBadgeRarityArgs = {
  now?: Date;
  store?: BadgeRarityStore;
  cache?: BadgeRarityCache;
};

export type BadgeRarityRollupResult = {
  /** False when a summary computed less than a day ago was still valid. */
  computed: boolean;
  totalUsers: number;
};

/**
 * The daily half of the hourly sweep. The cached `computedAt` is the only clock
 * it needs: no extra table, and a restarted process cannot make it run twice.
 */
export async function rollUpBadgeRarity(
  args: RollUpBadgeRarityArgs = {},
): Promise<BadgeRarityRollupResult> {
  const cache = args.cache ?? defaultCache;
  const now = args.now ?? new Date();
  const existing = parseSummary(await cache.read());

  if (existing?.computedAt != null) {
    const age = now.getTime() - new Date(existing.computedAt).getTime();

    if (age >= 0 && age < ROLLUP_INTERVAL_MS) {
      return { computed: false, totalUsers: existing.totalUsers };
    }
  }

  const summary = await computeBadgeRarity({ now, ...(args.store ? { store: args.store } : {}) });
  await cache.write(JSON.stringify(summary), BADGE_RARITY_TTL_SECONDS);

  return { computed: true, totalUsers: summary.totalUsers };
}
