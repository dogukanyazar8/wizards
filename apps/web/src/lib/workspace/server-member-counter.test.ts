import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectServerMemberCountDrift,
  decrementServerMemberCount,
  decrementServerMemberCounts,
  incrementServerMemberCount,
  reserveServerMemberCapacity,
  recomputeServerMemberCount,
} from "@/lib/workspace/server-member-counter";

function buildClient(affectedRows = 1) {
  const rawQueries: string[] = [];
  const rawValues: unknown[][] = [];
  const updates: unknown[] = [];

  return {
    client: {
      $executeRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
        rawQueries.push(`${query.join("?")}|${values.join(",")}`);
        rawValues.push(values);
        return affectedRows;
      },
      server: {
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        },
      },
    },
    rawQueries,
    rawValues,
    updates,
  };
}

describe("server member counter", () => {
  it("increments through Prisma because overflow is not a risk", async () => {
    const { client, rawQueries, updates } = buildClient();

    await incrementServerMemberCount(client as never, "s1");

    assert.equal(rawQueries.length, 0);
    assert.deepEqual(updates, [{ data: { memberCount: { increment: 1 } }, where: { id: "s1" } }]);
  });

  it("reserves one public-join slot with one conditional database mutation", async () => {
    const { client, rawQueries, rawValues, updates } = buildClient(1);

    const reserved = await reserveServerMemberCapacity(client as never, "s1");

    assert.equal(reserved, true);
    assert.equal(updates.length, 0);
    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /SET "memberCount" = "memberCount" \+ 1/);
    assert.match(rawQueries[0] ?? "", /"memberCount" < "maxMembers"/);
    assert.deepEqual(rawValues[0], ["s1"]);
  });

  it("rejects public join when atomic capacity reservation affects no server", async () => {
    const { client } = buildClient(0);

    const reserved = await reserveServerMemberCapacity(client as never, "s1");

    assert.equal(reserved, false);
  });

  it("decrements through raw SQL so the counter can never go negative", async () => {
    const { client, rawQueries, updates } = buildClient();

    await decrementServerMemberCount(client as never, "s1");

    assert.equal(updates.length, 0);
    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /GREATEST/);
    assert.match(rawQueries[0] ?? "", /s1/);
  });

  it("decrements a batch of servers in one statement, with every id in the statement", async () => {
    const { client, rawQueries, rawValues } = buildClient();

    await decrementServerMemberCounts(client as never, ["s1", "s2"]);

    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /GREATEST/);

    // `Prisma.join` collapses the ids into one Sql fragment, so asserting the
    // rendered string is not enough -- both ids have to be in its values.
    const joined = (rawValues[0] ?? [])[0] as { values?: unknown[] };
    assert.deepEqual(joined?.values, ["s1", "s2"]);
  });

  it("skips the statement entirely for an empty batch", async () => {
    const { client, rawQueries } = buildClient();

    await decrementServerMemberCounts(client as never, []);

    assert.equal(rawQueries.length, 0);
  });

  it("recomputes from the membership table to repair drift", async () => {
    const { client, rawQueries } = buildClient();

    await recomputeServerMemberCount(client as never, "s1");

    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /SELECT COUNT/i);
  });
});

describe("collectServerMemberCountDrift", () => {
  const servers = [
    { id: "s1", memberCount: 3, name: "Drifted" },
    { id: "s2", memberCount: 5, name: "Correct" },
    { id: "s3", memberCount: 2, name: "Emptied" },
  ];

  it("reports only the servers whose stored counter disagrees with the membership rows", () => {
    const drift = collectServerMemberCountDrift(
      servers,
      new Map([
        ["s1", 7],
        ["s2", 5],
        ["s3", 0],
      ]),
    );

    assert.deepEqual(
      drift.map((entry) => [entry.id, entry.memberCount, entry.actual]),
      [
        ["s1", 3, 7],
        ["s3", 2, 0],
      ],
    );
  });

  it("treats a server missing from the grouped counts as zero members, not as skipped", () => {
    const drift = collectServerMemberCountDrift(servers, new Map([["s2", 5]]));

    assert.deepEqual(
      drift.map((entry) => [entry.id, entry.actual]),
      [
        ["s1", 0],
        ["s3", 0],
      ],
    );
  });
});
