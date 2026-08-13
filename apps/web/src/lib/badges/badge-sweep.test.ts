import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { advanceBadgeProgress, revokeBadges } from "@/lib/badges/badge-service";
import {
  FOUNDER_THRESHOLD_REVOKE_REASON,
  sweepBadges,
  type BadgeSweepStore,
} from "@/lib/badges/badge-sweep";

const NOW = new Date("2026-08-05T12:00:00.000Z");

/**
 * The rarity rollup reads a shared cache the node runner has no business
 * opening, so every sweep in this file runs with it stubbed out. Its own
 * behaviour is covered in `badge-rarity.test.ts`.
 */
function rarityStub() {
  const calls: Date[] = [];

  return {
    calls,
    rollUpRarity: async (args: { now?: Date } = {}) => {
      calls.push(args.now ?? new Date());
      return { computed: true, totalUsers: 0 };
    },
  };
}

type BadgeRow = {
  badge: string;
  earnedAt: Date;
  expiresAt: Date | null;
  revokeReason: string | null;
  revokedAt: Date | null;
  source: string;
  tier: number;
  userId: string;
};

type ProgressRow = {
  badge: string;
  lastCountedDay: Date | null;
  streakDays: number;
  userId: string;
  value: bigint;
};

function badgeRow(overrides: Partial<BadgeRow> & { badge: string; userId: string }): BadgeRow {
  return {
    earnedAt: new Date("2026-07-01T00:00:00.000Z"),
    expiresAt: null,
    revokeReason: null,
    revokedAt: null,
    source: "AWARDED",
    tier: 1,
    ...overrides,
  };
}

function key(userId: string, badge: string) {
  return `${userId}:${badge}`;
}

