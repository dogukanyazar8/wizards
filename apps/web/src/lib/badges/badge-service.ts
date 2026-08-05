import { prisma, type AdminRole, type PremiumType, type PrismaClient } from "@wizards/db";
import {
  BADGE_CATALOG,
  nextBadgeThreshold,
  resolveBadgeTier,
  sortBadges,
  type BadgeId,
  type BadgeProgress,
  type EarnedBadge,
} from "@wizards/types";

import { normalizeAppLocale, translate } from "@/lib/locale";
import { logError } from "@/lib/logger";
import { sendMobilePushForNotifications } from "@/lib/mobile/push-sender";
import { getSocketServer } from "@/lib/socket/runtime";
import { serializeWorkspaceNotification } from "@/lib/workspace/workspace-events";

/**
 * The badge engine. Three layers, one module:
 *
 * - DERIVED badges (`deriveBadges`) are recomputed from the `User` row on every
 *   read and keep no storage of their own.
 * - AWARDED badges are counted by `advanceBadgeProgress`, which the event
 *   triggers and the hourly sweep call.
 * - GRANTED badges are written by an admin path (prompt 08) into the same table.
 *
 * `docs/prompts/rozet-sistemi/00-ortak-baglam.md` §3 fixes two invariants this
 * module exists to protect: the read path never runs an aggregate query, and
 * `UserDailyMetric` is never touched here — the counters live in
 * `UserBadgeProgress` precisely so a profile open costs two indexed reads.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A day only counts as active once, so the trigger threshold lives here. */
export const BADGE_ACTIVE_DAY_MIN_SECONDS = 60;

/**
 * Same env var `mobile-user-profile-service.ts` reads, so the legacy frozen
 * `badges` field and this engine can never disagree about who was early. It is
 * duplicated rather than imported because that module pulls Redis, DM and
 * moderation code a badge read has no business loading.
 */
export const BADGE_EARLY_MEMBER_BEFORE =
  process.env.WHISPR_EARLY_MEMBER_BEFORE ?? "2026-01-01T00:00:00.000Z";

/** An `ANALYST` sees numbers, not people; 00 §4 keeps them off the staff badge. */
const STAFF_EXCLUDED_ADMIN_ROLE: AdminRole = "ANALYST";

const badgeUserSelect = {
  adminMembership: { select: { role: true } },
  deletedAt: true,
  emailVerified: true,
  isBanned: true,
  premiumSince: true,
  premiumType: true,
  registeredAt: true,
  twoFactorEnabled: true,
} as const;

/**
 * 02 §1 specifies `userBadge` and `userBadgeProgress`. `user` is here because
 * the same prompt requires `readUserBadges` to merge derived badges and to
 * return nothing for a banned or deleted account — both need the `User` row,
 * and reading it through the store keeps the function testable without a DB.
 */
export type BadgeStore = {
  $transaction<T>(
    operation: (transaction: BadgeStore) => Promise<T>,
    options?: { isolationLevel: "Serializable" },
  ): Promise<T>;
  notification: Pick<PrismaClient["notification"], "create">;
  user: Pick<PrismaClient["user"], "findUnique">;
  userBadge: Pick<PrismaClient["userBadge"], "findMany" | "upsert" | "updateMany">;
  userBadgeProgress: Pick<PrismaClient["userBadgeProgress"], "findUnique" | "upsert" | "findMany">;
};

const defaultStore = prisma as unknown as BadgeStore;

const BADGE_TRANSACTION_MAX_ATTEMPTS = 3;

function isSerializableConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  );
}

export async function runBadgeTransaction<T>(
  store: BadgeStore,
  operation: (transaction: BadgeStore) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= BADGE_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await store.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === BADGE_TRANSACTION_MAX_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new Error("Badge transaction retry loop exhausted");
}

/**
 * How a written badge notification reaches the open app. Split out of the store
 * for the same reason `feedback-service.ts` splits it: the row is a database
 * write, the socket push is not, and a test must be able to observe both
 * without a server (00 §2, DI zorunlu).
 */
