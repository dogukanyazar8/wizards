import { BADGE_CATALOG, BADGE_IDS, resolveBadgeTier, type BadgeId } from "@wizards/types";

/**
 * The pure half of `scripts/backfill-badges.ts`: argument parsing, the streak
 * scan and the distribution report. Kept out of the script so it can be tested
 * without a database, the same split `totp-secret-backfill.ts` uses.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 500;

/**
 * A badge nearly everyone carries is decoration, not recognition. The script
 * only reports the fact — 00 §4 is the only place a threshold may change.
 */
export const BADGE_SATURATION_WARNING_RATIO = 0.6;

/** Badges the backfill can compute from history. The rest are derived or granted. */
export const BACKFILLABLE_BADGE_IDS: readonly BadgeId[] = [
  "inviter",
  "founder",
  "ideaShipped",
  "bugHunter",
  "streak",
  "regular",
  "voice",
  "broadcaster",
  "betaTester",
];

export type BadgeBackfillArgs = {
  /** Restrict the run to one badge; null means every backfillable badge. */
  badge: BadgeId | null;
  batchSize: number;
  /** Writing is opt-in: `--dry-run` is the default and `--commit` turns it off. */
  commit: boolean;
};

export function parseBadgeBackfillArgs(argv: readonly string[]): BadgeBackfillArgs {
  let badge: BadgeId | null = null;
  let batchSize = DEFAULT_BATCH_SIZE;
  let commit = false;

  for (const argument of argv) {
    if (argument === "--commit") {
      commit = true;
      continue;
    }

    if (argument === "--dry-run") {
      commit = false;
      continue;
    }

    if (argument.startsWith("--batch=")) {
      const parsed = Number.parseInt(argument.slice("--batch=".length), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --batch value: ${argument}`);
      }
      batchSize = parsed;
      continue;
    }

    if (argument.startsWith("--badge=")) {
      const value = argument.slice("--badge=".length);
      if (!(BADGE_IDS as readonly string[]).includes(value)) {
        throw new Error(`Unknown badge id: ${value}`);
      }
      if (!BACKFILLABLE_BADGE_IDS.includes(value as BadgeId)) {
        throw new Error(`Badge ${value} is not computed by the backfill`);
      }
      badge = value as BadgeId;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { badge, batchSize, commit };
}

function utcDayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * The longest run of consecutive active days plus the newest one. History only
 * ever yields a best-ever run, which is exactly what the tier should reflect;
 * `lastDay` seeds `lastCountedDay` so the live trigger continues from there.
 */
export function computeLongestActiveStreak(days: readonly Date[]): {
  current: number;
  longest: number;
  lastDay: Date | null;
} {
  const sorted = [...new Set(days.map((day) => utcDayStart(day).getTime()))].sort(
    (left, right) => left - right,
  );

  if (sorted.length === 0) {
    return { current: 0, lastDay: null, longest: 0 };
  }

  let longest = 1;
  let current = 1;

  for (let index = 1; index < sorted.length; index += 1) {
    const gap = ((sorted[index] as number) - (sorted[index - 1] as number)) / DAY_MS;
    current = gap === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
  }

  return { current, lastDay: new Date(sorted[sorted.length - 1] as number), longest };
}

export type BadgeBackfillFacts = {
  userId: string;
  /** `ServerInvite.uses` totals, self-invites already excluded. */
  acceptedInvites: number;
  /** Distinct UTC days with at least one message or DM. */
  messageDays: number;
  /** Newest message day, used to seed `lastCountedDay`. */
  lastMessageDay: Date | null;
  /** Every UTC day whose summed `appSeconds` cleared the active-day threshold. */
  activeDays: readonly Date[];
  voiceSeconds: number;
  screenShareSeconds: number;
  /** Members of the single largest server this account owns (00 §4). */
  largestOwnedServerMembers: number;
  resolvedBugReports: number;
  shippedIdeas: number;
  isBetaTester: boolean;
};

export type BadgeBackfillPlanEntry = {
  badge: BadgeId;
  value: number;
  tier: number;
  /** Seeds `UserBadgeProgress.lastCountedDay`; null for badges without days. */
  day: Date | null;
  streakDays: number;
};

/** Turns one user's history into the counter values the engine would hold. */
export function planBadgeBackfill(
  facts: BadgeBackfillFacts,
  only: BadgeId | null = null,
): BadgeBackfillPlanEntry[] {
  const streak = computeLongestActiveStreak(facts.activeDays);

  const candidates: BadgeBackfillPlanEntry[] = [
    { badge: "inviter", day: null, streakDays: 0, tier: 0, value: facts.acceptedInvites },
    {
      badge: "founder",
      day: null,
      streakDays: 0,
      tier: 0,
      value: facts.largestOwnedServerMembers,
    },
    { badge: "ideaShipped", day: null, streakDays: 0, tier: 0, value: facts.shippedIdeas },
    { badge: "bugHunter", day: null, streakDays: 0, tier: 0, value: facts.resolvedBugReports },
    {
      badge: "streak",
      day: streak.lastDay,
      streakDays: streak.current,
      tier: 0,
      value: streak.longest,
    },
    {
      badge: "regular",
      day: facts.lastMessageDay,
      streakDays: 0,
      tier: 0,
      value: facts.messageDays,
    },
    { badge: "voice", day: null, streakDays: 0, tier: 0, value: facts.voiceSeconds },
    {
      badge: "broadcaster",
      day: null,
      streakDays: 0,
      tier: 0,
      value: facts.screenShareSeconds,
    },
    {
      badge: "betaTester",
      day: null,
      streakDays: 0,
      tier: 0,
      value: facts.isBetaTester ? 1 : 0,
    },
  ];

  return candidates
    .filter((entry) => only === null || entry.badge === only)
    .map((entry) => ({ ...entry, tier: resolveBadgeTier(entry.badge, entry.value) }))
    .filter((entry) => entry.tier > 0);
}

export type BadgeDistribution = Map<BadgeId, number[]>;

export function recordBadgeDistribution(
  distribution: BadgeDistribution,
  entries: readonly BadgeBackfillPlanEntry[],
): BadgeDistribution {
  for (const entry of entries) {
    const tiers = distribution.get(entry.badge) ?? [];
    tiers[entry.tier - 1] = (tiers[entry.tier - 1] ?? 0) + 1;
    distribution.set(entry.badge, tiers);
  }

  return distribution;
}

function padRight(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

/**
 * The proof the catalog thresholds are worth anything: how many accounts each
 * badge and tier would land on.
 */
export function renderBadgeDistributionTable(
  distribution: BadgeDistribution,
  userCount: number,
): string {
  const header = `${padRight("badge", 14)}${padRight("tier", 6)}${padLeft("users", 8)}${padLeft("share", 9)}`;
  const lines = [header, "-".repeat(header.length)];

  for (const badge of BACKFILLABLE_BADGE_IDS) {
    const tiers = distribution.get(badge);
    if (!tiers) {
      continue;
    }

    let holders = 0;
    for (let index = 0; index < BADGE_CATALOG[badge].thresholds.length; index += 1) {
      const count = tiers[index] ?? 0;
      if (count === 0) {
        continue;
      }
      holders += count;
      const share = userCount === 0 ? 0 : (count / userCount) * 100;
      lines.push(
        `${padRight(badge, 14)}${padRight(String(index + 1), 6)}${padLeft(String(count), 8)}${padLeft(`${share.toFixed(1)}%`, 9)}`,
      );
    }

    if (userCount > 0 && holders / userCount > BADGE_SATURATION_WARNING_RATIO) {
      lines.push(
        `  ! ${badge} is on ${((holders / userCount) * 100).toFixed(1)}% of accounts — 00 §4 threshold needs review`,
      );
    }
  }

  if (lines.length === 2) {
    lines.push("(no badge would be awarded)");
  }

  lines.push("-".repeat(header.length));
  lines.push(`users scanned: ${userCount}`);

  return lines.join("\n");
}