function harness(options: {
  badges?: BadgeRow[];
  cases?: Array<{ subjectId: string | null }>;
  progress?: ProgressRow[];
  servers?: Array<{ members: number; ownerId: string }>;
}) {
  const badges = new Map<string, BadgeRow>(
    (options.badges ?? []).map((row) => [key(row.userId, row.badge), row]),
  );
  const progress = new Map<string, ProgressRow>(
    (options.progress ?? []).map((row) => [key(row.userId, row.badge), row]),
  );
  /**
   * 02 §17's tripwire: a sweep that *walks* the user table is a bug. Keyed
   * reads are not walks — a founder promotion writes a notification, and that
   * has to look up the recipient's language the same way every other
   * notification in the app does (07 §4).
   */
  const userScans: string[] = [];
  const notifications: Array<{ metadata: unknown; type: string; userId: string }> = [];

  const store = {
    notification: {
      create: async (args: { data: { metadata: unknown; type: string; userId: string } }) => {
        notifications.push(args.data);
        return {
          ...args.data,
          actionUrl: null,
          body: "",
          createdAt: NOW,
          id: `notification-${notifications.length}`,
          imageUrl: null,
          read: false,
          readAt: null,
          title: "",
        };
      },
    },
    moderationCase: {
      findMany: async () => options.cases ?? [],
    },
    server: {
      findMany: async (args: {
        where?: { memberCount?: { gte: number }; ownerId?: { in: string[] } };
      }) =>
        (options.servers ?? [])
          .filter(
            (server) =>
              (args.where?.memberCount === undefined ||
                server.members >= args.where.memberCount.gte) &&
              (args.where?.ownerId === undefined || args.where.ownerId.in.includes(server.ownerId)),
          )
          .map((server) => ({ memberCount: server.members, ownerId: server.ownerId })),
    },
    user: {
      findMany: async () => {
        userScans.push("findMany");
        return [];
      },
      findUnique: async () => null,
    },
    userBadge: {
      count: async (args: {
        where: { badge?: string; expiresAt?: { lt: Date }; revokedAt?: null };
      }) =>
        [...badges.values()].filter((row) => {
          const { where } = args;
          return (
            (where.badge === undefined || row.badge === where.badge) &&
            (where.revokedAt !== null || row.revokedAt === null) &&
            (!where.expiresAt || (row.expiresAt !== null && row.expiresAt < where.expiresAt.lt))
          );
        }).length,
      findMany: async (args: {
        where: {
          badge?: string;
          expiresAt?: { lt: Date };
          revokeReason?: string;
          revokedAt?: null | { not: null };
          userId?: string | { in: string[] };
        };
      }) =>
        [...badges.values()].filter((row) => {
          const { where } = args;
          if (typeof where.userId === "string" && row.userId !== where.userId) {
            return false;
          }
          if (
            where.userId &&
            typeof where.userId === "object" &&
            !where.userId.in.includes(row.userId)
          ) {
            return false;
          }
          if (where.badge !== undefined && row.badge !== where.badge) {
            return false;
          }
          if (where.revokeReason !== undefined && row.revokeReason !== where.revokeReason) {
            return false;
          }
          if (where.revokedAt === null && row.revokedAt !== null) {
            return false;
          }
          if (
            where.revokedAt !== null &&
            typeof where.revokedAt === "object" &&
            row.revokedAt === null
          ) {
            return false;
          }
          if (where.expiresAt && (row.expiresAt === null || row.expiresAt >= where.expiresAt.lt)) {
            return false;
          }
          return true;
        }),
      upsert: async (args: {
        create: Partial<BadgeRow> & { badge: string; userId: string };
        update: Partial<BadgeRow>;
        where: { userId_badge: { badge: string; userId: string } };
      }) => {
        const rowKey = key(args.where.userId_badge.userId, args.where.userId_badge.badge);
        const existing = badges.get(rowKey);
        const next = existing
          ? { ...existing, ...args.update }
          : badgeRow({
              badge: args.create.badge,
              source: args.create.source ?? "AWARDED",
              tier: args.create.tier ?? 1,
              userId: args.create.userId,
              ...(args.create.revokedAt === undefined ? {} : { revokedAt: args.create.revokedAt }),
              ...(args.create.revokeReason === undefined
                ? {}
                : { revokeReason: args.create.revokeReason }),
            });
        badges.set(rowKey, next);
        return next;
      },
      updateMany: async (args: {
        data: Partial<BadgeRow>;
        where: {
          badge?: string | { in: string[] };
          revokeReason?: string;
          revokedAt?: null;
          userId?: string;
        };
      }) => {
        let count = 0;
        for (const [rowKey, row] of badges) {
          const { where } = args;
          if (where.userId !== undefined && row.userId !== where.userId) {
            continue;
          }
          if (typeof where.badge === "string" && row.badge !== where.badge) {
            continue;
          }
          if (
            where.badge &&
            typeof where.badge === "object" &&
            !where.badge.in.includes(row.badge)
          ) {
            continue;
          }
          if (where.revokeReason !== undefined && row.revokeReason !== where.revokeReason) {
            continue;
          }
          if (where.revokedAt === null && row.revokedAt !== null) {
            continue;
          }
          badges.set(rowKey, { ...row, ...args.data });
          count += 1;
        }
        return { count };
      },
    },
    userBadgeProgress: {
      findMany: async () => [...progress.values()],
      findUnique: async (args: { where: { userId_badge: { badge: string; userId: string } } }) =>
        progress.get(key(args.where.userId_badge.userId, args.where.userId_badge.badge)) ?? null,
      upsert: async (args: {
        create: Partial<ProgressRow> & { badge: string; userId: string };
        update: Partial<ProgressRow>;
        where: { userId_badge: { badge: string; userId: string } };
      }) => {
        const rowKey = key(args.where.userId_badge.userId, args.where.userId_badge.badge);
        const existing = progress.get(rowKey);
        const next: ProgressRow = existing
          ? { ...existing, ...args.update }
          : {
              badge: args.create.badge,
              lastCountedDay: args.create.lastCountedDay ?? null,
              streakDays: args.create.streakDays ?? 0,
              userId: args.create.userId,
              value: args.create.value ?? 0n,
            };
        progress.set(rowKey, next);
        return next;
      },
    },
  } as unknown as BadgeSweepStore;

  (
    store as unknown as {
      $transaction<T>(operation: (transaction: BadgeSweepStore) => Promise<T>): Promise<T>;
    }
  ).$transaction = (operation) => operation(store);

  return { badges, notifications, store, userScans };
}

