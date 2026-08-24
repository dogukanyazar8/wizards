import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { FriendSuggestionDTO } from "@wizards/types";

import {
  listDiscoverPeople,
  rankDiscoverInterestTags,
  toDiscoverPresence,
  type DiscoverPeopleDependencies,
} from "./people-service";

const suggestions: FriendSuggestionDTO[] = [
  {
    avatarUrl: null,
    id: "u2",
    initials: "AD",
    mutualFriendCount: 2,
    name: "Ada Lovelace",
    username: "ada",
    viaServerName: "Büyük Sunucu",
  },
  {
    avatarUrl: "https://cdn.whispr.test/u3.png",
    id: "u3",
    initials: "GR",
    mutualFriendCount: 1,
    name: "Grace Hopper",
    username: "grace",
    viaServerName: "Kodlama",
  },
];

function dependencies(
  overrides: Partial<DiscoverPeopleDependencies> = {},
): DiscoverPeopleDependencies {
  return {
    listFriendSuggestions: async () => suggestions,
    loadMutualServers: async () => [
      {
        id: "s-small",
        memberCount: 20,
        memberUserIds: ["u2"],
        name: "Küçük Sunucu",
        tags: ["typescript", "tasarım"],
      },
      {
        id: "s-large",
        memberCount: 200,
        memberUserIds: ["u2", "u3"],
        name: "Büyük Sunucu",
        tags: ["tasarım", "typescript"],
      },
      {
        id: "s-code",
        memberCount: 100,
        memberUserIds: ["u2", "u3"],
        name: "Kodlama",
        tags: ["typescript", "kod"],
      },
    ],
    loadPendingRequestTargetIds: async () => new Set(["u3"]),
    readPresence: async () => ({
      hiddenUserIds: new Set(["u3"]),
      statusByUserId: new Map([
        ["u2", "ONLINE" as const],
        ["u3", "DND" as const],
      ]),
    }),
    ...overrides,
  };
}

describe("discover people service", () => {
  it("ranks mutual-server tags by frequency, then alphabetically", () => {
    assert.deepEqual(
      rankDiscoverInterestTags([
        ["zeta", "alpha"],
        ["beta", "zeta"],
        ["alpha", "beta"],
      ]),
      ["alpha", "beta"],
    );
  });

  it("maps invisible users to offline and DND to idle", () => {
    assert.equal(toDiscoverPresence("DND", false), "idle");
    assert.equal(toDiscoverPresence("ONLINE", true), "offline");
  });

  it("enriches only the direct suggestion pool without N+1 queries", async () => {
    const calls: unknown[] = [];
    const result = await listDiscoverPeople(
      "viewer",
      {},
      dependencies({
        listFriendSuggestions: async (viewerId) => {
          calls.push(["suggestions", viewerId]);
          return suggestions;
        },
        loadMutualServers: async (viewerId, candidateIds) => {
          calls.push(["servers", viewerId, candidateIds]);
          return dependencies().loadMutualServers(viewerId, candidateIds);
        },
        loadPendingRequestTargetIds: async (viewerId, candidateIds) => {
          calls.push(["requests", viewerId, candidateIds]);
          return new Set(["u3"]);
        },
        readPresence: async (viewerId, candidateIds) => {
          calls.push(["presence", viewerId, candidateIds]);
          return dependencies().readPresence(viewerId, candidateIds);
        },
      }),
    );

    assert.deepEqual(calls, [
      ["suggestions", "viewer"],
      ["servers", "viewer", ["u2", "u3"]],
      ["requests", "viewer", ["u2", "u3"]],
      ["presence", "viewer", ["u2", "u3"]],
    ]);
    assert.deepEqual(result, {
      items: [
        {
          avatarUrl: null,
          handle: "ada",
          id: "u2",
          initials: "AL",
          interestTags: ["typescript", "tasarım"],
          mutualServerCount: 3,
          mutualServerName: "Büyük Sunucu",
          name: "Ada Lovelace",
          presence: "online",
          requestSent: false,
        },
        {
          avatarUrl: "https://cdn.whispr.test/u3.png",
          handle: "grace",
          id: "u3",
          initials: "GH",
          interestTags: ["typescript", "kod"],
          mutualServerCount: 2,
          mutualServerName: "Büyük Sunucu",
          name: "Grace Hopper",
          presence: "offline",
          requestSent: true,
        },
      ],
      nextCursor: null,
    });
  });

  it("returns empty tags and no mutual name when mutual servers are absent", async () => {
    const result = await listDiscoverPeople(
      "viewer",
      {},
      dependencies({ loadMutualServers: async () => [] }),
    );

    assert.deepEqual(result.items[0]?.interestTags, []);
    assert.equal(result.items[0]?.mutualServerCount, 0);
    assert.equal(result.items[0]?.mutualServerName, null);
  });

  it("searches name and handle inside the suggestion pool only", async () => {
    const byName = await listDiscoverPeople("viewer", { query: "  LOVELACE " }, dependencies());
    const byHandle = await listDiscoverPeople("viewer", { query: "grace" }, dependencies());
    const outsidePool = await listDiscoverPeople(
      "viewer",
      { query: "unknown-user" },
      dependencies(),
    );

    assert.deepEqual(
      byName.items.map((person) => person.id),
      ["u2"],
    );
    assert.deepEqual(
      byHandle.items.map((person) => person.id),
      ["u3"],
    );
    assert.deepEqual(outsidePool.items, []);
  });
});
