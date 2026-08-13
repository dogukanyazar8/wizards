import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ServerOnlinePresenceRedis } from "@/lib/socket/server-online-presence";
import { setSocketServer } from "@/lib/socket/runtime";
import * as unreadService from "./unread-service";
import {
  MOBILE_UNREAD_COUNT_CAP,
  buildServerChannelUnreadQuery,
  buildServerUnreadTotalsQuery,
  getActiveChannelViewerUserIds,
  getActiveServerMemberUserIds,
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
    smismember: async (key, ...members) =>
      members.map((member) => (sets.get(key)?.has(member) ? 1 : 0)),
    srem: async (key, member) => {
      sets.get(key)?.delete(member);
      return 1;
    },
    status,
  };

  return { redis, sets };
}

describe("workspace unread service", () => {
  it("reads all affected servers once before emitting one update per server", async () => {
    type BatchEmitter = (
      userId: string,
      serverIds: string[],
      dependencies: {
        getCounts: (
          userId: string,
          serverIds: string[],
        ) => Promise<{
          mentionCounts: Map<string, number>;
          unreadCounts: Map<string, number>;
        }>;
        getSocketServer: () => {
          to: (room: string) => { emit: (event: string, payload: unknown) => void };
        };
      },
    ) => Promise<unknown>;
    const emitter = (unreadService as unknown as { emitServerUnreadUpdatesToUser?: BatchEmitter })
      .emitServerUnreadUpdatesToUser;
    const countReads: Array<{ serverIds: string[]; userId: string }> = [];
    const emissions: Array<{ event: string; payload: unknown; room: string }> = [];

    assert.equal(typeof emitter, "function");
    await emitter!("user-1", ["server-1", "server-2", "server-1"], {
      getCounts: async (userId, serverIds) => {
        countReads.push({ serverIds, userId });
        return {
          mentionCounts: new Map([
            ["server-1", 1],
            ["server-2", 2],
          ]),
          unreadCounts: new Map([
            ["server-1", 3],
            ["server-2", 4],
          ]),
        };
      },
      getSocketServer: () => ({
        to: (room) => ({
          emit: (event, payload) => emissions.push({ event, payload, room }),
        }),
      }),
    });

    assert.deepEqual(countReads, [{ serverIds: ["server-1", "server-2"], userId: "user-1" }]);
    assert.deepEqual(emissions, [
      {
        event: "server:unread:update",
        payload: { mentionCount: 1, serverId: "server-1", unreadCount: 3 },
        room: "user:user-1",
      },
      {
        event: "server:unread:update",
        payload: { mentionCount: 2, serverId: "server-2", unreadCount: 4 },
        room: "user:user-1",
      },
    ]);
  });

  it("reads active channel viewers and server members from Redis sets", async () => {
    const reads: string[] = [];
    const redis = {
      status: "ready",
      async smembers(key: string) {
        reads.push(key);
        return key === "channel:channel-1:viewers" ? ["user-1", "user-2"] : ["user-2", "user-3"];
      },
    };
    setSocketServer({
      in() {
        throw new Error("fetchSockets must not be used by active-user reads");
      },
    } as unknown as Parameters<typeof setSocketServer>[0]);

    assert.deepEqual(await getActiveChannelViewerUserIds("channel-1", redis), ["user-1", "user-2"]);
    assert.deepEqual(await getActiveServerMemberUserIds("server-1", redis), ["user-2", "user-3"]);
    assert.deepEqual(reads, ["channel:channel-1:viewers", "server:server-1:online"]);
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