export type BadgeNotificationDependencies = {
  emitSocket: (userId: string, payload: ReturnType<typeof serializeWorkspaceNotification>) => void;
  sendPush: typeof sendMobilePushForNotifications;
};

const defaultNotificationDependencies: BadgeNotificationDependencies = {
  emitSocket(userId, payload) {
    getSocketServer()?.to(`user:${userId}`).emit("notification:new", payload);
  },
  sendPush: sendMobilePushForNotifications,
};

/**
 * Where a BADGE notification lands on both platforms: the "Rozetlerim" screen
 * on mobile (`settings/:section`) and the badges panel of web settings.
 */
export const BADGE_NOTIFICATION_ACTION_PATH = "/settings/badges";

function toIsoString(value: Date): string {
  return value.toISOString();
}

function utcDayStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function toBadgeId(value: string): BadgeId | null {
  return value in BADGE_CATALOG ? (value as BadgeId) : null;
}

function badgeSource(badge: BadgeId) {
  const { layer } = BADGE_CATALOG[badge];

  return layer === "derived" ? "DERIVED" : layer === "granted" ? "GRANTED" : "AWARDED";
}

function earned(id: BadgeId, tier: number, earnedAt: Date): EarnedBadge {
  return { earnedAt: toIsoString(earnedAt), expiresAt: null, id, tier };
}

export type DeriveBadgesInput = {
  registeredAt: Date;
  premiumType: PremiumType;
  premiumSince: Date | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  adminRole: AdminRole | null;
  hasActionedModerationCase: boolean;
  now?: Date;
};

/**
 * DERIVED layer — computed from the `User` row, no query of any kind.
 *
 * Every `earnedAt` is anchored to a stored timestamp (registration, premium
 * start, the day a tier's age threshold was crossed) rather than to `now`, so
 * the sort order 00 §4 demands is identical on every open.
 */
export function deriveBadges(input: DeriveBadgesInput): EarnedBadge[] {
  const now = input.now ?? new Date();
  const badges: EarnedBadge[] = [];

  if (input.adminRole !== null && input.adminRole !== STAFF_EXCLUDED_ADMIN_ROLE) {
    badges.push(earned("staff", 1, input.registeredAt));
  }

  // The caller answers "has this account been actioned"; this module never
  // queries moderation itself (02 §1). On the read path the answer is `false`
  // and the hourly sweep writes the revocation marker instead.
  if (input.emailVerified && input.twoFactorEnabled && !input.hasActionedModerationCase) {
    badges.push(earned("verified", 1, input.registeredAt));
  }

  if (input.registeredAt.getTime() < new Date(BADGE_EARLY_MEMBER_BEFORE).getTime()) {
    badges.push(earned("earlyMember", 1, input.registeredAt));
  }

  const accountAgeDays = wholeDaysBetween(input.registeredAt, now);
  const veteranTier = resolveBadgeTier("veteran", accountAgeDays);
  if (veteranTier > 0) {
    const reachedAfterDays = BADGE_CATALOG.veteran.thresholds[veteranTier - 1] as number;
    badges.push(
      earned(
        "veteran",
        veteranTier,
        new Date(input.registeredAt.getTime() + reachedAfterDays * DAY_MS),
      ),
    );
  }

  if (input.premiumType !== "NONE") {
    // Day one of a subscription already carries tier 1, so the value floors at
    // 1; tier 2 opens exactly on the 180th day (00 §4, catalog thresholds).
    const premiumDays =
      input.premiumSince === null ? 1 : Math.max(1, wholeDaysBetween(input.premiumSince, now));
    badges.push(
      earned(
        "supporter",
        Math.max(1, resolveBadgeTier("supporter", premiumDays)),
        input.premiumSince ?? input.registeredAt,
      ),
    );
  }

  return sortBadges(badges);
}

