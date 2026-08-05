import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { AdminAuditLogInput } from "@/lib/admin/audit-log";
import {
  BADGE_GRANT_AUDIT_ACTION,
  BADGE_REVOKE_AUDIT_ACTION,
  grantUserBadge,
  listAdminUserBadges,
  revokeUserBadge,
  type AdminBadgeStore,
  type BadgeAdminDependencies,
} from "@/lib/badges/badge-admin-service";
import { revokeBadges } from "@/lib/badges/badge-service";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const EXPIRES_AT = "2026-09-05T12:00:00.000Z";

type BadgeRow = {
  badge: string;
  earnedAt: Date;
  expiresAt: Date | null;
  grantReason: string | null;
  grantedById: string | null;
  revokeReason: string | null;
  revokedAt: Date | null;
  source: string;
  tier: number;
  userId: string;
};

function badgeRow(overrides: Partial<BadgeRow> & { badge: string; userId: string }): BadgeRow {
  return {
    earnedAt: new Date("2026-07-01T00:00:00.000Z"),
    expiresAt: null,
    grantReason: null,
    grantedById: null,
    revokeReason: null,
    revokedAt: null,
    source: "AWARDED",
    tier: 1,
    ...overrides,
  };
}

function harness(options: {
  auditFails?: boolean;
  badges?: BadgeRow[];
  transportFails?: boolean;
  user?: {
    adminMembership: { role: string } | null;
    emailVerified: boolean;
    premiumSince: Date | null;
    premiumType: string;
    registeredAt: Date;
    twoFactorEnabled: boolean;
  } | null;
}) {
  const rows = new Map<string, BadgeRow>(
    (options.badges ?? []).map((row) => [`${row.userId}:${row.badge}`, row]),
  );
  const audits: AdminAuditLogInput[] = [];
  const notifications: Array<{ metadata: unknown; type: string; userId: string }> = [];
  const user =
    options.user === undefined
      ? {
          adminMembership: null,
          emailVerified: false,
          premiumSince: null,
          premiumType: "NONE",
          registeredAt: new Date("2026-06-01T00:00:00.000Z"),
          twoFactorEnabled: false,
        }
      : options.user;

  const store = {
    adminAuditLog: {
      create: async (args: { data: AdminAuditLogInput }) => {
        if (options.auditFails) {
          throw new Error("audit unavailable");
        }
        audits.push(args.data);
        return args.data;
      },
    },
    notification: {
      create: async (args: { data: { metadata: unknown; type: string; userId: string } }) => {
        notifications.push(args.data);
        return { ...args.data, id: `notification-${notifications.length}` };
      },
    },
    user: {
      findUnique: async () =>
        user === null ? null : { ...user, deletedAt: null, isBanned: false },
    },
    userBadge: {
      findMany: async (args: { where: { badge?: string; userId?: string } }) =>
        [...rows.values()].filter(
          (row) =>
            (args.where.userId === undefined || row.userId === args.where.userId) &&
            (args.where.badge === undefined || row.badge === args.where.badge),
        ),
      upsert: async (args: {
        create: Partial<BadgeRow> & { badge: string; userId: string };
        update: Partial<BadgeRow>;
        where: { userId_badge: { badge: string; userId: string } };
      }) => {
        const rowKey = `${args.where.userId_badge.userId}:${args.where.userId_badge.badge}`;
        const existing = rows.get(rowKey);
        const next = existing
          ? { ...existing, ...args.update }
          : badgeRow({ ...args.create, badge: args.create.badge, userId: args.create.userId });
        rows.set(rowKey, next);
        return next;
      },
      updateMany: async (args: {
        data: Partial<BadgeRow>;
        where: { badge?: { in: string[] }; revokedAt?: null; userId?: string };
      }) => {
        let count = 0;
        for (const [rowKey, row] of rows) {
          if (args.where.userId !== undefined && row.userId !== args.where.userId) {
            continue;
          }
          if (args.where.badge && !args.where.badge.in.includes(row.badge)) {
            continue;
          }
          if (args.where.revokedAt === null && row.revokedAt !== null) {
            continue;
          }
          rows.set(rowKey, { ...row, ...args.data });
          count += 1;
        }
        return { count };
      },
    },
    userBadgeProgress: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async () => ({}),
    },
  } as unknown as AdminBadgeStore;

  (
    store as unknown as {
      $transaction<T>(operation: (transaction: AdminBadgeStore) => Promise<T>): Promise<T>;
    }
  ).$transaction = async <T>(operation: (transaction: AdminBadgeStore) => Promise<T>) => {
    const rowSnapshot = new Map([...rows].map(([key, row]) => [key, { ...row }]));
    const auditCount = audits.length;
    const notificationCount = notifications.length;
    try {
      return await operation(store);
    } catch (error) {
      rows.clear();
      for (const [key, row] of rowSnapshot) {
        rows.set(key, row);
      }
      audits.length = auditCount;
      notifications.length = notificationCount;
      throw error;
    }
  };

  const dependencies = {
    deliverBadgeNotification: () => {
      if (options.transportFails) {
        throw new Error("notification transport unavailable");
      }
    },
    revokeBadges,
  } as unknown as BadgeAdminDependencies;

  return { audits, dependencies, notifications, rows, store };
}

