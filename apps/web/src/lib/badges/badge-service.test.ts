import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BADGE_CATALOG, BADGE_IDS } from "@wizards/types";

import {
  BADGE_NOTIFICATION_ACTION_PATH,
  advanceBadgeProgress,
  deriveBadges,
  readOwnBadgeProgress,
  readUserBadges,
  revokeBadges,
  type BadgeStore,
} from "@/lib/badges/badge-service";

const NOW = new Date("2026-08-05T12:00:00.000Z");

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

type StoredUser = {
  adminMembership: { role: string } | null;
  deletedAt: Date | null;
  emailVerified: boolean;
  isBanned: boolean;
  premiumSince: Date | null;
  premiumType: string;
  registeredAt: Date;
  twoFactorEnabled: boolean;
};

function baseUser(overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    adminMembership: null,
    deletedAt: null,
    emailVerified: false,
    isBanned: false,
    premiumSince: null,
    premiumType: "NONE",
    // After the early-member cutoff, so the derived layer stays quiet unless a
    // test asks for something specific.
    registeredAt: new Date("2026-06-01T00:00:00.000Z"),
    twoFactorEnabled: false,
    ...overrides,
  };
}

function key(userId: string, badge: string) {
  return `${userId}:${badge}`;
}

type NotificationRow = {
  actionUrl: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  title: string;
  type: string;
  userId: string;
};

