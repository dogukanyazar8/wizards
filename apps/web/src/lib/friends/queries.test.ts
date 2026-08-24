import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { friendPageQuery, toFriendVoiceRoomMap } from "@/lib/friends/queries";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("friends query pagination", () => {
  it("uses a bounded keyset cursor for every friend list", () => {
    assert.deepEqual(friendPageQuery({ cursor: "request-9", limit: 500 }), {
      cursor: { id: "request-9" },
      skip: 1,
      take: 100,
    });
    assert.deepEqual(friendPageQuery({ limit: Number.NaN }), { take: 100 });
  });

  it("does not override the bounded take at individual query sites", async () => {
    const source = await readFile(path.join(sourceRoot, "lib", "friends", "queries.ts"), "utf8");

    assert.equal(source.match(/\btake:/g)?.length ?? 0, 0);
  });
});

describe("friends read route import boundaries", () => {
  it("keeps read-only friends routes on the lightweight query module", async () => {
    const routePaths = [
      path.join(sourceRoot, "app", "api", "v1", "friends", "route.ts"),
      path.join(sourceRoot, "app", "api", "v1", "friends", "pending", "route.ts"),
      path.join(sourceRoot, "app", "api", "v1", "friends", "blocked", "route.ts"),
    ];

    const routeSources = await Promise.all(
      routePaths.map((routePath) => readFile(routePath, "utf8")),
    );

    for (const source of routeSources) {
      assert.match(source, /@\/lib\/friends\/queries/);
      assert.doesNotMatch(source, /@\/lib\/friends\/service/);
    }
  });
});

describe("friend voice room — Ana Sayfa 1a §4.6", () => {
  const rows = [
    {
      channel: { name: "live-room", server: { id: "server-1", name: "Whispr Topluluğu" } },
      channelId: "channel-1",
      serverId: "server-1",
      userId: "friend-1",
    },
    {
      channel: { name: "gece-lobisi", server: { id: "server-2", name: "Oyun Kulübü" } },
      channelId: "channel-2",
      serverId: "server-2",
      userId: "friend-2",
    },
  ];

  it("maps a live voice state onto the friend who owns it", () => {
    const rooms = toFriendVoiceRoomMap(rows, new Set(), new Set(["channel-1", "channel-2"]));

    assert.deepEqual(rooms.get("friend-1"), {
      channelId: "channel-1",
      channelName: "live-room",
      serverId: "server-1",
      serverName: "Whispr Topluluğu",
    });
    assert.equal(rooms.size, 2);
  });

  it("drops the room of a friend the viewer may not see", () => {
    const rooms = toFriendVoiceRoomMap(
      rows,
      new Set(["friend-1"]),
      new Set(["channel-1", "channel-2"]),
    );

    assert.equal(rooms.has("friend-1"), false);
    assert.equal(rooms.has("friend-2"), true);
  });

  it("drops a voice state whose channel lost its server", () => {
    const rooms = toFriendVoiceRoomMap(
      [{ channel: { name: "orphan", server: null }, channelId: "c", serverId: "s", userId: "u" }],
      new Set(),
      new Set(["c"]),
    );

    assert.equal(rooms.size, 0);
  });

  it("drops private voice metadata when the viewer lacks VIEW_CHANNEL", () => {
    const rooms = toFriendVoiceRoomMap(rows, new Set(), new Set(["channel-2"]));

    assert.equal(rooms.has("friend-1"), false);
    assert.equal(rooms.has("friend-2"), true);
  });

  it("resolves VIEW_CHANNEL with the existing across-server batch helper", async () => {
    const source = await readFile(path.join(sourceRoot, "lib", "friends", "queries.ts"), "utf8");

    assert.match(source, /listChannelIdsByServerForUserWithPermission/);
    assert.match(source, /PermissionBits\.VIEW_CHANNEL/);
    assert.doesNotMatch(
      source,
      /for \([^)]*friend[^)]*\)[\s\S]{0,200}listChannelIdsForUserWithPermission/,
    );
  });

  it("filters stale heartbeats on the cleanup's own cutoff, not a second one", async () => {
    const source = await readFile(path.join(sourceRoot, "lib", "friends", "queries.ts"), "utf8");

    assert.match(source, /getStaleVoiceHeartbeatCutoff/);
    assert.match(source, /lastHeartbeat:\s*\{\s*gte:\s*getStaleVoiceHeartbeatCutoff\(/);
    // A second timeout constant here would drift away from the cleanup's.
    assert.doesNotMatch(source, /VOICE_HEARTBEAT_TIMEOUT_MS/);
  });
});
