import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ONLINE_SORT_POOL,
  buildDiscoverCategoryCounts,
  buildDiscoverServerWhere,
  decodeDiscoverCursor,
  encodeDiscoverCursor,
  paginateOnlineServerPool,
} from "./servers-service";
import * as serversService from "./servers-service";

describe("discover servers cursor", () => {
  it("encodes and decodes every sort and phase", () => {
    for (const [sort, phase, value, marker] of [
      ["popular", "featured", 48_200, "p"],
      ["popular", "rest", 31_500, "p"],
      ["online", "featured", 3_910, "o"],
      ["online", "rest", 2_140, "o"],
      ["new", "featured", 1_787_310_000_000, "n"],
      ["new", "rest", 1_787_300_000_000, "n"],
    ] as const) {
      const encoded = encodeDiscoverCursor({ id: "server-1", phase, sort, value });

      assert.equal(encoded, `${marker}|${phase === "featured" ? "f" : "r"}|${value}|server-1`);
      assert.deepEqual(decodeDiscoverCursor(encoded, sort), {
        id: "server-1",
        phase,
        sort,
        value,
      });
    }
  });

  it("rejects malformed cursors and a cursor from another sort", () => {
    for (const cursor of [
      "",
      "p|r|12",
      "x|r|12|server-1",
      "p|x|12|server-1",
      "p|r|-1|server-1",
      "p|r|1.5|server-1",
      "p|r|12|",
      "p|r|12|server|extra",
    ]) {
      assert.equal(decodeDiscoverCursor(cursor, "popular"), null, cursor);
    }

    assert.equal(decodeDiscoverCursor("p|r|12|server-1", "online"), null);
    assert.equal(decodeDiscoverCursor("n|r|9007199254740991|server-1", "new"), null);
  });
});

describe("discover server category counts", () => {
  it("includes uncategorized servers only in all", () => {
    const categories = buildDiscoverCategoryCounts([
      { _count: { _all: 2 }, category: null },
      { _count: { _all: 4 }, category: "OYUN" },
      { _count: { _all: 3 }, category: "CALISMA" },
    ]);

    assert.deepEqual(
      categories.map(({ count, initials, key, label }) => ({ count, initials, key, label })),
      [
        { count: 9, initials: "TÜ", key: "all", label: "" },
        { count: 4, initials: "OY", key: "oyun", label: "" },
        { count: 0, initials: "İŞ", key: "is", label: "" },
        { count: 3, initials: "ÇA", key: "calisma", label: "" },
        { count: 0, initials: "Kİ", key: "kisisel", label: "" },
        { count: 0, initials: "DE", key: "destek", label: "" },
      ],
    );
  });
});

describe("discover server search predicate", () => {
  it("searches name, description, exact normalized tag, and category hint", () => {
    assert.deepEqual(
      buildDiscoverServerWhere({ category: "all", categoryHint: "calisma", query: "  DIL  " }),
      {
        OR: [
          { name: { contains: "DIL", mode: "insensitive" } },
          { description: { contains: "DIL", mode: "insensitive" } },
          { tags: { has: "dil" } },
          { category: "CALISMA" },
        ],
        discoverable: true,
        isPublic: true,
      },
    );
  });

  it("applies selected category independently and ignores a hint without q", () => {
    assert.deepEqual(buildDiscoverServerWhere({ category: "oyun", categoryHint: "destek" }), {
      category: "OYUN",
      discoverable: true,
      isPublic: true,
    });
  });

  it("preserves ASCII tag slug casing rules", () => {
    const where = buildDiscoverServerWhere({ category: "all", query: "AI" });

    assert.deepEqual(where.OR?.[2], { tags: { has: "ai" } });
  });
});

