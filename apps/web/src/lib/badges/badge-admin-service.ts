import { prisma, type BadgeSource, type PrismaClient } from "@wizards/db";
import {
  BADGE_CATALOG,
  BadgeIdSchema,
  GRANTABLE_BADGE_IDS,
  sortBadges,
  type BadgeId,
} from "@wizards/types";
import { z } from "zod";

import { buildAdminAuditLogEntry } from "@/lib/admin/audit-log";
import { ApiError } from "@/lib/api";
import {
  createBadgeEarnedNotification,
  deliverBadgeEarnedNotification,
  deriveBadges,
  revokeBadges as revokeBadgesService,
  runBadgeTransaction,
  type BadgeStore,
} from "@/lib/badges/badge-service";
import { logError } from "@/lib/logger";

/**
 * The admin half of the badge engine: the only path that writes a badge nobody
 * earned, and the only path that takes one away by hand.
 *
 * Two rules from 08 §2 shape everything here. Only `layer: "granted"` badges can
 * be handed out — a manually written `streak` would make every streak on the
 * product meaningless — and every write lands in `AdminAuditLog` with a reason,
 * because a badge is a public claim about a person and "who decided this" has to
 * survive the decision.
 *
 * Nothing is ever deleted. A revoked row keeps `revokedAt` and its reason, so a
 * moderation case can still read "this account once held this".
 */

export const BADGE_GRANT_AUDIT_ACTION = "badge.grant";
export const BADGE_REVOKE_AUDIT_ACTION = "badge.revoke";
export const BADGE_AUDIT_TARGET_TYPE = "USER";

/** Same ceiling `UserBadge.grantReason`/`revokeReason` carry in the schema. */
const REASON_MAX_LENGTH = 280;

/**
 * Same store the engine uses. The audit row is not part of it on purpose: it is
 * written through `writeAdminAuditLog`, which stamps the hashed caller
 * fingerprint every other admin action carries.
 */
export type AdminBadgeStore = BadgeStore & {
  adminAuditLog: Pick<PrismaClient["adminAuditLog"], "create">;
};

const defaultStore = prisma as unknown as AdminBadgeStore;

export type BadgeAdminDependencies = {
  deliverBadgeNotification: typeof deliverBadgeEarnedNotification;
  revokeBadges: typeof revokeBadgesService;
};

const defaultDependencies: BadgeAdminDependencies = {
  deliverBadgeNotification: deliverBadgeEarnedNotification,
  revokeBadges: revokeBadgesService,
};

const ReasonSchema = z.string().trim().min(1).max(REASON_MAX_LENGTH);

export const AdminBadgeGrantSchema = z
  .object({
    badge: BadgeIdSchema,
    /** Both grantable badges are single-tier today; the field stays for later. */
    tier: z.number().int().min(1).max(1).optional(),
    /** Required for `event`, rejected for everything else. */
    expiresAt: z.string().datetime().optional(),
    reason: ReasonSchema,
  })
  .strict();

export const AdminBadgeRevokeSchema = z
  .object({
    badge: BadgeIdSchema,
    reason: ReasonSchema,
  })
  .strict();

export type AdminBadgeGrantInput = z.infer<typeof AdminBadgeGrantSchema>;
export type AdminBadgeRevokeInput = z.infer<typeof AdminBadgeRevokeSchema>;

export type AdminBadgeRow = {
  id: BadgeId;
  tier: number;
  source: BadgeSource;
  earnedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  grantReason: string | null;
  grantedById: string | null;
  /** True once `expiresAt` has passed; the row stays, the badge stops showing. */
  expired: boolean;
};

export type AdminUserBadgesPayload = {
  active: AdminBadgeRow[];
  /** Revoked and expired rows, kept for the moderation record (08 §2). */
  inactive: AdminBadgeRow[];
  /** Catalog ids an admin may hand out, in catalog order. */
  grantable: BadgeId[];
};

function toBadgeId(value: string): BadgeId | null {
  return value in BADGE_CATALOG ? (value as BadgeId) : null;
}

function badgeRow(input: {
  id: BadgeId;
  tier: number;
  source: BadgeSource;
  earnedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  grantReason: string | null;
  grantedById: string | null;
  now: Date;
}): AdminBadgeRow {
  const expired = input.expiresAt !== null && input.expiresAt.getTime() <= input.now.getTime();

  return {
    earnedAt: input.earnedAt.toISOString(),
    expired,
    expiresAt: input.expiresAt === null ? null : input.expiresAt.toISOString(),
    grantReason: input.grantReason,
    grantedById: input.grantedById,
    id: input.id,
    revokeReason: input.revokeReason,
    revokedAt: input.revokedAt === null ? null : input.revokedAt.toISOString(),
    source: input.source,
    tier: input.tier,
  };
}

export type ListAdminUserBadgesArgs = {
  userId: string;
  now?: Date;
  store?: AdminBadgeStore;
};

/**
 * Everything the console needs about one account's badges, including what was
 * taken away and what ran out — the opposite of the user-facing read, which
 * filters both (03 §1). A moderator looking at a case has to see the history.
 */