export type AdvanceBadgeProgressArgs = {
  userId: string;
  badge: BadgeId;
  /** "increment" sayaç artırır, "set" mutlak değer yazar (sweep kullanır). */
  mode: "increment" | "set";
  amount: number;
  /** Gün bazlı rozetlerde UTC gün başlangıcı; aynı gün ikinci kez sayılmaz. */
  day?: Date;
  store?: BadgeStore;
  now?: Date;
  /**
   * Whether a tier promotion writes a notification. On by default; the backfill
   * passes `false`, because a historical recomputation would otherwise land
   * dozens of "you earned a badge" rows on every account at once (07 §4).
   */
  notify?: boolean;
  notifier?: BadgeNotificationDependencies;
};

export type AdvanceBadgeProgressResult = {
  tier: number;
  previousTier: number;
  value: number;
};

/**
 * Advances one counter and promotes the badge row when a threshold is crossed.
 *
 * Idempotent in the two ways that matter: `@@unique([userId, badge])` makes a
 * repeated grant a no-op update, and `lastCountedDay` makes the same UTC day
 * count once no matter how many events arrive.
 */
async function advanceBadgeProgressInTransaction(
  args: AdvanceBadgeProgressArgs,
): Promise<AdvanceBadgeProgressResult & { notification: BadgeNotificationRow | null }> {
  const store = args.store ?? defaultStore;
  const now = args.now ?? new Date();
  const { badge, userId } = args;
  const day = args.day ? utcDayStart(args.day) : null;

  const progress = await store.userBadgeProgress.findUnique({
    where: { userId_badge: { badge, userId } },
    select: { lastCountedDay: true, streakDays: true, value: true },
  });
  const currentValue = Number(progress?.value ?? 0);
  const lastCountedDay = progress?.lastCountedDay ?? null;

  // Second event of the same day: nothing is written and nothing moves. The
  // pair is equal by construction because no write happened.
  if (
    day !== null &&
    lastCountedDay !== null &&
    utcDayStart(lastCountedDay).getTime() === day.getTime()
  ) {
    const tier = resolveBadgeTier(badge, currentValue);

    return { notification: null, previousTier: tier, tier, value: currentValue };
  }

  // The durable tier lives on the badge row, not on the counter: a broken
  // streak resets the counter to 1 but must not take the earned tier with it.
  const [existing] = await store.userBadge.findMany({
    where: { badge, userId },
    select: { revokedAt: true, tier: true },
    take: 1,
  });
  const previousTier = existing?.tier ?? 0;
  // A revoked row stays revoked. Moderation is the only thing allowed to undo
  // that, and it does so through `revokeBadges`/the sweep — never as a side
  // effect of the subject sending one more message.
  const isRevoked = existing?.revokedAt != null;

  let nextValue = args.mode === "set" ? args.amount : currentValue + args.amount;
  let streakDays = progress?.streakDays ?? 0;

  if (badge === "streak") {
    const gapDays =
      day === null || lastCountedDay === null
        ? null
        : wholeDaysBetween(utcDayStart(lastCountedDay), day);

    // A one-day gap continues the run; anything longer starts a new one. The
    // tier already earned survives either way (00 §4 "Ardışık gün").
    streakDays = gapDays === 1 ? streakDays + 1 : 1;
    nextValue = streakDays;
  }

  nextValue = Math.max(0, Math.trunc(nextValue));
  const computedTier = resolveBadgeTier(badge, nextValue);
  // `founder` is the only badge whose tier may fall: the member count that
  // earned it can drop back under the threshold (00 §4 cancellation matrix).
  const tier = badge === "founder" ? computedTier : Math.max(previousTier, computedTier);

  await store.userBadgeProgress.upsert({
    where: { userId_badge: { badge, userId } },
    create: {
      badge,
      ...(day === null ? {} : { lastCountedDay: day }),
      streakDays,
      userId,
      value: BigInt(nextValue),
    },
    update: {
      ...(day === null ? {} : { lastCountedDay: day }),
      streakDays,
      value: BigInt(nextValue),
    },
  });

  let notification: BadgeNotificationRow | null = null;

  if (!isRevoked && tier >= 1 && tier !== previousTier) {
    await store.userBadge.upsert({
      where: { userId_badge: { badge, userId } },
      create: {
        badge,
        earnedAt: now,
        source: badgeSource(badge),
        tier,
        userId,
      },
      update: { tier },
    });

    // Only a promotion is news. `founder` is the one badge whose tier can fall,
    // and losing members is not something to announce (07 §4).
    if ((args.notify ?? true) && tier > previousTier) {
      notification = await createBadgeEarnedNotification({
        badge,
        store,
        tier,
        userId,
      });
    }
  }

  return { notification, previousTier, tier, value: nextValue };
}