function harness(
  options: { badges?: BadgeRow[]; progress?: ProgressRow[]; user?: StoredUser } = {},
) {
  const badges = new Map<string, BadgeRow>(
    (options.badges ?? []).map((row) => [key(row.userId, row.badge), row]),
  );
  const progress = new Map<string, ProgressRow>(
    (options.progress ?? []).map((row) => [key(row.userId, row.badge), row]),
  );
  const calls = { badgeUpsert: 0, progressUpsert: 0, updateMany: 0 };
  const notifications: NotificationRow[] = [];
  let transactionTail = Promise.resolve();

  const store = {
    notification: {
      create: async (args: { data: NotificationRow }) => {
        notifications.push(args.data);
        return {
          ...args.data,
          createdAt: NOW,
          id: `notification-${notifications.length}`,
          imageUrl: null,
          read: false,
          readAt: null,
        };
      },
    },
    user: {
      findUnique: async () => options.user ?? null,
    },
    userBadge: {
      findMany: async (args: {
        where: {
          badge?: string;
          expiresAt?: { lt: Date };
          revokedAt?: null;
          userId?: string;
        };
      }) =>
        [...badges.values()].filter((row) => {
          const { where } = args;
          if (where.userId !== undefined && row.userId !== where.userId) {
            return false;
          }
          if (where.badge !== undefined && row.badge !== where.badge) {
            return false;
          }
          if (where.revokedAt === null && row.revokedAt !== null) {
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
        calls.badgeUpsert += 1;
        const rowKey = key(args.where.userId_badge.userId, args.where.userId_badge.badge);
        const existing = badges.get(rowKey);
        const next: BadgeRow = existing
          ? { ...existing, ...args.update }
          : {
              badge: args.create.badge,
              earnedAt: args.create.earnedAt ?? NOW,
              expiresAt: args.create.expiresAt ?? null,
              revokeReason: args.create.revokeReason ?? null,
              revokedAt: args.create.revokedAt ?? null,
              source: args.create.source ?? "AWARDED",
              tier: args.create.tier ?? 1,
              userId: args.create.userId,
            };
        badges.set(rowKey, next);
        return next;
      },
      updateMany: async (args: {
        data: Partial<BadgeRow>;
        where: { badge?: { in: string[] }; revokedAt?: null; userId?: string };
      }) => {
        calls.updateMany += 1;
        let count = 0;
        for (const [rowKey, row] of badges) {
          if (args.where.userId !== undefined && row.userId !== args.where.userId) {
            continue;
          }
          if (args.where.badge && !args.where.badge.in.includes(row.badge)) {
            continue;
          }
          if (args.where.revokedAt === null && row.revokedAt !== null) {
            continue;
          }
          badges.set(rowKey, { ...row, ...args.data });
          count += 1;
        }
        return { count };
      },
    },
    userBadgeProgress: {
      findMany: async (args: { where: { userId: string } }) =>
        [...progress.values()].filter((row) => row.userId === args.where.userId),
      findUnique: async (args: { where: { userId_badge: { badge: string; userId: string } } }) =>
        progress.get(key(args.where.userId_badge.userId, args.where.userId_badge.badge)) ?? null,
      upsert: async (args: {
        create: Partial<ProgressRow> & { badge: string; userId: string };
        update: Partial<ProgressRow>;
        where: { userId_badge: { badge: string; userId: string } };
      }) => {
        calls.progressUpsert += 1;
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
  } as unknown as BadgeStore;

  (
    store as unknown as {
      $transaction<T>(operation: (transaction: BadgeStore) => Promise<T>): Promise<T>;
    }
  ).$transaction = async <T>(operation: (transaction: BadgeStore) => Promise<T>) => {
    let release: (() => void) | undefined;
    const previous = transactionTail;
    transactionTail = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    await previous;
    try {
      return await operation(store);
    } finally {
      release?.();
    }
  };

  return { badges, calls, notifications, progress, store };
}

/**
 * The notification path is a socket emit and a push, neither of which exists in
 * a node test; both are counted instead of performed.
 */
function notifierSpy() {
  const emitted: string[] = [];
  const pushed: unknown[][] = [];

  return {
    emitted,
    notifier: {
      emitSocket: (userId: string) => {
        emitted.push(userId);
      },
      sendPush: async (rows: unknown[]) => {
        pushed.push(rows);
        return undefined;
      },
    } as unknown as NonNullable<Parameters<typeof advanceBadgeProgress>[0]["notifier"]>,
    pushed,
  };
}

function badgeRow(overrides: Partial<BadgeRow> & { badge: string }): BadgeRow {
  return {
    earnedAt: new Date("2026-07-01T00:00:00.000Z"),
    expiresAt: null,
    revokeReason: null,
    revokedAt: null,
    source: "AWARDED",
    tier: 1,
    userId: "user-1",
    ...overrides,
  };
}

function ids(badges: readonly { id: string }[]) {
  return badges.map((badge) => badge.id);
}

describe("deriveBadges", () => {
  const derived = (overrides: Partial<Parameters<typeof deriveBadges>[0]> = {}) =>
    deriveBadges({
      adminRole: null,
      emailVerified: false,
      hasActionedModerationCase: false,
      now: NOW,
      premiumSince: null,
      premiumType: "NONE",
      registeredAt: new Date("2026-06-01T00:00:00.000Z"),
      twoFactorEnabled: false,
      ...overrides,
    });

  it("keeps an ANALYST off the staff badge and gives it to every other role", () => {
    assert.equal(ids(derived({ adminRole: "ANALYST" })).includes("staff"), false);

    for (const role of ["OWNER", "ADMIN", "SUPPORT", "MODERATOR"] as const) {
      assert.equal(ids(derived({ adminRole: role })).includes("staff"), true, role);
    }
  });

  it("withholds verified from an account with an actioned moderation case", () => {
    assert.deepEqual(ids(derived({ emailVerified: true, twoFactorEnabled: true })), ["verified"]);
    assert.deepEqual(
      ids(
        derived({
          emailVerified: true,
          hasActionedModerationCase: true,
          twoFactorEnabled: true,
        }),
      ),
      [],
    );
  });

  it("opens supporter tier 2 on the 180th day and not the 179th", () => {
    const at = (days: number) =>
      derived({
        premiumSince: new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000),
        premiumType: "FULL",
      }).find((badge) => badge.id === "supporter")?.tier;

    assert.equal(at(0), 1);
    assert.equal(at(179), 1);
    assert.equal(at(180), 2);
  });

  it("walks veteran through the 365 / 730 / 1095 day boundaries", () => {
    const at = (days: number) =>
      derived({
        registeredAt: new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000),
      }).find((badge) => badge.id === "veteran")?.tier ?? 0;

    assert.equal(at(364), 0);
    assert.equal(at(365), 1);
    assert.equal(at(729), 1);
    assert.equal(at(730), 2);
    assert.equal(at(1094), 2);
    assert.equal(at(1095), 3);
  });
});

describe("advanceBadgeProgress", () => {
  it("counts a day once no matter how many events arrive on it", async () => {
    const { calls, store } = harness();
    const day = new Date("2026-08-05T00:00:00.000Z");

    const first = await advanceBadgeProgress({
      amount: 1,
      badge: "regular",
      day,
      mode: "increment",
      now: NOW,
      store,
      userId: "user-1",
    });
    const second = await advanceBadgeProgress({
      amount: 1,
      badge: "regular",
      day: new Date("2026-08-05T21:30:00.000Z"),
      mode: "increment",
      now: NOW,
      store,
      userId: "user-1",
    });

    assert.equal(first.value, 1);
    assert.equal(second.value, 1);
    assert.equal(calls.progressUpsert, 1);
  });

  it("extends a streak across one day, restarts it after a gap, and keeps the tier", async () => {
    const anchor = new Date("2026-08-01T00:00:00.000Z");
    const { badges, store } = harness({
      badges: [badgeRow({ badge: "streak", tier: 2 })],
      progress: [
        {
          badge: "streak",
          lastCountedDay: anchor,
          streakDays: 30,
          userId: "user-1",
          value: 30n,
        },
      ],
    });

    const continued = await advanceBadgeProgress({
      amount: 1,
      badge: "streak",
      day: new Date("2026-08-02T00:00:00.000Z"),
      mode: "increment",
      now: NOW,
      store,
      userId: "user-1",
    });
    assert.equal(continued.value, 31);
    assert.equal(continued.tier, 2);

    const restarted = await advanceBadgeProgress({
      amount: 1,
      badge: "streak",
      day: new Date("2026-08-04T00:00:00.000Z"),
      mode: "increment",
      now: NOW,
      store,
      userId: "user-1",
    });

    assert.equal(restarted.value, 1, "a broken run restarts the counter");
    assert.equal(restarted.tier, 2, "the tier already earned survives the break");
    assert.equal(badges.get("user-1:streak")?.tier, 2);
  });

  it("never writes a lower tier for anything but founder", async () => {
    const { badges, store } = harness({
      badges: [badgeRow({ badge: "inviter", tier: 3 }), badgeRow({ badge: "founder", tier: 2 })],
      progress: [
        { badge: "founder", lastCountedDay: null, streakDays: 0, userId: "user-1", value: 120n },
        { badge: "inviter", lastCountedDay: null, streakDays: 0, userId: "user-1", value: 50n },
      ],
    });

    const held = await advanceBadgeProgress({
      amount: 1,
      badge: "inviter",
      mode: "set",
      now: NOW,
      store,
      userId: "user-1",
    });
    assert.equal(held.tier, 3);
    assert.equal(badges.get("user-1:inviter")?.tier, 3);

    const demoted = await advanceBadgeProgress({
      amount: 30,
      badge: "founder",
      mode: "set",
      now: NOW,
      store,
      userId: "user-1",
    });
    assert.equal(demoted.previousTier, 2);
    assert.equal(demoted.tier, 1, "founder is the one badge whose tier may fall");
    assert.equal(badges.get("user-1:founder")?.tier, 1);
  });
});

describe("readUserBadges", () => {
  it("drops revoked, expired and suspended badges", async () => {
    const shared = {
      badges: [
        badgeRow({ badge: "inviter", tier: 2 }),
        badgeRow({ badge: "bugHunter", revokeReason: "abuse", revokedAt: NOW }),
        badgeRow({ badge: "event", expiresAt: new Date("2026-08-01T00:00:00.000Z") }),
      ],
      user: baseUser(),
    };

    const open = harness(shared);
    assert.deepEqual(ids(await readUserBadges({ now: NOW, store: open.store, userId: "user-1" })), [
      "inviter",
    ]);

    const banned = harness({ ...shared, user: baseUser({ isBanned: true }) });
    assert.deepEqual(await readUserBadges({ now: NOW, store: banned.store, userId: "user-1" }), []);

    const deleted = harness({ ...shared, user: baseUser({ deletedAt: NOW }) });
    assert.deepEqual(
      await readUserBadges({ now: NOW, store: deleted.store, userId: "user-1" }),
      [],
    );
  });

  it("returns the catalog order whatever order the rows arrive in", async () => {
    const rows = [
      badgeRow({ badge: "veteran", tier: 1 }),
      badgeRow({ badge: "inviter", tier: 1 }),
      badgeRow({ badge: "founder", tier: 1 }),
      badgeRow({ badge: "event", tier: 1 }),
    ];
    const expected = ["event", "founder", "inviter", "veteran"];

    const forward = harness({ badges: rows, user: baseUser() });
    assert.deepEqual(
      ids(await readUserBadges({ now: NOW, store: forward.store, userId: "user-1" })),
      expected,
    );

    const shuffled = harness({ badges: [...rows].reverse(), user: baseUser() });
    assert.deepEqual(
      ids(await readUserBadges({ now: NOW, store: shuffled.store, userId: "user-1" })),
      expected,
    );
  });

  it("suppresses a derived badge that carries a revocation marker row", async () => {
    const user = baseUser({ emailVerified: true, twoFactorEnabled: true });

    const clean = harness({ user });
    assert.deepEqual(
      ids(await readUserBadges({ now: NOW, store: clean.store, userId: "user-1" })),
      ["verified"],
    );

    const marked = harness({
      badges: [
        badgeRow({
          badge: "verified",
          revokeReason: "moderation:case-actioned",
          revokedAt: NOW,
          source: "DERIVED",
        }),
      ],
      user,
    });
    assert.deepEqual(await readUserBadges({ now: NOW, store: marked.store, userId: "user-1" }), []);
  });
});

describe("revokeBadges and readOwnBadgeProgress", () => {
  it("writes a marker row for a derived badge and closes stored ones", async () => {
    const { badges, store } = harness({
      badges: [badgeRow({ badge: "inviter", tier: 2 })],
      user: baseUser(),
    });

    const revoked = await revokeBadges({
      badges: ["inviter", "verified"],
      now: NOW,
      reason: "moderation:case-actioned",
      store,
      userId: "user-1",
    });

    assert.equal(revoked, 2);
    assert.equal(badges.get("user-1:inviter")?.revokedAt?.toISOString(), NOW.toISOString());
    assert.equal(badges.get("user-1:verified")?.source, "DERIVED");
    assert.equal(badges.get("user-1:verified")?.revokedAt?.toISOString(), NOW.toISOString());
  });

  it("reports the counter and the next threshold for the owner's own screen", async () => {
    const { store } = harness({
      progress: [
        { badge: "inviter", lastCountedDay: null, streakDays: 0, userId: "user-1", value: 12n },
        { badge: "voice", lastCountedDay: null, streakDays: 0, userId: "user-1", value: 400_000n },
      ],
    });

    assert.deepEqual(await readOwnBadgeProgress({ store, userId: "user-1" }), [
      { id: "inviter", nextThreshold: 50, tier: 2, value: 12 },
      { id: "voice", nextThreshold: null, tier: 2, value: 400_000 },
    ]);
  });
});

describe("badge notifications", () => {
  const promote = async (
    harnessValue: ReturnType<typeof harness>,
    spy: ReturnType<typeof notifierSpy>,
    overrides: Partial<Parameters<typeof advanceBadgeProgress>[0]> = {},
  ) =>
    advanceBadgeProgress({
      amount: 1,
      badge: "inviter",
      mode: "set",
      notifier: spy.notifier,
      now: NOW,
      store: harnessValue.store,
      userId: "user-1",
      ...overrides,
    });

  it("writes exactly one notification per tier promotion", async () => {
    const harnessValue = harness();
    const spy = notifierSpy();

    const first = await promote(harnessValue, spy);
    assert.equal(first.tier, 1);
    assert.equal(harnessValue.notifications.length, 1);
    assert.deepEqual(spy.emitted, ["user-1"]);
    assert.equal(spy.pushed.length, 1);

    // The same event again: the tier did not move, so nothing is announced.
    const second = await promote(harnessValue, spy);
    assert.equal(second.tier, 1);
    assert.equal(second.previousTier, 1);
    assert.equal(harnessValue.notifications.length, 1);
    assert.deepEqual(spy.emitted, ["user-1"]);
  });

  it("serializes concurrent increments and announces the winning promotion once", async () => {
    const harnessValue = harness();
    const spy = notifierSpy();

    const results = await Promise.all([
      advanceBadgeProgress({
        amount: 1,
        badge: "inviter",
        mode: "increment",
        notifier: spy.notifier,
        now: NOW,
        store: harnessValue.store,
        userId: "user-1",
      }),
      advanceBadgeProgress({
        amount: 1,
        badge: "inviter",
        mode: "increment",
        notifier: spy.notifier,
        now: NOW,
        store: harnessValue.store,
        userId: "user-1",
      }),
    ]);

    assert.equal(harnessValue.progress.get("user-1:inviter")?.value, 2n);
    assert.equal(harnessValue.notifications.length, 1);
    assert.equal(spy.emitted.length, 1);
    assert.deepEqual(
      results.map((result) => result.value).sort((left, right) => left - right),
      [1, 2],
    );
  });

  it("announces each new tier once as the badge climbs", async () => {
    const harnessValue = harness();
    const spy = notifierSpy();

    await promote(harnessValue, spy);
    await promote(harnessValue, spy, { amount: 10 });

    assert.equal(harnessValue.notifications.length, 2);
    assert.deepEqual(
      harnessValue.notifications.map((row) => (row.metadata as { tier: number }).tier),
      [1, 2],
    );
  });

  it("writes nothing when notify is false", async () => {
    const harnessValue = harness();
    const spy = notifierSpy();

    const result = await promote(harnessValue, spy, { notify: false });

    assert.equal(result.tier, 1);
    assert.equal(harnessValue.badges.size, 1);
    assert.equal(harnessValue.notifications.length, 0);
    assert.equal(spy.emitted.length, 0);
    assert.equal(spy.pushed.length, 0);
  });

  it("stays silent when a founder tier falls", async () => {
    const harnessValue = harness({
      badges: [badgeRow({ badge: "founder", tier: 2 })],
      progress: [
        { badge: "founder", lastCountedDay: null, streakDays: 0, userId: "user-1", value: 120n },
      ],
    });
    const spy = notifierSpy();

    const result = await advanceBadgeProgress({
      amount: 30,
      badge: "founder",
      mode: "set",
      notifier: spy.notifier,
      now: NOW,
      store: harnessValue.store,
      userId: "user-1",
    });

    assert.equal(result.previousTier, 2);
    assert.equal(result.tier, 1);
    assert.equal(harnessValue.badges.get("user-1:founder")?.tier, 1);
    assert.equal(harnessValue.notifications.length, 0);
    assert.equal(spy.emitted.length, 0);
  });

  it("carries badgeId and tier in metadata and never the badge name", async () => {
    const harnessValue = harness();
    const spy = notifierSpy();

    await promote(harnessValue, spy);
    const [notification] = harnessValue.notifications;

    assert.ok(notification);
    assert.equal(notification.type, "BADGE");
    assert.equal(notification.userId, "user-1");
    assert.equal(notification.actionUrl, BADGE_NOTIFICATION_ACTION_PATH);
    assert.deepEqual(notification.metadata, { badgeId: "inviter", tier: 1 });

    // 07 kabul 4: the name is rendered from the catalog on the client, so a
    // language switch cannot leave the row stuck in the language it was written
    // in. Both languages of every catalog name must stay out of the row.
    const written = `${notification.title} ${notification.body}`.toLocaleLowerCase("tr");
    for (const id of BADGE_IDS) {
      for (const locale of ["en", "tr"] as const) {
        const name = BADGE_CATALOG[id].copy[locale].name.toLocaleLowerCase("tr");
        assert.equal(written.includes(name), false, `${id}:${locale}`);
      }
    }
  });
});