async function statusOf(run: () => Promise<unknown>) {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof ApiError ? error.status : "not-an-ApiError";
  }
}

describe("badge admin service", () => {
  it("refuses to hand out an AWARDED or a DERIVED badge", async () => {
    const { dependencies, rows, store } = harness({});

    for (const badge of ["streak", "inviter", "verified", "veteran"] as const) {
      assert.equal(
        await statusOf(() =>
          grantUserBadge({
            adminUserId: "admin-1",
            dependencies,
            input: { badge, reason: "elle" },
            now: NOW,
            store,
            userId: "user-1",
          }),
        ),
        400,
        `${badge} was grantable by hand`,
      );
    }

    assert.equal(rows.size, 0, "a refused grant must write nothing");
  });

  it("requires an expiry on an event grant and rejects one everywhere else", async () => {
    const { dependencies, store } = harness({});

    assert.equal(
      await statusOf(() =>
        grantUserBadge({
          adminUserId: "admin-1",
          dependencies,
          input: { badge: "event", reason: "Whispr Fest" },
          now: NOW,
          store,
          userId: "user-1",
        }),
      ),
      400,
    );

    assert.equal(
      await statusOf(() =>
        grantUserBadge({
          adminUserId: "admin-1",
          dependencies,
          input: { badge: "event", expiresAt: "2026-08-01T00:00:00.000Z", reason: "Whispr Fest" },
          now: NOW,
          store,
          userId: "user-1",
        }),
      ),
      400,
      "an expiry in the past is not an expiry",
    );

    assert.equal(
      await statusOf(() =>
        grantUserBadge({
          adminUserId: "admin-1",
          dependencies,
          input: { badge: "contributor", expiresAt: EXPIRES_AT, reason: "PR #12" },
          now: NOW,
          store,
          userId: "user-1",
        }),
      ),
      400,
      "contributor does not expire",
    );
  });

  it("refuses a blank reason on both writes", async () => {
    const { dependencies, store } = harness({
      badges: [badgeRow({ badge: "contributor", source: "GRANTED", userId: "user-1" })],
    });

    assert.equal(
      await statusOf(() =>
        grantUserBadge({
          adminUserId: "admin-1",
          dependencies,
          input: { badge: "contributor", reason: "   " },
          now: NOW,
          store,
          userId: "user-1",
        }),
      ),
      400,
    );

    assert.equal(
      await statusOf(() =>
        revokeUserBadge({
          adminUserId: "admin-1",
          dependencies,
          input: { badge: "contributor", reason: "  " },
          now: NOW,
          store,
          userId: "user-1",
        }),
      ),
      400,
    );
  });

  it("writes an audit row carrying the badge and tier, and notifies only on a grant", async () => {
    const { audits, dependencies, notifications, rows, store } = harness({});

    await grantUserBadge({
      adminUserId: "admin-1",
      dependencies,
      input: { badge: "contributor", reason: "PR #12" },
      now: NOW,
      store,
      userId: "user-1",
    });

    assert.equal(audits.length, 1);
    assert.deepEqual(
      {
        action: audits[0]?.action,
        metadata: audits[0]?.metadata,
        reason: audits[0]?.reason,
        targetId: audits[0]?.targetId,
        targetType: audits[0]?.targetType,
      },
      {
        action: BADGE_GRANT_AUDIT_ACTION,
        metadata: { badgeId: "contributor", tier: 1 },
        reason: "PR #12",
        targetId: "user-1",
        targetType: "USER",
      },
    );
    assert.deepEqual(notifications, [
      {
        actionUrl: "/settings/badges",
        body: "You can see it under My badges.",
        dedupeKey: "badge:user-1:contributor:1",
        metadata: { badgeId: "contributor", tier: 1 },
        title: "You earned a new badge",
        type: "BADGE",
        userId: "user-1",
      },
    ]);
    assert.equal(rows.get("user-1:contributor")?.source, "GRANTED");
    assert.equal(rows.get("user-1:contributor")?.grantedById, "admin-1");

    await revokeUserBadge({
      adminUserId: "admin-1",
      dependencies,
      input: { badge: "contributor", reason: "yanlış hesap" },
      now: NOW,
      store,
      userId: "user-1",
    });

    assert.equal(audits.length, 2);
    assert.equal(audits[1]?.action, BADGE_REVOKE_AUDIT_ACTION);
    assert.deepEqual(audits[1]?.metadata, { badgeId: "contributor", tier: 1 });
    assert.equal(notifications.length, 1, "a revocation is never announced");

    // The row survives: "once held this" is what a moderation case reads.
    const revoked = rows.get("user-1:contributor");
    assert.equal(revoked?.revokedAt?.toISOString(), NOW.toISOString());
    assert.equal(revoked?.revokeReason, "yanlış hesap");
  });

  it("rolls a grant or revoke back when the mandatory audit row cannot be written", async () => {
    const grant = harness({ auditFails: true });
    await assert.rejects(
      grantUserBadge({
        adminUserId: "admin-1",
        dependencies: grant.dependencies,
        input: { badge: "contributor", reason: "PR #12" },
        now: NOW,
        store: grant.store,
        userId: "user-1",
      }),
      /audit unavailable/,
    );
    assert.equal(grant.rows.has("user-1:contributor"), false);

    const revoke = harness({
      auditFails: true,
      badges: [badgeRow({ badge: "contributor", source: "GRANTED", userId: "user-1" })],
    });
    await assert.rejects(
      revokeUserBadge({
        adminUserId: "admin-1",
        dependencies: revoke.dependencies,
        input: { badge: "contributor", reason: "wrong account" },
        now: NOW,
        store: revoke.store,
        userId: "user-1",
      }),
      /audit unavailable/,
    );
    assert.equal(revoke.rows.get("user-1:contributor")?.revokedAt, null);
  });

  it("rejects revoking a derived badge the account never earned", async () => {
    const value = harness({
      user: {
        adminMembership: null,
        emailVerified: false,
        premiumSince: null,
        premiumType: "NONE",
        registeredAt: new Date("2026-06-01T00:00:00.000Z"),
        twoFactorEnabled: false,
      },
    });

    assert.equal(
      await statusOf(() =>
        revokeUserBadge({
          adminUserId: "admin-1",
          dependencies: value.dependencies,
          input: { badge: "earlyMember", reason: "not applicable" },
          now: NOW,
          store: value.store,
          userId: "user-1",
        }),
      ),
      404,
    );
    assert.equal(value.rows.has("user-1:earlyMember"), false);
  });

  it("keeps a committed grant successful when notification transport is down", async () => {
    const value = harness({ transportFails: true });

    const granted = await grantUserBadge({
      adminUserId: "admin-1",
      dependencies: value.dependencies,
      input: { badge: "contributor", reason: "PR #12" },
      now: NOW,
      store: value.store,
      userId: "user-1",
    });

    assert.equal(granted.id, "contributor");
    assert.equal(value.rows.get("user-1:contributor")?.revokedAt, null);
    assert.equal(value.audits.length, 1);
  });

  it("returns revoked and expired rows the user endpoint hides", async () => {
    const { store } = harness({
      badges: [
        badgeRow({ badge: "inviter", userId: "user-1" }),
        badgeRow({
          badge: "contributor",
          revokeReason: "moderation",
          revokedAt: new Date("2026-08-01T00:00:00.000Z"),
          source: "GRANTED",
          userId: "user-1",
        }),
        badgeRow({
          badge: "event",
          expiresAt: new Date("2026-08-01T00:00:00.000Z"),
          source: "GRANTED",
          userId: "user-1",
        }),
      ],
    });

    const payload = await listAdminUserBadges({ now: NOW, store, userId: "user-1" });

    assert.deepEqual(
      payload.active.map((row) => row.id),
      ["inviter"],
    );
    // Both lists come back in the catalog's single sort order (00 §4), so the
    // console prints them the same way every profile surface does.
    assert.deepEqual(
      payload.inactive.map((row) => ({ expired: row.expired, id: row.id })),
      [
        { expired: true, id: "event" },
        { expired: false, id: "contributor" },
      ],
    );
    assert.deepEqual(payload.grantable, ["contributor", "event"]);
  });

  it("shows the derived layer the console would otherwise be missing", async () => {
    const { store } = harness({
      user: {
        adminMembership: { role: "ADMIN" },
        emailVerified: true,
        premiumSince: null,
        premiumType: "NONE",
        registeredAt: new Date("2025-01-01T00:00:00.000Z"),
        twoFactorEnabled: true,
      },
    });

    const payload = await listAdminUserBadges({ now: NOW, store, userId: "user-1" });

    assert.deepEqual(
      payload.active.map((row) => `${row.id}:${row.source}`),
      ["staff:DERIVED", "verified:DERIVED", "earlyMember:DERIVED", "veteran:DERIVED"],
    );
  });

  it("answers 404 for an unknown account and 409 for an already revoked badge", async () => {
    const missing = harness({ user: null });
    assert.equal(
      await statusOf(() =>
        listAdminUserBadges({ now: NOW, store: missing.store, userId: "ghost" }),
      ),
      404,
    );

    const revoked = harness({
      badges: [
        badgeRow({
          badge: "contributor",
          revokedAt: new Date("2026-08-01T00:00:00.000Z"),
          source: "GRANTED",
          userId: "user-1",
        }),
      ],
    });

    assert.equal(
      await statusOf(() =>
        revokeUserBadge({
          adminUserId: "admin-1",
          dependencies: revoked.dependencies,
          input: { badge: "contributor", reason: "tekrar" },
          now: NOW,
          store: revoked.store,
          userId: "user-1",
        }),
      ),
      409,
    );
  });

  it("reopens a revoked grant instead of leaving a dead row behind", async () => {
    const { dependencies, rows, store } = harness({
      badges: [
        badgeRow({
          badge: "contributor",
          revokeReason: "yanlış hesap",
          revokedAt: new Date("2026-08-01T00:00:00.000Z"),
          source: "GRANTED",
          userId: "user-1",
        }),
      ],
    });

    await grantUserBadge({
      adminUserId: "admin-2",
      dependencies,
      input: { badge: "contributor", reason: "itiraz kabul edildi" },
      now: NOW,
      store,
      userId: "user-1",
    });

    const row = rows.get("user-1:contributor");
    assert.equal(row?.revokedAt, null);
    assert.equal(row?.revokeReason, null);
    assert.equal(row?.grantReason, "itiraz kabul edildi");
  });
});
