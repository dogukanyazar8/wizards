import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildServerDiscoveryCard,
  decodeServerDiscoveryCursor,
  encodeServerDiscoveryCursor,
  listDiscoverableServersWithDatabase,
  type ServerDiscoveryCardSource,
} from "@/lib/servers/server-discovery-service";

function buildSource(
  overrides: Partial<ServerDiscoveryCardSource> = {},
): ServerDiscoveryCardSource {
  return {
    bannerUrl: null,
    description: "Yol haritasını burada tartışıyoruz.",
    features: ["VERIFIED"],
    iconColor: "warning",
    iconUrl: null,
    id: "s1",
    memberCount: 12_400,
    name: "Whispr Topluluk",
    shortName: "WT",
    tags: ["sohbet"],
    type: "COMMUNITY",
    ...overrides,
  } as ServerDiscoveryCardSource;
}

describe("buildServerDiscoveryCard", () => {
  it("carries the raw identity and count fields through untouched", () => {
    const card = buildServerDiscoveryCard(buildSource(), 42);

    assert.equal(card.id, "s1");
    assert.equal(card.name, "Whispr Topluluk");
    assert.equal(card.shortName, "WT");
    assert.equal(card.iconColor, "warning");
    assert.equal(card.memberCount, 12_400);
    assert.equal(card.onlineCount, 42);
    assert.equal(card.type, "COMMUNITY");
  });

  it("derives verified from the features array, matching the profile card's rule", () => {
    const verified = buildServerDiscoveryCard(buildSource({ features: ["VERIFIED"] }), 0);
    const unverified = buildServerDiscoveryCard(buildSource({ features: [] }), 0);

    assert.equal(verified.verified, true);
    assert.equal(unverified.verified, false);
  });

  it("defaults a null description to an empty string", () => {
    const card = buildServerDiscoveryCard(buildSource({ description: null }), 0);

    assert.equal(card.description, "");
  });

  it("carries no channel, friend, or permission data -- the card is a strict subset", () => {
    const card = buildServerDiscoveryCard(buildSource(), 0);

    assert.deepEqual(Object.keys(card).sort(), [
      "bannerUrl",
      "description",
      "iconColor",
      "iconUrl",
      "id",
      "memberCount",
      "name",
      "onlineCount",
      "shortName",
      "tags",
      "type",
      "verified",
    ]);
  });
});

describe("server discovery cursor", () => {
  it("round-trips both phases through encode and decode", () => {
    const rest = encodeServerDiscoveryCursor({ id: "s1", memberCount: 12_400, phase: "rest" });
    const featured = encodeServerDiscoveryCursor({
      id: "s1",
      memberCount: 12_400,
      phase: "featured",
    });

    assert.equal(rest, "r|12400|s1");
    assert.equal(featured, "f|12400|s1");
    assert.deepEqual(decodeServerDiscoveryCursor(rest), {
      id: "s1",
      memberCount: 12_400,
      phase: "rest",
    });
    assert.deepEqual(decodeServerDiscoveryCursor(featured), {
      id: "s1",
      memberCount: 12_400,
      phase: "featured",
    });
  });

  it("treats a malformed cursor as absent instead of throwing", () => {
    assert.equal(decodeServerDiscoveryCursor("not-a-cursor"), null);
    assert.equal(decodeServerDiscoveryCursor("r||s1"), null);
    assert.equal(decodeServerDiscoveryCursor("r|abc|s1"), null);
    assert.equal(decodeServerDiscoveryCursor("r|12400|"), null);
    assert.equal(decodeServerDiscoveryCursor("x|12400|s1"), null);
    // The phase marker is not optional: the S3-era two-part cursor is rejected
    // rather than silently read as a rest-phase keyset.
    assert.equal(decodeServerDiscoveryCursor("12400|s1"), null);
  });
});

type DiscoveryRawQuery = { sql: string; text: string; values: unknown[] };

