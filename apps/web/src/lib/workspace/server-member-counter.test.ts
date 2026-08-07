import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decrementServerMemberCount,
  decrementServerMemberCounts,
  incrementServerMemberCount,
  recomputeServerMemberCount,
} from "@/lib/workspace/server-member-counter";

function buildClient() {
  const rawQueries: string[] = [];
  const updates: unknown[] = [];

  return {
    client: {
      $executeRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
        rawQueries.push(`${query.join("?")}|${values.join(",")}`);
        return 1;
      },
      server: {
        update: async (args: unknown) => {
          updates.push(args);
          return {};
        },
      },
    },
    rawQueries,
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

  it("decrements through raw SQL so the counter can never go negative", async () => {
    const { client, rawQueries, updates } = buildClient();

    await decrementServerMemberCount(client as never, "s1");

    assert.equal(updates.length, 0);
    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /GREATEST/);
    assert.match(rawQueries[0] ?? "", /s1/);
  });

  it("decrements a batch of servers in one statement", async () => {
    const { client, rawQueries } = buildClient();

    await decrementServerMemberCounts(client as never, ["s1", "s2"]);

    assert.equal(rawQueries.length, 1);
    assert.match(rawQueries[0] ?? "", /GREATEST/);
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