describe("discover online pool", () => {
  it("sorts by online count descending then id ascending and paginates by cursor", () => {
    const rows = [{ id: "c" }, { id: "b" }, { id: "a" }, { id: "d" }];
    const counts = new Map([
      ["a", 9],
      ["b", 7],
      ["c", 7],
      ["d", 1],
    ]);

    const first = paginateOnlineServerPool(rows, counts, { limit: 2, totalCount: 4 });
    assert.deepEqual(
      first.rows.map((row) => row.id),
      ["a", "b"],
    );
    assert.equal(first.nextCursor, "o|r|7|b");
    assert.equal(first.truncated, false);

    const second = paginateOnlineServerPool(rows, counts, {
      cursor: decodeDiscoverCursor(first.nextCursor ?? "", "online"),
      limit: 2,
      totalCount: 4,
    });
    assert.deepEqual(
      second.rows.map((row) => row.id),
      ["c", "d"],
    );
    assert.equal(second.nextCursor, null);
  });

  it("marks a 200-row pool as truncated when more matches exist", () => {
    const rows = Array.from({ length: ONLINE_SORT_POOL }, (_, index) => ({
      id: `server-${String(index).padStart(3, "0")}`,
    }));
    const result = paginateOnlineServerPool(rows, new Map(), {
      limit: 24,
      totalCount: ONLINE_SORT_POOL + 1,
    });

    assert.equal(result.rows.length, 24);
    assert.equal(result.truncated, true);
    assert.notEqual(result.nextCursor, null);
  });
});

function serverRow(
  id: string,
  overrides: Partial<{
    category: "OYUN" | "IS" | "CALISMA" | "KISISEL" | "DESTEK" | null;
    createdAt: Date;
    features: string[];
    memberCount: number;
    name: string;
  }> = {},
) {
  return {
    bannerUrl: null,
    category: overrides.category ?? "OYUN",
    createdAt: overrides.createdAt ?? new Date("2026-08-20T10:00:00.000Z"),
    description: `${id} açıklaması`,
    features: overrides.features ?? [],
    iconColor: null,
    iconUrl: null,
    id,
    languages: ["tr"],
    memberCount: overrides.memberCount ?? 10,
    name: overrides.name ?? id,
    shortName: `${id}WHS`.slice(0, 3).toLocaleUpperCase("tr-TR"),
    tags: ["oyun"],
    type: "COMMUNITY" as const,
  };
}