function isFeaturedQuery(args: unknown): boolean {
  const record = args as { sql?: string; where?: Record<string, unknown> };

  // A `$queryRaw` call (the deep-cursor path, Finding 6): the rendered SQL
  // carries the same `"features" @>` / `NOT (...)` distinction the old
  // `where` shape used to.
  if (typeof record.sql === "string") {
    return record.sql.includes('"features" @>') && !record.sql.includes("NOT (");
  }

  const where = record.where ?? {};
  return "features" in where;
}

/**
 * The list runs two queries now (featured, then the rest), so the double has to
 * answer them separately -- returning the same rows to both would hide the
 * phase split instead of testing it.
 *
 * `cursorIds` doubles the deep-cursor raw-query path (Finding 6):
 * `$queryRaw` returns those ids for whichever phase's SQL text matches, and
 * the hydration `findMany` (`where: { id: { in } } }`) looks the rows up from
 * `rows`/`featuredRows` -- deliberately returned in the REVERSE of the
 * requested id order, so a test can assert the caller re-sorts back to the
 * id order instead of trusting `IN`. Existing no-cursor tests never reach
 * either of these: the plain (no-cursor) `findMany` branch below is
 * byte-for-byte what it was before Finding 6.
 */
function fakeDatabase(
  rows: ServerDiscoveryCardSource[],
  featuredRows: ServerDiscoveryCardSource[] = [],
  cursorIds: { featured?: string[]; rest?: string[] } = {},
) {
  const calls: unknown[] = [];
  const byId = new Map([...rows, ...featuredRows].map((row) => [row.id, row]));

  return {
    calls,
    database: {
      $queryRaw: async (query: DiscoveryRawQuery) => {
        calls.push(query);
        const ids = (isFeaturedQuery(query) ? cursorIds.featured : cursorIds.rest) ?? [];
        return ids.map((id) => ({ id }));
      },
      server: {
        findMany: async (args: unknown) => {
          calls.push(args);
          const where = (args as { where?: { id?: { in?: string[] } } }).where;

          if (where?.id?.in) {
            return [...where.id.in].reverse().flatMap((id) => {
              const row = byId.get(id);
              return row ? [row] : [];
            });
          }

          return isFeaturedQuery(args) ? featuredRows : rows;
        },
      },
    } as never,
  };
}

function fakeBatchRedis(counts: Record<string, number> = {}) {
  return {
    pipeline() {
      const keys: string[] = [];
      const chain = {
        exec: async () =>
          keys.map((key) => {
            const id = key.split(":")[1];
            return [null, counts[id ?? ""] ?? 0] as [Error | null, unknown];
          }),
        scard(key: string) {
          keys.push(key);
          return chain;
        },
      };
      return chain;
    },
    status: "ready" as const,
  } as never;
}

