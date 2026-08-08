import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServerOnlinePresenceRedis } from "@/lib/socket/server-online-presence";
import { setSocketServer } from "@/lib/socket/runtime";
import {
  MOBILE_UNREAD_COUNT_CAP,
  buildServerChannelUnreadQuery,
  buildServerUnreadTotalsQuery,
  getActiveChannelViewerUserIds,
  getOnlineServerMemberCount,
  groupUsersByVisibleChannelIds,
} from "./unread-service";

function buildOnlinePresenceRedis(status: ServerOnlinePresenceRedis["status"] = "ready") {
  const sets = new Map<string, Set<string>>();

  const redis: ServerOnlinePresenceRedis = {
    expire: async () => 1,
    sadd: async (key, member) => {
      const set = sets.get(key) ?? new Set<string>();
      set.add(member);
      sets.set(key, set);
      return 1;
    },
    scard: async (key) => sets.get(key)?.size ?? 0,
    srem: async (key, member) => {
      sets.get(key)?.delete(member);
      return 1;
    },
    status,
  };

  return { redis, sets };
}

describe("workspace unread service", () => {
  it("collects active channel viewers through the socket adapter", async () => {
    let requestedRoom: string | null = null;
    const socketServer = {
      in(room: string) {
        requestedRoom = room;

        return {
          async fetchSockets() {
            return [
              { data: { userId: "user-1" } },
              { data: { userId: "user-2" } },
              { data: { userId: "user-1" } },
              { data: {} },
            ];
          },
        };
      },
    } as unknown as Parameters<typeof setSocketServer>[0];

    setSocketServer(socketServer);

    const userIds = await getActiveChannelViewerUserIds("channel-1");

    assert.equal(requestedRoom, "channel-1");
    assert.deepEqual(userIds.sort(), ["user-1", "user-2"]);
  });

  it("counts distinct, visible-presence members in a server room", async () => {
    // Task 8 moved this off `fetchSockets` onto a Redis set backing
    // `getOnlineServerMemberCount` — the function production actually calls
    // (server-service.ts) — so this exercises that function directly rather
    // than the lower-level primitives it wraps (those get their own coverage
    // in server-online-presence.test.ts).
    const { redis } = buildOnlinePresenceRedis();

    await redis.sadd("server:server-1:online", "user-1"); // ONLINE
    await redis.sadd("server:server-1:online", "user-2"); // IDLE
    // user-3 never joins the set: its presence stays OFFLINE.
    await redis.sadd("server:server-1:online", "user-1"); // a second socket, still DND

    assert.equal(await getOnlineServerMemberCount("server-1", redis), 2);
  });

  it("returns zero without querying Redis when it is not ready", async () => {
    const { redis } = buildOnlinePresenceRedis("connecting");
    let scardCalls = 0;
    const countingRedis: ServerOnlinePresenceRedis = {
      ...redis,
      scard: async (key) => {
        scardCalls += 1;
        return redis.scard(key);
      },
    };

    assert.equal(await getOnlineServerMemberCount("server-1", countingRedis), 0);
    assert.equal(scardCalls, 0);
  });

  it("returns zero instead of throwing when the read fails after the readiness check passes", async () => {
    const { redis } = buildOnlinePresenceRedis();
    const failingRedis: ServerOnlinePresenceRedis = {
      ...redis,
      scard: async () => {
        // A mid-flight timeout or connection reset -- distinct from the
        // not-ready case above, which never issues the command at all.
        throw new Error("ECONNRESET");
      },
    };

    await assert.doesNotReject(async () => {
      assert.equal(await getOnlineServerMemberCount("server-1", failingRedis), 0);
    });
  });

  it("groups users by identical visible channel sets", () => {
    const groups = groupUsersByVisibleChannelIds(
      new Map([
        ["user-1", ["channel-a", "channel-b"]],
        ["user-2", ["channel-a", "channel-b"]],
        ["user-3", ["channel-c"]],
        ["user-4", []],
      ]),
    );

    assert.deepEqual(groups, [
      {
        channelIds: ["channel-a", "channel-b"],
        userIds: ["user-1", "user-2"],
      },
      {
        channelIds: ["channel-c"],
        userIds: ["user-3"],
      },
    ]);
  });
});

describe("bounded mobile unread counting", () => {
  const base = {
    serverId: "server-1",
    uniqueServerIds: ["server-1"],
    unreadCountCap: MOBILE_UNREAD_COUNT_CAP,
    userId: "user-1",
    visibleChannelIds: ["channel-1", "channel-2"],
  };

  it("bounds the per-channel scan with a LIMIT instead of counting every message", () => {
    const query = buildServerChannelUnreadQuery(base);
    const sql = query.sql.replace(/\s+/g, " ");

    assert.match(sql, /LEFT JOIN LATERAL/);
    assert.match(sql, /LIMIT \?/);
    assert.doesNotMatch(sql, /COUNT\(m\."id"\)/);
    assert.equal(query.values.includes(MOBILE_UNREAD_COUNT_CAP), true);
  });

  it("keeps the per-channel unread window anchored to lastReadAt or join time", () => {
    const sql = buildServerChannelUnreadQuery(base).sql.replace(/\s+/g, " ");

    assert.match(sql, /m\."createdAt" > COALESCE\(crs\."lastReadAt", sm\."joinedAt"\)/);
    assert.match(sql, /m\."threadId" IS NULL/);
    assert.match(sql, /m\."threadParentId" IS NULL/);
    assert.match(sql, /c\."type" = 'TEXT'/);
  });

  it("caps the per-server total as well so a sum of capped channels cannot exceed it", () => {
    const query = buildServerUnreadTotalsQuery(base);
    const sql = query.sql.replace(/\s+/g, " ");

    assert.match(sql, /LEAST\(SUM\("unreadCount"\), \?\)/);
    assert.match(sql, /LIMIT \?/);
    assert.equal(
      query.values.filter((value) => value === MOBILE_UNREAD_COUNT_CAP).length,
      2,
      "cap must bind to both the per-channel LIMIT and the server total",
    );
  });

  it("leaves web callers on exact counts by defaulting to an effectively uncapped bound", () => {
    const query = buildServerUnreadTotalsQuery({ ...base, unreadCountCap: 2_147_483_647 });

    assert.equal(query.values.includes(MOBILE_UNREAD_COUNT_CAP), false);
    assert.equal(query.values.includes(2_147_483_647), true);
  });
});
