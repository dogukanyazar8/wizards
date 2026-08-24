import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeDiscoverChannelCursor,
  deriveDiscoverChannelActivityLabel,
  encodeDiscoverChannelCursor,
  isChannelVisibleToEveryone,
  isDiscoverableChannelVisible,
  listDiscoverChannels,
  normalizeDiscoverChannelQuery,
  type DiscoverChannelSource,
  type DiscoverChannelsDependencies,
} from "./channels-service";

const NOW = new Date("2026-08-21T12:30:00.000Z");

function channel(overrides: Partial<DiscoverChannelSource> = {}): DiscoverChannelSource {
  return {
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    dailyMessageCount: 80,
    everyoneViewDenied: false,
    features: [],
    hasLiveVoice: false,
    id: "c1",
    isPrivate: false,
    linkedToVoice: false,
    name: "tasarım",
    serverCategory: "calisma",
    serverDiscoverable: true,
    serverId: "s1",
    serverName: "Ürün Atölyesi",
    serverPublic: true,
    type: "TEXT",
    ...overrides,
  };
}

function dependencies(
  rows: DiscoverChannelSource[],
  overrides: Partial<DiscoverChannelsDependencies> = {},
): DiscoverChannelsDependencies {
  return {
    loadChannels: async () => rows,
    loadMemberPreviews: async (serverIds) =>
      new Map(serverIds.map((serverId) => [serverId, [{ id: `${serverId}-u1`, initials: "AU" }]])),
    ...overrides,
  };
}

describe("discover channel visibility", () => {
  it("requires TEXT, public channel, discoverable public server, and @everyone VIEW_CHANNEL", () => {
    assert.equal(isDiscoverableChannelVisible(channel()), true);
    assert.equal(isDiscoverableChannelVisible(channel({ type: "VOICE" })), false);
    assert.equal(isDiscoverableChannelVisible(channel({ isPrivate: true })), false);
    assert.equal(isDiscoverableChannelVisible(channel({ serverDiscoverable: false })), false);
    assert.equal(isDiscoverableChannelVisible(channel({ serverPublic: false })), false);
    assert.equal(isDiscoverableChannelVisible(channel({ everyoneViewDenied: true })), false);
  });

  it("derives isPrivate from @everyone and rejects an explicit VIEW_CHANNEL deny", () => {
    assert.equal(
      isChannelVisibleToEveryone({
        ownerId: "owner",
        overrides: [],
        roles: [{ id: "everyone", isDefault: true, permissions: 1n << 9n }],
      }),
      true,
    );
    assert.equal(
      isChannelVisibleToEveryone({
        ownerId: "owner",
        overrides: [{ allow: 0n, deny: 1n << 9n, targetId: "everyone", targetType: "ROLE" }],
        roles: [{ id: "everyone", isDefault: true, permissions: 1n << 9n }],
      }),
      false,
    );
    assert.equal(
      isChannelVisibleToEveryone({
        ownerId: "owner",
        overrides: [],
        roles: [{ id: "everyone", isDefault: true, permissions: 0n }],
      }),
      false,
    );
  });
});

describe("discover channel activity", () => {
  it("uses the binding priority official, live, busy, open, new, weekly", () => {
    assert.equal(
      deriveDiscoverChannelActivityLabel(
        channel({ dailyMessageCount: 500, features: ["VERIFIED"] }),
        NOW,
      ),
      "official",
    );
    assert.equal(
      deriveDiscoverChannelActivityLabel(
        channel({ dailyMessageCount: 500, hasLiveVoice: true }),
        NOW,
      ),
      "live",
    );
    assert.equal(
      deriveDiscoverChannelActivityLabel(channel({ dailyMessageCount: 200 }), NOW),
      "busy",
    );
    assert.equal(
      deriveDiscoverChannelActivityLabel(channel({ dailyMessageCount: 199 }), NOW),
      "open",
    );
    assert.equal(
      deriveDiscoverChannelActivityLabel(
        channel({ createdAt: new Date("2026-08-20T12:30:00.000Z"), dailyMessageCount: 0 }),
        NOW,
      ),
      "new",
    );
    assert.equal(
      deriveDiscoverChannelActivityLabel(channel({ dailyMessageCount: 0 }), NOW),
      "weekly",
    );
  });

  it("treats a voice-linked channel as open below the message threshold", () => {
    assert.equal(
      deriveDiscoverChannelActivityLabel(
        channel({ dailyMessageCount: 0, linkedToVoice: true }),
        NOW,
      ),
      "open",
    );
  });
});