describe("list discover servers orchestration", () => {
  it("builds first popular page, metadata, memberships, and one online batch", async () => {
    const featured = serverRow("f1", {
      features: ["FEATURED"],
      memberCount: 30,
      name: "Öne Çıkan",
    });
    const rest = serverRow("r1", { memberCount: 20, name: "Katıldığım" });
    const extra = serverRow("r2", { memberCount: 10 });
    const calls: string[] = [];

    const page = await serversService.listDiscoverServersWithDependencies(
      "viewer-1",
      { category: "all", limit: 2, sort: "popular" },
      {
        countOnlineMembers: async (ids: readonly string[]) => {
          calls.push(`online:${ids.join(",")}`);
          return new Map([
            ["f1", 7],
            ["r1", 5],
          ]);
        },
        countServers: async () => 3,
        fetchOnlinePool: async () => {
          throw new Error("online pool must not run for popular sort");
        },
        fetchPhaseRows: async ({ featured: isFeatured }: { featured: boolean }) =>
          isFeatured ? [featured] : [rest, extra],
        findFeatured: async () => featured,
        findJoinedServerIds: async (userId: string, ids: readonly string[]) => {
          calls.push(`joined:${userId}:${ids.join(",")}`);
          return new Set(["r1"]);
        },
        groupCategoryCounts: async () => [
          { _count: { _all: 2 }, category: "OYUN" as const },
          { _count: { _all: 1 }, category: null },
        ],
        logOnlinePoolTruncated: () => {
          throw new Error("popular sort must not log online pool truncation");
        },
      },
    );

    assert.deepEqual(
      page.items.map(({ id, joined, onlineCount }) => ({ id, joined, onlineCount })),
      [
        { id: "f1", joined: false, onlineCount: 7 },
        { id: "r1", joined: true, onlineCount: 5 },
      ],
    );
    assert.equal(page.nextCursor, "p|r|20|r1");
    assert.equal(page.totalCount, 3);
    assert.equal(page.categories?.[0]?.count, 3);
    assert.equal(page.featured?.id, "f1");
    assert.deepEqual(calls, ["online:f1,r1", "joined:viewer-1:f1,r1"]);
  });

  it("uses the 200-row online pool, logs truncation, and suppresses metadata after a cursor", async () => {
    const pool = Array.from({ length: ONLINE_SORT_POOL }, (_, index) =>
      serverRow(`s${String(index).padStart(3, "0")}`, { memberCount: ONLINE_SORT_POOL - index }),
    );
    const logs: Array<{ pool: number; total: number }> = [];
    let categoryQueries = 0;
    let featuredQueries = 0;

    const page = await serversService.listDiscoverServersWithDependencies(
      "viewer-1",
      {
        category: "all",
        cursor: "o|r|198|s001",
        limit: 2,
        sort: "online",
      },
      {
        countOnlineMembers: async (ids: readonly string[]) =>
          new Map(ids.map((id) => [id, ONLINE_SORT_POOL - Number(id.slice(1))])),
        countServers: async () => ONLINE_SORT_POOL + 1,
        fetchOnlinePool: async ({ take }: { take: number }) => {
          assert.equal(take, ONLINE_SORT_POOL);
          return pool;
        },
        fetchPhaseRows: async () => {
          throw new Error("DB phase paging must not run for online sort");
        },
        findFeatured: async () => {
          featuredQueries += 1;
          return null;
        },
        findJoinedServerIds: async () => new Set(),
        groupCategoryCounts: async () => {
          categoryQueries += 1;
          return [];
        },
        logOnlinePoolTruncated: (entry: { pool: number; total: number }) => logs.push(entry),
      },
    );

    assert.deepEqual(
      page.items.map((item) => item.id),
      ["s002", "s003"],
    );
    assert.equal(page.categories, null);
    assert.equal(page.featured, null);
    assert.equal(categoryQueries, 0);
    assert.equal(featuredQueries, 0);
    assert.deepEqual(logs, [{ pool: ONLINE_SORT_POOL, total: ONLINE_SORT_POOL + 1 }]);
  });

  it("carries new-sort keysets across featured and rest phases", async () => {
    const f1 = serverRow("f1", {
      createdAt: new Date("2026-08-21T12:00:00.000Z"),
      features: ["FEATURED"],
    });
    const f2 = serverRow("f2", {
      createdAt: new Date("2026-08-21T11:00:00.000Z"),
      features: ["FEATURED"],
    });
    const f3 = serverRow("f3", {
      createdAt: new Date("2026-08-21T10:00:00.000Z"),
      features: ["FEATURED"],
    });
    const r1 = serverRow("r1", { createdAt: new Date("2026-08-21T09:00:00.000Z") });
    const r2 = serverRow("r2", { createdAt: new Date("2026-08-21T08:00:00.000Z") });

    const dependencies = {
      countOnlineMembers: async () => new Map<string, number>(),
      countServers: async () => 5,
      fetchOnlinePool: async () => [],
      fetchPhaseRows: async (input: {
        cursor: { phase: "featured" | "rest" } | null;
        featured: boolean;
      }) => {
        if (input.featured) {
          return input.cursor === null ? [f1, f2, f3] : [f3];
        }
        return input.cursor === null ? [r1, r2] : [r2];
      },
      findFeatured: async () => f1,
      findJoinedServerIds: async () => new Set<string>(),
      groupCategoryCounts: async () => [],
      logOnlinePoolTruncated: () => undefined,
    };

    const first = await serversService.listDiscoverServersWithDependencies(
      "viewer-1",
      { category: "all", limit: 2, sort: "new" },
      dependencies,
    );
    assert.ok(first.nextCursor);
    const second = await serversService.listDiscoverServersWithDependencies(
      "viewer-1",
      { category: "all", cursor: first.nextCursor, limit: 2, sort: "new" },
      dependencies,
    );
    assert.ok(second.nextCursor);
    const third = await serversService.listDiscoverServersWithDependencies(
      "viewer-1",
      { category: "all", cursor: second.nextCursor, limit: 2, sort: "new" },
      dependencies,
    );

    assert.deepEqual(
      first.items.map((item) => item.id),
      ["f1", "f2"],
    );
    assert.equal(first.nextCursor, `n|f|${f2.createdAt.getTime()}|f2`);
    assert.deepEqual(
      second.items.map((item) => item.id),
      ["f3", "r1"],
    );
    assert.equal(second.nextCursor, `n|r|${r1.createdAt.getTime()}|r1`);
    assert.deepEqual(
      third.items.map((item) => item.id),
      ["r2"],
    );
    assert.equal(third.nextCursor, null);
  });
});