describe("badge sweep", () => {
  it("lowers a founder tier when the server shrinks and closes the row under the entry threshold", async () => {
    const shrunk = harness({
      badges: [badgeRow({ badge: "founder", tier: 2, userId: "user-1" })],
      progress: [
        { badge: "founder", lastCountedDay: null, streakDays: 0, userId: "user-1", value: 140n },
      ],
      servers: [{ members: 40, ownerId: "user-1" }],
    });

    const demotion = await sweepBadges({ now: NOW, store: shrunk.store }, rarityStub());

    assert.equal(demotion.founderUpdated, 1);
    assert.equal(shrunk.badges.get("user-1:founder")?.tier, 1);
    assert.equal(shrunk.badges.get("user-1:founder")?.revokedAt, null);

    const emptied = harness({
      badges: [badgeRow({ badge: "founder", tier: 1, userId: "user-1" })],
      progress: [
        { badge: "founder", lastCountedDay: null, streakDays: 0, userId: "user-1", value: 30n },
      ],
      servers: [{ members: 4, ownerId: "user-1" }],
    });

    const closure = await sweepBadges({ now: NOW, store: emptied.store }, rarityStub());

    assert.equal(closure.founderUpdated, 1);
    assert.equal(
      emptied.badges.get("user-1:founder")?.revokeReason,
      FOUNDER_THRESHOLD_REVOKE_REASON,
    );
    assert.equal(emptied.badges.get("user-1:founder")?.revokedAt?.toISOString(), NOW.toISOString());
  });

  it("grants founder to an owner who crossed the threshold without any badge row yet", async () => {
    const { badges, store } = harness({ servers: [{ members: 120, ownerId: "user-9" }] });

    const result = await sweepBadges({ now: NOW, store }, rarityStub());

    assert.equal(result.founderUpdated, 1);
    assert.equal(badges.get("user-9:founder")?.tier, 2);
  });

  it("reads founder candidates from maintained memberCount without a full server scan", async () => {
    const { store } = harness({});
    const queries: Array<{ select?: Record<string, unknown>; where?: Record<string, unknown> }> =
      [];
    store.server.findMany = (async (args: {
      select?: Record<string, unknown>;
      where?: Record<string, unknown>;
    }) => {
      queries.push(args);
      return [];
    }) as typeof store.server.findMany;

    await sweepBadges({ now: NOW, store }, rarityStub());

    assert.equal(
      queries.some((query) => Object.hasOwn(query.where ?? {}, "memberCount")),
      true,
    );
    assert.equal(
      queries.every((query) => query.select?.memberCount === true),
      true,
    );
  });

  it("revokes exactly the four badges an actioned case costs", async () => {
    const { badges, store } = harness({
      badges: [
        badgeRow({ badge: "inviter", tier: 2, userId: "user-1" }),
        badgeRow({ badge: "contributor", source: "GRANTED", userId: "user-1" }),
        badgeRow({ badge: "streak", tier: 3, userId: "user-1" }),
        badgeRow({ badge: "regular", tier: 2, userId: "user-1" }),
      ],
      cases: [{ subjectId: "user-1" }],
    });

    const result = await sweepBadges({ now: NOW, store }, rarityStub());

    // inviter + contributor rows close, founder finds nothing, verified gets a
    // derived marker row: three touched rows plus one new marker.
    assert.equal(result.revoked, 3);
    assert.equal(badges.get("user-1:inviter")?.revokedAt?.toISOString(), NOW.toISOString());
    assert.equal(badges.get("user-1:contributor")?.revokedAt?.toISOString(), NOW.toISOString());
    assert.equal(badges.get("user-1:verified")?.source, "DERIVED");
    assert.equal(badges.get("user-1:streak")?.revokedAt, null, "activity badges are not punished");
    assert.equal(badges.get("user-1:regular")?.revokedAt, null);
  });

  it("filters changed moderation cases and makes the second pass write nothing", async () => {
    const { badges, store } = harness({
      badges: [badgeRow({ badge: "inviter", tier: 1, userId: "user-old" })],
    });
    const queries: Array<{ where?: Record<string, unknown> }> = [];
    store.moderationCase.findMany = (async (args: { where?: Record<string, unknown> }) => {
      queries.push(args);
      return [{ subjectId: "user-old" }];
    }) as unknown as typeof store.moderationCase.findMany;

    const lastSweepAt = new Date("2026-08-05T11:00:00.000Z");
    await sweepBadges({ lastSweepAt, now: NOW, store }, rarityStub());
    const second = await sweepBadges({ lastSweepAt, now: NOW, store }, rarityStub());

    assert.deepEqual(queries[0]?.where?.updatedAt, { gte: lastSweepAt });
    assert.equal(second.revoked, 0);
    assert.equal(badges.get("user-old:inviter")?.revokedAt?.toISOString(), NOW.toISOString());
  });

  it("counts expired event grants without deleting them", async () => {
    const { badges, store } = harness({
      badges: [
        badgeRow({
          badge: "event",
          expiresAt: new Date("2026-08-01T00:00:00.000Z"),
          source: "GRANTED",
          userId: "user-1",
        }),
      ],
    });

    const result = await sweepBadges({ now: NOW, store }, rarityStub());

    assert.equal(result.expired, 1);
    assert.ok(badges.has("user-1:event"), "an expired grant is still a record of what happened");
  });

  it("uses count for expired grants instead of materializing badge rows", async () => {
    const { store } = harness({});
    const findMany = store.userBadge.findMany.bind(store.userBadge);
    store.userBadge.findMany = (async (args: { where?: { badge?: string } }) => {
      if (args.where?.badge === "event") {
        throw new Error("expired grants must use count");
      }
      return findMany(args as never);
    }) as typeof store.userBadge.findMany;

    const result = await sweepBadges({ now: NOW, store }, rarityStub());

    assert.equal(result.expired, 0);
  });

  it("announces a sweep promotion but stays silent on a demotion", async () => {
    // 07 §4: crossing a threshold is news; losing members is not. The socket
    // and push halves are stubbed — neither exists in a node test.
    const silentNotifier = {
      emitSocket: () => undefined,
      sendPush: async () => undefined,
    } as unknown as NonNullable<Parameters<typeof advanceBadgeProgress>[0]["notifier"]>;
    const dependencies = {
      advanceProgress: (args: Parameters<typeof advanceBadgeProgress>[0]) =>
        advanceBadgeProgress({ ...args, notifier: silentNotifier }),
      revokeBadges,
      rollUpRarity: rarityStub().rollUpRarity,
    };

    const promoted = harness({ servers: [{ members: 60, ownerId: "user-1" }] });
    await sweepBadges({ now: NOW, store: promoted.store }, dependencies);
    assert.deepEqual(
      promoted.notifications.map((row) => ({
        metadata: row.metadata,
        type: row.type,
        userId: row.userId,
      })),
      [{ metadata: { badgeId: "founder", tier: 1 }, type: "BADGE", userId: "user-1" }],
    );

    const demoted = harness({
      badges: [badgeRow({ badge: "founder", tier: 2, userId: "user-1" })],
      progress: [
        { badge: "founder", lastCountedDay: null, streakDays: 0, userId: "user-1", value: 140n },
      ],
      servers: [{ members: 40, ownerId: "user-1" }],
    });
    await sweepBadges({ now: NOW, store: demoted.store }, dependencies);
    assert.deepEqual(demoted.notifications, []);
  });

  it("never walks the user table", async () => {
    const { store, userScans } = harness({
      badges: [badgeRow({ badge: "founder", tier: 1, userId: "user-1" })],
      cases: [{ subjectId: "user-2" }],
      servers: [{ members: 60, ownerId: "user-3" }],
    });

    await sweepBadges({ now: NOW, store }, rarityStub());

    assert.deepEqual(userScans, []);
  });

  it("drives the rarity rollup from the same clock and survives its failure", async () => {
    const { store } = harness({});
    const rarity = rarityStub();

    const result = await sweepBadges({ now: NOW, store }, rarity);

    assert.deepEqual(rarity.calls, [NOW]);
    assert.equal(result.rarityComputed, true);

    // Counting holders is decoration; the founder recomputation and the
    // moderation revocations above it are not. A broken cache cannot take them
    // down with it.
    const failed = await sweepBadges(
      { now: NOW, store },
      {
        rollUpRarity: async () => {
          throw new Error("cache unreachable");
        },
      },
    );

    assert.equal(failed.rarityComputed, false);
    assert.equal(failed.expired, 0);
  });
});