describe("discover channel paging and search", () => {
  it("round-trips c|count|id cursors", () => {
    const encoded = encodeDiscoverChannelCursor({ dailyMessageCount: 42, id: "channel-42" });
    assert.equal(encoded, "c|42|channel-42");
    assert.deepEqual(decodeDiscoverChannelCursor(encoded), {
      dailyMessageCount: 42,
      id: "channel-42",
    });
    assert.throws(
      () => decodeDiscoverChannelCursor("bad|cursor"),
      /Invalid discover channel cursor/,
    );
  });

  it("strips a leading hash from channel search", () => {
    assert.equal(normalizeDiscoverChannelQuery("  #tasarım  "), "tasarım");
    assert.equal(normalizeDiscoverChannelQuery("###"), null);
  });

  it("returns no items when the rollup loader has no rows", async () => {
    let previewLoaded = false;
    const result = await listDiscoverChannels(
      {},
      { now: NOW },
      dependencies([], {
        loadMemberPreviews: async () => {
          previewLoaded = true;
          return new Map();
        },
      }),
    );

    assert.deepEqual(result, { items: [], nextCursor: null });
    assert.equal(previewLoaded, false);
  });

  it("filters visibility again before returning and never exposes channel content", async () => {
    const result = await listDiscoverChannels(
      { query: "#ürün" },
      { now: NOW },
      dependencies([
        channel({ id: "private", isPrivate: true, name: "ürün-gizli" }),
        channel({ id: "denied", everyoneViewDenied: true, name: "ürün-yönetim" }),
        channel({ id: "other", name: "genel", serverName: "Başka" }),
        channel({ id: "public", name: "ürün-tasarım", dailyMessageCount: 250 }),
      ]),
    );

    assert.deepEqual(result, {
      items: [
        {
          activityLabel: "busy",
          dailyMessageCount: 250,
          id: "public",
          memberPreview: [{ id: "s1-u1", initials: "AU" }],
          name: "ürün-tasarım",
          serverCategory: "calisma",
          serverId: "s1",
          serverName: "Ürün Atölyesi",
        },
      ],
      nextCursor: null,
    });
    assert.equal("content" in result.items[0]!, false);
    assert.equal("messages" in result.items[0]!, false);
  });

  it("sorts by daily count desc then id asc", async () => {
    const result = await listDiscoverChannels(
      {},
      { now: NOW },
      dependencies([
        channel({ dailyMessageCount: 5, id: "z" }),
        channel({ dailyMessageCount: 10, id: "b" }),
        channel({ dailyMessageCount: 10, id: "a" }),
      ]),
    );

    assert.deepEqual(
      result.items.map((item) => item.id),
      ["a", "b", "z"],
    );
  });

  it("searches server names as well as channel names", async () => {
    const result = await listDiscoverChannels(
      { query: "başka" },
      { now: NOW },
      dependencies([
        channel({ id: "matching", name: "genel", serverName: "Başka Topluluk" }),
        channel({ id: "other", name: "genel", serverName: "Ürün Atölyesi" }),
      ]),
    );

    assert.deepEqual(
      result.items.map((item) => item.id),
      ["matching"],
    );
  });

  it("returns 24 items and a stable continuation cursor", async () => {
    const rows = Array.from({ length: 25 }, (_unused, index) =>
      channel({
        dailyMessageCount: 100 - index,
        id: `c${index.toString().padStart(2, "0")}`,
      }),
    );
    const deps = dependencies(rows);
    const first = await listDiscoverChannels({}, { now: NOW }, deps);
    const second = await listDiscoverChannels(
      first.nextCursor === null ? {} : { cursor: first.nextCursor },
      { now: NOW },
      deps,
    );

    assert.equal(first.items.length, 24);
    assert.equal(first.nextCursor, "c|77|c23");
    assert.deepEqual(
      second.items.map((item) => item.id),
      ["c24"],
    );
    assert.equal(second.nextCursor, null);
  });

  it("uses the scale-selected first page size up to the API cap", async () => {
    const rows = Array.from({ length: 49 }, (_unused, index) =>
      channel({ dailyMessageCount: 100 - index, id: `scaled-${index}` }),
    );

    const page = await listDiscoverChannels({}, { limit: 48, now: NOW }, dependencies(rows));

    assert.equal(page.items.length, 48);
    assert.notEqual(page.nextCursor, null);
  });
});