export async function listAdminUserBadges(
  args: ListAdminUserBadgesArgs,
): Promise<AdminUserBadgesPayload> {
  const store = args.store ?? defaultStore;
  const now = args.now ?? new Date();

  const user = await store.user.findUnique({
    where: { id: args.userId },
    select: {
      adminMembership: { select: { role: true } },
      deletedAt: true,
      emailVerified: true,
      isBanned: true,
      premiumSince: true,
      premiumType: true,
      registeredAt: true,
      twoFactorEnabled: true,
    },
  });

  if (!user) {
    throw new ApiError("User not found", 404, "USER_NOT_FOUND");
  }

  const rows = await store.userBadge.findMany({
    where: { userId: args.userId },
    select: {
      badge: true,
      earnedAt: true,
      expiresAt: true,
      grantReason: true,
      grantedById: true,
      revokeReason: true,
      revokedAt: true,
      source: true,
      tier: true,
    },
  });

  const active: AdminBadgeRow[] = [];
  const inactive: AdminBadgeRow[] = [];
  const stored = new Set<BadgeId>();

  for (const row of rows) {
    const id = toBadgeId(row.badge);
    if (id === null) {
      continue;
    }

    stored.add(id);
    const entry = badgeRow({ ...row, earnedAt: row.earnedAt, id, now });

    if (entry.revokedAt !== null || entry.expired || entry.tier < 1) {
      inactive.push(entry);
      continue;
    }

    active.push(entry);
  }

  // The derived layer owns no rows, so it has to be recomputed here too —
  // otherwise the console would show a profile missing half its badges and an
  // admin would "fix" it by granting one by hand.
  const derived = deriveBadges({
    adminRole: user.adminMembership?.role ?? null,
    emailVerified: user.emailVerified,
    hasActionedModerationCase: false,
    now,
    premiumSince: user.premiumSince,
    premiumType: user.premiumType,
    registeredAt: user.registeredAt,
    twoFactorEnabled: user.twoFactorEnabled,
  });

  for (const badge of derived) {
    if (stored.has(badge.id)) {
      continue;
    }

    active.push(
      badgeRow({
        earnedAt: new Date(badge.earnedAt),
        expiresAt: null,
        grantReason: null,
        grantedById: null,
        id: badge.id,
        now,
        revokeReason: null,
        revokedAt: null,
        source: "DERIVED",
        tier: badge.tier,
      }),
    );
  }

  return {
    active: sortBadges(active),
    grantable: [...GRANTABLE_BADGE_IDS],
    inactive: sortBadges(inactive),
  };
}

export type GrantUserBadgeArgs = {
  adminUserId: string;
  userId: string;
  input: AdminBadgeGrantInput;
  headers?: Headers | null;
  now?: Date;
  store?: AdminBadgeStore;
  dependencies?: BadgeAdminDependencies;
};

/**
 * Hands out one GRANTED badge.
 *
 * The refusals are the point of the function: an AWARDED or DERIVED id, a
 * missing `event` expiry, or an empty reason each answer `400` before anything
 * is written (08 §2).
 */
