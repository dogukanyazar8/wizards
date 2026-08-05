import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveBadgeRarityDisplay } from "@wizards/types";
import {
  computeBadgeRarity,
  readBadgeRarity,
  rollUpBadgeRarity,
  type BadgeRarityCache,
  type BadgeRarityStore,
} from "@/lib/badges/badge-rarity";

const NOW = new Date("2026-08-05T12:00:00.000Z");

function cacheStub(initial: string | null = null) {
  let value = initial;
  const writes: string[] = [];

  const cache: BadgeRarityCache = {
    read: async () => value,
    write: async (payload) => {
      writes.push(payload);
      value = payload;
    },
  };

  return { cache, writes };
}

function storeStub(options: {
  groups?: Array<{ badge: string; count: number; tier: number }>;
  totalUsers?: number;
}) {
  const queries: unknown[] = [];

  const store = {
    user: {
      count: async (args: unknown) => {
        queries.push(args);
        return options.totalUsers ?? 0;
      },
    },
    userBadge: {
      groupBy: async (args: unknown) => {
        queries.push(args);
        return (options.groups ?? []).map((group) => ({
          _count: { _all: group.count },
          badge: group.badge,
          tier: group.tier,
        }));
      },
    },
  } as unknown as BadgeRarityStore;

  return { queries, store };
}

describe("badge rarity", () => {
  it("collapses tiers into one holder count per badge", async () => {
    const { store } = storeStub({
      groups: [
        { badge: "veteran", count: 20, tier: 1 },
        { badge: "veteran", count: 5, tier: 2 },
        { badge: "streak", count: 8, tier: 1 },
        // A catalog id that no longer exists must not reach the payload.
        { badge: "ghost", count: 99, tier: 1 },
      ],
      totalUsers: 1_000,
    });

    const summary = await computeBadgeRarity({ now: NOW, store });

    assert.deepEqual(summary.badges, [
      { holders: 8, id: "streak" },
      { holders: 25, id: "veteran" },
    ]);
    assert.equal(summary.totalUsers, 1_000);
    assert.equal(summary.computedAt, NOW.toISOString());
  });

  it("hides the percentage below the population floor and prints one decimal above it", () => {
    // 08 §4: under 500 accounts a percentage is misleading and weakens
    // de-identification, so there is no number to print at all.
    assert.deepEqual(resolveBadgeRarityDisplay({ holders: 3, totalUsers: 499 }), {
      kind: "hidden",
    });
    assert.deepEqual(resolveBadgeRarityDisplay({ holders: 0, totalUsers: 5_000 }), {
      kind: "hidden",
    });
    assert.deepEqual(resolveBadgeRarityDisplay({ holders: 1, totalUsers: 5_000 }), {
      kind: "below-one",
    });
    assert.deepEqual(resolveBadgeRarityDisplay({ holders: 63, totalUsers: 1_000 }), {
      kind: "percent",
      percent: 6.3,
    });
  });

  it("computes once a day and serves the cached summary in between", async () => {
    const { cache, writes } = cacheStub();
    const { queries, store } = storeStub({
      groups: [{ badge: "streak", count: 4, tier: 1 }],
      totalUsers: 900,
    });

    const first = await rollUpBadgeRarity({ cache, now: NOW, store });
    assert.equal(first.computed, true);
    assert.equal(writes.length, 1);

    const anHourLater = await rollUpBadgeRarity({
      cache,
      now: new Date(NOW.getTime() + 60 * 60 * 1000),
      store,
    });
    assert.equal(anHourLater.computed, false, "an hourly pass must not recount");
    assert.equal(writes.length, 1);

    const nextDay = await rollUpBadgeRarity({
      cache,
      now: new Date(NOW.getTime() + 25 * 60 * 60 * 1000),
      store,
    });
    assert.equal(nextDay.computed, true);
    assert.equal(writes.length, 2);
    assert.equal(queries.length, 4, "two rollups, two queries each");
  });

  it("reads without touching the database and degrades to an empty summary", async () => {
    const summary = await computeBadgeRarity({
      now: NOW,
      store: storeStub({ groups: [{ badge: "voice", count: 12, tier: 1 }], totalUsers: 800 }).store,
    });
    const { cache } = cacheStub(JSON.stringify(summary));

    assert.deepEqual(await readBadgeRarity({ cache }), summary);

    // Nothing computed yet, unreadable payload, unreachable cache: all three
    // answer with the same empty summary rather than a failed request.
    assert.deepEqual(await readBadgeRarity({ cache: cacheStub(null).cache }), {
      badges: [],
      computedAt: null,
      totalUsers: 0,
    });
    assert.deepEqual(await readBadgeRarity({ cache: cacheStub("{not json").cache }), {
      badges: [],
      computedAt: null,
      totalUsers: 0,
    });
    assert.deepEqual(
      await readBadgeRarity({
        cache: {
          read: async () => {
            throw new Error("cache unreachable");
          },
          write: async () => undefined,
        },
      }),
      { badges: [], computedAt: null, totalUsers: 0 },
    );
  });
});