export async function advanceBadgeProgress(
  args: AdvanceBadgeProgressArgs,
): Promise<AdvanceBadgeProgressResult> {
  const store = args.store ?? defaultStore;
  const committed = await runBadgeTransaction(store, (transaction) =>
    advanceBadgeProgressInTransaction({ ...args, store: transaction }),
  );

  if (committed.notification !== null) {
    deliverBadgeEarnedNotification({
      notification: committed.notification,
      notifier: args.notifier ?? defaultNotificationDependencies,
      userId: args.userId,
    });
  }

  return {
    previousTier: committed.previousTier,
    tier: committed.tier,
    value: committed.value,
  };
}

/**
 * Writes the BADGE notification for one promotion, through the same pipeline
 * every other product event uses: row, socket, mobile push.
 *
 * The body never names the badge. A stored name is stored in one language, and
 * a user who switches language would keep reading the old one forever — so the
 * row carries `{ badgeId, tier }` and the client renders the name from the
 * catalog it already has (07 §4).
 */
export type BadgeNotificationRow = Awaited<ReturnType<PrismaClient["notification"]["create"]>>;

export async function createBadgeEarnedNotification(input: {
  badge: BadgeId;
  store?: BadgeStore;
  tier: number;
  userId: string;
}): Promise<BadgeNotificationRow> {
  const store = input.store ?? defaultStore;

  const target = await store.user.findUnique({
    where: { id: input.userId },
    select: { locale: true },
  });
  const locale = normalizeAppLocale(target?.locale ?? null);

  return store.notification.create({
    data: {
      actionUrl: BADGE_NOTIFICATION_ACTION_PATH,
      body: translate(locale, "badge.notification.body"),
      dedupeKey: `badge:${input.userId}:${input.badge}:${input.tier}`,
      metadata: { badgeId: input.badge, tier: input.tier },
      title: translate(locale, "badge.notification.title"),
      type: "BADGE",
      userId: input.userId,
    },
  });
}

export function deliverBadgeEarnedNotification(input: {
  notification: BadgeNotificationRow;
  notifier?: BadgeNotificationDependencies;
  userId: string;
}): void {
  const notifier = input.notifier ?? defaultNotificationDependencies;

  try {
    notifier.emitSocket(input.userId, serializeWorkspaceNotification(input.notification));
  } catch (error) {
    logError("[badges] Badge socket delivery failed", error);
  }

  void notifier.sendPush([input.notification]).catch((error) => {
    logError("[badges] Badge push delivery failed", error);
  });
}

export async function notifyBadgeEarned(input: {
  badge: BadgeId;
  notifier?: BadgeNotificationDependencies;
  store?: BadgeStore;
  tier: number;
  userId: string;
}): Promise<void> {
  const notification = await createBadgeEarnedNotification(input);

  deliverBadgeEarnedNotification({
    notification,
    ...(input.notifier === undefined ? {} : { notifier: input.notifier }),
    userId: input.userId,
  });
}

export type ReadUserBadgesArgs = {
  userId: string;
  now?: Date;
  store?: BadgeStore;
};

/**
 * Read path. One indexed `UserBadge` select plus the `User` row the derived
 * layer needs — no aggregate, no `UserDailyMetric` (00 §3).
 */