export async function grantUserBadge(args: GrantUserBadgeArgs): Promise<AdminBadgeRow> {
  const store = args.store ?? defaultStore;
  const dependencies = args.dependencies ?? defaultDependencies;
  const now = args.now ?? new Date();
  const { badge, reason } = args.input;
  const definition = BADGE_CATALOG[badge];

  // A badge's meaning is the condition that earns it. Writing `streak` by hand
  // would not "give someone a streak", it would tell every reader that the
  // number under a flame icon means nothing.
  if (definition.layer !== "granted") {
    throw new ApiError(
      `${badge} is earned by the evaluator and cannot be granted by hand`,
      400,
      "BADGE_NOT_GRANTABLE",
    );
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    throw new ApiError("A reason is required", 400, "BADGE_REASON_REQUIRED");
  }

  let expiresAt: Date | null = null;

  if (badge === "event") {
    // An event badge without an end date is a permanent badge with an event's
    // name on it (00 §4).
    if (args.input.expiresAt === undefined) {
      throw new ApiError("An event badge requires an expiry", 400, "BADGE_EXPIRY_REQUIRED");
    }

    expiresAt = new Date(args.input.expiresAt);

    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
      throw new ApiError(
        "An event badge expiry must be in the future",
        400,
        "BADGE_EXPIRY_INVALID",
      );
    }
  } else if (args.input.expiresAt !== undefined) {
    throw new ApiError(
      `${badge} does not expire and cannot carry an expiry`,
      400,
      "BADGE_EXPIRY_UNSUPPORTED",
    );
  }

  const tier = args.input.tier ?? 1;
  const committed = await runBadgeTransaction(store, async (transaction) => {
    const tx = transaction as AdminBadgeStore;
    const stored = await tx.userBadge.upsert({
      where: { userId_badge: { badge, userId: args.userId } },
      create: {
        badge,
        earnedAt: now,
        expiresAt,
        grantReason: trimmedReason,
        grantedById: args.adminUserId,
        source: "GRANTED",
        tier,
        userId: args.userId,
      },
      // Re-granting reopens a revoked row instead of leaving a dead one behind,
      // and it is the one path allowed to clear `revokedAt`: an admin undoing an
      // admin decision, recorded in the audit trail like the first one.
      update: {
        earnedAt: now,
        expiresAt,
        grantReason: trimmedReason,
        grantedById: args.adminUserId,
        revokeReason: null,
        revokedAt: null,
        source: "GRANTED",
        tier,
      },
      select: {
        badge: true,
        earnedAt: true,
        expiresAt: true,
        grantReason: true,
        grantedById: true,
        revokeReason: true,
        revokedAt: true,
        source: true,
        tier: true,
      },
    });

    await tx.adminAuditLog.create({
      data: buildAdminAuditLogEntry({
        action: BADGE_GRANT_AUDIT_ACTION,
        adminUserId: args.adminUserId,
        headers: args.headers ?? null,
        metadata: { badgeId: badge, tier },
        reason: trimmedReason,
        targetId: args.userId,
        targetType: BADGE_AUDIT_TARGET_TYPE,
      }),
    });

    const notification = await createBadgeEarnedNotification({
      badge,
      store: tx,
      tier,
      userId: args.userId,
    });

    return { notification, stored };
  });

  // The person is told they gained a badge; nobody is told they lost one. A
  // revocation notification would be a punishment notice on a surface that has
  // no room to explain itself (08 §2).
  try {
    dependencies.deliverBadgeNotification({
      notification: committed.notification,
      userId: args.userId,
    });
  } catch (error) {
    logError("[badges] Admin grant notification delivery failed", error);
  }

  const { stored } = committed;

  return badgeRow({
    earnedAt: stored.earnedAt,
    expiresAt: stored.expiresAt,
    grantReason: stored.grantReason,
    grantedById: stored.grantedById,
    id: badge,
    now,
    revokeReason: stored.revokeReason,
    revokedAt: stored.revokedAt,
    source: stored.source,
    tier: stored.tier,
  });
}

export type RevokeUserBadgeArgs = {
  adminUserId: string;
  userId: string;
  input: AdminBadgeRevokeInput;
  headers?: Headers | null;
  now?: Date;
  store?: AdminBadgeStore;
  dependencies?: BadgeAdminDependencies;
};

export type RevokeUserBadgeResult = {
  badge: BadgeId;
  revoked: number;
};

/**
 * Takes one badge away. Any layer may be revoked — a DERIVED badge gets the
 * suppression row `revokeBadges` writes for exactly this case — and no row is
 * ever removed.
 */
export async function revokeUserBadge(args: RevokeUserBadgeArgs): Promise<RevokeUserBadgeResult> {
  const store = args.store ?? defaultStore;
  const dependencies = args.dependencies ?? defaultDependencies;
  const now = args.now ?? new Date();
  const { badge } = args.input;
  const trimmedReason = args.input.reason.trim();

  if (trimmedReason.length === 0) {
    throw new ApiError("A reason is required", 400, "BADGE_REASON_REQUIRED");
  }

  return runBadgeTransaction(store, async (transaction) => {
    const tx = transaction as AdminBadgeStore;
    const ownership = await listAdminUserBadges({ now, store: tx, userId: args.userId });
    const active = ownership.active.find((entry) => entry.id === badge);
    const inactive = ownership.inactive.find((entry) => entry.id === badge);

    if (inactive?.revokedAt !== null && inactive?.revokedAt !== undefined) {
      throw new ApiError("Badge is already revoked", 409, "BADGE_ALREADY_REVOKED");
    }
    if (!active) {
      throw new ApiError("Badge not found on this account", 404, "BADGE_NOT_FOUND");
    }

    const [existing] = await tx.userBadge.findMany({
      where: { badge, userId: args.userId },
      select: { revokedAt: true, tier: true },
      take: 1,
    });

    if (existing?.revokedAt != null) {
      throw new ApiError("Badge is already revoked", 409, "BADGE_ALREADY_REVOKED");
    }

    const revoked = await dependencies.revokeBadges({
      badges: [badge],
      now,
      reason: trimmedReason,
      store: tx,
      userId: args.userId,
    });

    if (revoked === 0) {
      throw new ApiError("Badge not found on this account", 404, "BADGE_NOT_FOUND");
    }

    await tx.adminAuditLog.create({
      data: buildAdminAuditLogEntry({
        action: BADGE_REVOKE_AUDIT_ACTION,
        adminUserId: args.adminUserId,
        headers: args.headers ?? null,
        // A derived badge owns no row, so the suppression `revokeBadges` writes
        // carries tier 1 — that is the tier being taken away.
        metadata: { badgeId: badge, tier: existing?.tier ?? active.tier },
        reason: trimmedReason,
        targetId: args.userId,
        targetType: BADGE_AUDIT_TARGET_TYPE,
      }),
    });

    return { badge, revoked };
  });
}