describe("listDiscoverableServersWithDatabase", () => {
  it("queries discoverable, public servers ordered by memberCount desc with an id tiebreaker", async () => {
    const { calls, database } = fakeDatabase([]);

    await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {});

    const featuredArgs = calls[0] as Record<string, unknown>;
    assert.deepEqual(featuredArgs.where, {
      discoverable: true,
      isPublic: true,
      features: { has: "FEATURED" },
    });
    assert.deepEqual(featuredArgs.orderBy, [{ memberCount: "desc" }, { id: "desc" }]);
    assert.equal(featuredArgs.take, 21);

    const restArgs = calls[1] as Record<string, unknown>;
    assert.deepEqual(restArgs.where, {
      discoverable: true,
      isPublic: true,
      NOT: { features: { has: "FEATURED" } },
    });
    assert.deepEqual(restArgs.orderBy, [{ memberCount: "desc" }, { id: "desc" }]);
    assert.equal(restArgs.take, 21);
  });

  it("puts featured servers above the rest, keeping each phase's own order", async () => {
    const { database } = fakeDatabase(
      [buildSource({ id: "big", memberCount: 9_000 })],
      [buildSource({ id: "featured-small", memberCount: 3 })],
    );

    const page = await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {});

    assert.deepEqual(
      page.servers.map((server) => server.id),
      ["featured-small", "big"],
    );
  });

  it("stops asking for featured rows once the cursor is in the rest phase", async () => {
    const { calls, database } = fakeDatabase([]);

    await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), { cursor: "r|100|s5" });

    assert.equal(calls.length, 1);
    assert.equal(isFeaturedQuery(calls[0]), false);
  });

  it("keeps the cursor in the featured phase when a page ends on the last featured row", async () => {
    const featured = [
      buildSource({ id: "f1", memberCount: 300 }),
      buildSource({ id: "f2", memberCount: 200 }),
    ];
    // The rest query still has rows; the page is simply full of featured ones.
    const { database } = fakeDatabase([buildSource({ id: "r1", memberCount: 100 })], featured);

    const page = await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {
      limit: 2,
    });

    assert.deepEqual(
      page.servers.map((server) => server.id),
      ["f1", "f2"],
    );
    assert.equal(page.nextCursor, "f|200|f2");
  });

  it("carries a featured-phase cursor into the featured query's row-value keyset, then starts the rest phase over once featured is exhausted", async () => {
    const { calls, database } = fakeDatabase([], [], { featured: [] });

    await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), { cursor: "f|200|f2" });

    assert.equal(calls.length, 2);

    // Featured phase: the cursor applies, so this goes through the raw
    // row-value keyset query instead of Prisma's `findMany` (Finding 6 --
    // Prisma cannot express `(memberCount, id) < (...)`).
    const featuredQuery = calls[0] as DiscoveryRawQuery;
    assert.match(featuredQuery.text, /"features" @> ARRAY/);
    assert.doesNotMatch(featuredQuery.text, /NOT \(/);
    assert.match(featuredQuery.text, /\("memberCount", "id"\) < \(\$\d+, \$\d+\)/);
    assert.deepEqual(featuredQuery.values, ["FEATURED", 200, "f2", 21]);

    // Featured is exhausted (the fixture returns no ids), so the rest phase
    // starts from its own beginning -- no cursor applies to it, so it stays
    // on the plain, already-index-served `findMany` path.
    const restArgs = calls[1] as Record<string, unknown>;
    assert.deepEqual(restArgs.where, {
      discoverable: true,
      isPublic: true,
      NOT: { features: { has: "FEATURED" } },
    });
  });

  it("does not sort in application code -- it trusts the query's ordering as-is", async () => {
    // Rows arrive already out of memberCount order; the service must not
    // re-sort them, since S3 binding decision 3 requires the index -- not
    // application code -- to be the source of ordering.
    const { database } = fakeDatabase([
      buildSource({ id: "low", memberCount: 5 }),
      buildSource({ id: "high", memberCount: 500 }),
    ]);

    const page = await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {});

    assert.deepEqual(
      page.servers.map((server) => server.id),
      ["low", "high"],
    );
  });

  it("matches a query against the name or an exact tag when a query is given", async () => {
    const { calls, database } = fakeDatabase([]);

    await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), { query: "Whispr" });

    for (const args of calls as Array<Record<string, unknown>>) {
      // 6d sends the tag's own text when a chip is tapped, so the tag arm is an
      // exact (lowercased) containment test while free typing still falls back
      // to the name `contains` this always had.
      assert.deepEqual((args.where as Record<string, unknown>).OR, [
        { name: { contains: "Whispr", mode: "insensitive" } },
        { tags: { has: "whispr" } },
      ]);
    }
  });

  it("encodes a cursor's keyset predicate as a row-value comparison, not an OR clause", async () => {
    const { calls, database } = fakeDatabase([], [], { rest: [] });

    await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {
      cursor: "r|100|s5",
    });

    // Rest phase only -- the featured phase is skipped entirely once the
    // cursor is already in the rest phase (see the "stops asking" test).
    assert.equal(calls.length, 1);
    const query = calls[0] as DiscoveryRawQuery;

    // Finding 6: this used to be `OR: [{ memberCount: { lt: 100 } }, { id: {
    // lt: "s5" }, memberCount: 100 }]`, a shape Postgres cannot fold into an
    // index condition (it degrades to a `Filter` that walks from the top of
    // the index). A row-value comparison is the sargable equivalent.
    assert.doesNotMatch(query.text, /\bOR\b/);
    assert.match(query.text, /\("memberCount", "id"\) < \(\$\d+, \$\d+\)/);
    assert.deepEqual(query.values, ["FEATURED", 100, "s5", 21]);
  });

  it("hydrates a deep-cursor page and re-sorts it back to the raw query's id order", async () => {
    const rowA = buildSource({ id: "a", memberCount: 300 });
    const rowB = buildSource({ id: "b", memberCount: 200 });
    const rowC = buildSource({ id: "c", memberCount: 100 });
    const { database } = fakeDatabase([rowA, rowB, rowC], [], { rest: ["a", "b", "c"] });

    const page = await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {
      cursor: "r|500|z9",
    });

    assert.deepEqual(
      page.servers.map((server) => server.id),
      ["a", "b", "c"],
    );
  });

  it("does not issue a hydration query when the raw keyset query returns no ids", async () => {
    const { calls, database } = fakeDatabase([], [], { rest: [] });

    const page = await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {
      cursor: "r|500|z9",
    });

    assert.deepEqual(page.servers, []);
    // Just the raw keyset query -- no hydration `findMany` for an empty id list.
    assert.equal(calls.length, 1);
  });

  it("combines a search filter with the row-value keyset in the same raw query", async () => {
    const { calls, database } = fakeDatabase([], [], { rest: [] });

    await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {
      cursor: "r|100|s5",
      query: "whispr",
    });

    assert.equal(calls.length, 1);
    const query = calls[0] as DiscoveryRawQuery;
    assert.match(query.text, /"name" ILIKE/);
    assert.match(query.text, /"tags" @> ARRAY\[\$\d+\]::text\[\]/);
    assert.match(query.text, /\("memberCount", "id"\) < \(\$\d+, \$\d+\)/);
    assert.deepEqual(query.values, ["FEATURED", "%whispr%", "whispr", 100, "s5", 21]);
  });

  it("returns a null cursor when the page is not full", async () => {
    const { database } = fakeDatabase([buildSource({ id: "s1" })]);

    const page = await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {
      limit: 20,
    });

    assert.equal(page.nextCursor, null);
  });

  it("returns an encoded cursor for the last visible row when there is another page", async () => {
    const rows = [
      buildSource({ id: "s1", memberCount: 300 }),
      buildSource({ id: "s2", memberCount: 200 }),
      buildSource({ id: "s3", memberCount: 100 }),
    ];
    const { database } = fakeDatabase(rows);

    const page = await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), {
      limit: 2,
    });

    assert.equal(page.servers.length, 2);
    assert.equal(
      page.nextCursor,
      encodeServerDiscoveryCursor({ id: "s2", memberCount: 200, phase: "rest" }),
    );
  });

  it("clamps limit into [1, 50] and requests one extra row for the has-more check", async () => {
    const { calls, database } = fakeDatabase([]);

    await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), { limit: 500 });
    await listDiscoverableServersWithDatabase(database, fakeBatchRedis(), { limit: 0 });

    assert.equal((calls[0] as Record<string, unknown>).take, 51);
    assert.equal((calls[2] as Record<string, unknown>).take, 2);
  });

  it("merges each card's online count from the single batched pipeline read", async () => {
    const rows = [buildSource({ id: "s1" }), buildSource({ id: "s2" })];
    const { database } = fakeDatabase(rows);

    const page = await listDiscoverableServersWithDatabase(
      database,
      fakeBatchRedis({ s1: 4, s2: 9 }),
      {},
    );

    assert.deepEqual(
      page.servers.map((server) => [server.id, server.onlineCount]),
      [
        ["s1", 4],
        ["s2", 9],
      ],
    );
  });
});