export async function readUserBadges(args: ReadUserBadgesArgs): Promise<EarnedBadge[]> {
  const store = args.store ?? defaultStore;
  const now = args.now ?? new Date();

  const user = await store.user.findUnique({
    where: { id: args.userId },
    select: badgeUserSelect,
  });

  if (!user) {
    return [];
  }

  // A suspended or deleted account shows nothing. The rows stay: "once earned
  // this" is evidence moderation needs (01 §2).
  if (user.isBanned || user.deletedAt !== null) {
    return [];
  }

  const rows = await store.userBadge.findMany({
    where: { userId: args.userId },
    select: { badge: true, earnedAt: true, expiresAt: true, revokedAt: true, tier: true },
  });

  const stored: EarnedBadge[] = [];
  /** Revoked rows still speak: a DERIVED id listed here is suppressed. */
  const suppressed = new Set<string>();

  for (const row of rows) {
    const id = toBadgeId(row.badge);
    if (id === null) {
      continue;
    }

    if (row.revokedAt !== null) {
      suppressed.add(id);
      continue;
    }

    if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
      continue;
    }

    if (row.tier < 1) {
      continue;
    }

    stored.push({
      earnedAt: toIsoString(row.earnedAt),
      expiresAt: row.expiresAt === null ? null : toIsoString(row.expiresAt),
      id,
      tier: row.tier,
    });
  }

  const storedIds = new Set(stored.map((badge) => badge.id));
  const derived = deriveBadges({
    adminRole: user.adminMembership?.role ?? null,
    emailVerified: user.emailVerified,
    // Moderation is not queried on the read path (02 §1); the sweep writes a
    // revocation marker instead, which `suppressed` above turns into removal.
    hasActionedModerationCase: false,
    now,
    premiumSince: user.premiumSince,
    premiumType: user.premiumType,
    registeredAt: user.registeredAt,
    twoFactorEnabled: user.twoFactorEnabled,
  });

  return sortBadges([
    ...stored,
    // A stored row wins over the derived copy of the same id (02 §1).
    ...derived.filter((badge) => !storedIds.has(badge.id) && !suppressed.has(badge.id)),
  ]);
}

export type ReadOwnBadgeProgressArgs = {
  userId: string;
  store?: BadgeStore;
};

/** "Rozetlerim" only. The counter table is never read from a profile open. */
export async function readOwnBadgeProgress(
  args: ReadOwnBadgeProgressArgs,
): Promise<BadgeProgress[]> {
  const store = args.store ?? defaultStore;
  const rows = await store.userBadgeProgress.findMany({
    where: { userId: args.userId },
    select: { badge: true, value: true },
  });

  const progress: BadgeProgress[] = [];

  for (const row of rows) {
    const id = toBadgeId(row.badge);
    if (id === null) {
      continue;
    }

    const value = Number(row.value);
    progress.push({
      id,
      nextThreshold: nextBadgeThreshold(id, value)?.threshold ?? null,
      tier: resolveBadgeTier(id, value),
      value,
    });
  }

  return sortBadges(progress);
}

export type RevokeBadgesArgs = {
  userId: string;
  badges: readonly BadgeId[];
  reason: string;
  store?: BadgeStore;
  now?: Date;
};

/**
 * Marks badges revoked without deleting anything.
 *
 * A DERIVED badge owns no row, so revoking it writes one: a `source: DERIVED`
 * row carrying only `revokedAt`, which `readUserBadges` reads as "suppress the
 * derived copy" (02 §3).
 */
export async function revokeBadges(args: RevokeBadgesArgs): Promise<number> {
  const store = args.store ?? defaultStore;
  const now = args.now ?? new Date();
  const reason = args.reason.slice(0, 280);

  const derivedBadges = args.badges.filter((badge) => BADGE_CATALOG[badge].layer === "derived");
  const storedBadges = args.badges.filter((badge) => BADGE_CATALOG[badge].layer !== "derived");

  let revoked = 0;

  if (storedBadges.length > 0) {
    const result = await store.userBadge.updateMany({
      where: { badge: { in: [...storedBadges] }, revokedAt: null, userId: args.userId },
      data: { revokedAt: now, revokeReason: reason },
    });
    revoked += result.count;
  }

  for (const badge of derivedBadges) {
    await store.userBadge.upsert({
      where: { userId_badge: { badge, userId: args.userId } },
      create: {
        badge,
        revokeReason: reason,
        revokedAt: now,
        source: "DERIVED",
        tier: 1,
        userId: args.userId,
      },
      update: { revokeReason: reason, revokedAt: now },
    });
    revoked += 1;
  }

  return revoked;
}
