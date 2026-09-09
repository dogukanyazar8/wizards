import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import { searchHomeCommandSurfaces } from "@/lib/home/command-search-service";
import {
  UNAUTHENTICATED,
  createFakeDatabase,
  fakeChannelResolver,
  fakePresenceReader,
  readJson,
  recordRateLimit,
} from "@/lib/home/home-test-doubles";
import { toRelativeAppHref } from "@/lib/home/href";
import { SearchCommandResponseSchema } from "@/lib/home/types";

import { searchCommandRoute, type SearchCommandRouteDependencies } from "./route-logic";

function searchDatabase(overrides: { users?: readonly unknown[] } = {}) {
  return createFakeDatabase({
    models: {
      channel: {
        findMany: () => [
          { id: "c1", name: "genel", server: { id: "s1", name: "Whispr" }, serverId: "s1" },
        ],
      },
      dMParticipant: {
        findMany: () => [
          {
            conversation: {
              id: "conv-1",
              name: null,
              participants: [
                { user: { avatarUrl: null, displayName: "Genel Grup", id: "u3", username: "u3" } },
                { user: { avatarUrl: null, displayName: "Ben", id: "u1", username: "ben" } },
              ],
              type: "DM",
            },
          },
        ],
      },
      server: { findMany: () => [{ iconUrl: null, id: "s1", name: "Whispr" }] },
      serverMember: { findMany: () => [{ serverId: "s1" }] },
      user: {
        findMany: () =>
          overrides.users ?? [
            { avatarUrl: null, displayName: "Genel Kullanıcı", id: "u7", username: "genelci" },
          ],
      },
    },
  });
}

function serviceDependencies(database: ReturnType<typeof searchDatabase>["database"]) {
  return {
    database,
    listVisibleChannels: fakeChannelResolver({ s1: ["c1"] }),
    readPresence: fakePresenceReader({ u7: "ONLINE" }),
  };
}

function routeDependencies(
  overrides: Partial<SearchCommandRouteDependencies> = {},
): SearchCommandRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    search: () => Promise.resolve({ groups: [] }),
    ...overrides,
  };
}

describe("GET /api/v1/search/command", () => {
  it("groups every reachable surface behind one relative link each", async () => {
    const { calls, database } = searchDatabase();

    const payload = SearchCommandResponseSchema.parse(
      await searchHomeCommandSurfaces("u1", { q: "genel" }, serviceDependencies(database)),
    );

    assert.deepEqual(
      payload.groups.map((group) => group.kind),
      ["channel", "dm", "user"],
    );
    assert.ok(!calls.some((call) => call.operation === "server.findMany"));
    for (const group of payload.groups) {
      assert.ok(group.items.length <= 5);
      for (const item of group.items) {
        assert.equal(toRelativeAppHref(item.href), item.href);
      }
    }
    assert.equal(payload.groups.at(-1)?.items[0]?.presence, "ONLINE");
  });

  it("rejects a request without a session", async () => {
    const response = await searchCommandRoute(
      new Request("https://whispr.test/api/v1/search/command?q=a"),
      routeDependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson(response), { error: "Unauthorized" });
  });

  it("never offers a channel the viewer cannot open", async () => {
    const { calls, database } = searchDatabase();

    const payload = await searchHomeCommandSurfaces(
      "u1",
      { q: "genel" },
      {
        ...serviceDependencies(database),
        listVisibleChannels: fakeChannelResolver({ s1: [] }),
      },
    );

    assert.ok(!payload.groups.some((group) => group.kind === "channel"));
    assert.ok(!calls.some((call) => call.operation === "channel.findMany"));
  });

  it("filters people through the profile visibility policy", async () => {
    const { calls, database } = searchDatabase();

    await searchHomeCommandSurfaces("u1", { q: "genel" }, serviceDependencies(database));

    const where = JSON.stringify(
      (calls.find((call) => call.operation === "user.findMany")?.args as { where?: unknown })
        ?.where ?? {},
    );
    assert.ok(
      where.includes("profileVisibility"),
      "the visibility policy must be part of the query",
    );
    assert.ok(where.includes("BLOCKED"));
  });

  it("answers an empty query with recent surfaces, not with the directory", async () => {
    const { calls, database, queryCount } = searchDatabase();

    const payload = await searchHomeCommandSurfaces("u1", { q: "" }, serviceDependencies(database));

    assert.deepEqual(
      payload.groups.map((group) => group.kind),
      ["dm"],
    );
    assert.ok(!calls.some((call) => call.operation === "user.findMany"));
    assert.ok(!calls.some((call) => call.operation === "channel.findMany"));
    assert.ok(!calls.some((call) => call.operation === "serverMember.findMany"));
    assert.equal(queryCount(), 1);
  });

  it("is registered in the rate limit table and charged before any work", async () => {
    assert.deepEqual(API_RATE_LIMITS["search:command"], { limit: 60, windowSeconds: 60 });

    const recorded: string[] = [];
    await searchCommandRoute(
      new Request("https://whispr.test/api/v1/search/command?q=a"),
      routeDependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["search:command"]);
  });

  it("refuses a query longer than the palette can send", async () => {
    const response = await searchCommandRoute(
      new Request(`https://whispr.test/api/v1/search/command?q=${"a".repeat(65)}`),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("sunucu grubunu sorgulamayarak en fazla dört sorguya mal olur", async () => {
    const { database, queryCount } = searchDatabase();

    await searchHomeCommandSurfaces("u1", { q: "genel" }, serviceDependencies(database));

    assert.equal(queryCount(), 4);
  });
});
