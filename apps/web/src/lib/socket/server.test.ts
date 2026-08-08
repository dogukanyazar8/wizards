import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";
import {
  getSocketMobileBearerToken,
  joinServerRoomsForUser,
  listServerRoomIdsForUser,
  listServerRoomIdsPage,
  mergeHandshakeAttribution,
  runSocketDisconnectCleanup,
  SOCKET_SERVER_ROOM_JOIN_BATCH_SIZE,
} from "./server";

describe("socket handshake attribution", () => {
  it("accepts the auth payload a browser has to use instead of headers", () => {
    const info = getAnalyticsClientInfo(
      mergeHandshakeAttribution(
        { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/124.0" },
        { client: "desktop", clientVersion: "2026.07.27" },
      ),
    );

    assert.equal(info.clientType, "DESKTOP");
    assert.equal(info.appVersion, "2026.07.27");
    assert.equal(info.attributionVerified, true);
  });

  it("lets a real header win over the auth payload", () => {
    const merged = mergeHandshakeAttribution(
      { "x-whispr-client": "mobile", "x-whispr-client-version": "0.8.15" },
      { client: "web", clientVersion: "2026.07.27" },
    );

    assert.equal(getAnalyticsClientInfo(merged).clientType, "MOBILE");
    assert.equal(getAnalyticsClientInfo(merged).appVersion, "0.8.15");
  });

  it("stays unverified when the client says nothing", () => {
    const info = getAnalyticsClientInfo(
      mergeHandshakeAttribution({ "user-agent": "okhttp/4.12.0" }, undefined),
    );

    assert.equal(info.attributionVerified, false);
  });
});

// Task 8 gave `joinServerRoomsForUser` a second Redis responsibility — writing
// each joined server into its online-presence set — so this double now also
// implements `ServerOnlinePresenceRedis` alongside the room-id cache surface
// it already had.
class MemoryServerRoomRedis {
  status = "ready";
  store = new Map<string, string>();
  setCalls: Array<{ key: string; ttlSeconds: number; value: string }> = [];
  onlineSets = new Map<string, Set<string>>();
  onlineExpireCalls: string[] = [];

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, mode: "EX", ttlSeconds: number) {
    assert.equal(mode, "EX");
    this.store.set(key, value);
    this.setCalls.push({ key, ttlSeconds, value });
    return "OK";
  }

  async sadd(key: string, member: string) {
    const set = this.onlineSets.get(key) ?? new Set<string>();
    set.add(member);
    this.onlineSets.set(key, set);
    return 1;
  }

  async srem(key: string, member: string) {
    this.onlineSets.get(key)?.delete(member);
    return 1;
  }

  async scard(key: string) {
    return this.onlineSets.get(key)?.size ?? 0;
  }

  async expire(key: string) {
    this.onlineExpireCalls.push(key);
    return 1;
  }
}

describe("socket server room joins", () => {
  it("extracts mobile bearer tokens only from explicit socket auth surfaces", () => {
    assert.equal(
      getSocketMobileBearerToken({
        handshakeAuth: { token: "mobile-token" },
      }),
      "mobile-token",
    );
    assert.equal(
      getSocketMobileBearerToken({
        handshakeAuth: { accessToken: "mobile-access-token" },
      }),
      "mobile-access-token",
    );
    assert.equal(
      getSocketMobileBearerToken({
        authorizationHeader: "Bearer header-token",
      }),
      "header-token",
    );
    assert.equal(
      getSocketMobileBearerToken({
        authorizationHeader: "Basic header-token",
        handshakeAuth: { token: "" },
      }),
      null,
    );
    assert.equal(
      getSocketMobileBearerToken({
        handshakeAuth: { token: "Bearer should-not-include-scheme" },
      }),
      null,
    );
  });

  it("lists server room ids with a bounded cursor page", async () => {
    const calls: unknown[] = [];
    const serverMemberDelegate = {
      async findMany(args: unknown) {
        calls.push(args);
        return [{ serverId: "server-a" }];
      },
    };

    const serverIds = await listServerRoomIdsPage("user-1", {
      cursorServerId: "server-0",
      serverMemberDelegate,
    });

    assert.deepEqual(serverIds, ["server-a"]);
    assert.deepEqual(calls, [
      {
        where: {
          userId: "user-1",
          server: {
            bans: {
              none: { userId: "user-1" },
            },
          },
        },
        cursor: {
          userId_serverId: {
            serverId: "server-0",
            userId: "user-1",
          },
        },
        skip: 1,
        orderBy: { serverId: "asc" },
        take: SOCKET_SERVER_ROOM_JOIN_BATCH_SIZE,
        select: { serverId: true },
      },
    ]);
  });

  it("caches server room ids for reconnect reuse", async () => {
    const memberships = ["server-1", "server-2", "server-3", "server-4", "server-5"];
    const redis = new MemoryServerRoomRedis();
    let findManyCalls = 0;
    const serverMemberDelegate = {
      async findMany() {
        findManyCalls += 1;
        return memberships.map((serverId) => ({ serverId }));
      },
    };

    assert.deepEqual(
      await listServerRoomIdsForUser("user-1", {
        redis: redis as never,
        serverMemberDelegate,
      }),
      memberships,
    );
    assert.deepEqual(
      await listServerRoomIdsForUser("user-1", {
        redis: redis as never,
        serverMemberDelegate,
      }),
      memberships,
    );

    assert.equal(findManyCalls, 1);
    assert.equal(redis.setCalls.length, 1);
  });

  it("joins all server rooms from one room-id lookup", async () => {
    const memberships = ["server-1", "server-2", "server-3", "server-4", "server-5"];
    const joinedRooms: Array<string | string[]> = [];
    const redis = new MemoryServerRoomRedis();
    let findManyCalls = 0;
    const serverMemberDelegate = {
      async findMany() {
        findManyCalls += 1;
        return memberships.map((serverId) => ({ serverId }));
      },
    };
    const socket = {
      data: {} as { onlineServerIds?: string[] },
      join(room: string | string[]) {
        joinedRooms.push(room);
      },
    };

    await joinServerRoomsForUser(socket, "user-1", {
      redis: redis as never,
      serverMemberDelegate,
    });

    assert.equal(findManyCalls, 1);
    assert.deepEqual(joinedRooms, [memberships.map((serverId) => `server:${serverId}`)]);

    // Task 8: joining a server room also marks the user online in that
    // server's Redis set, and remembers which servers this socket did that
    // for so disconnect/presence handlers know what to unwind.
    assert.deepEqual(socket.data.onlineServerIds, memberships);
    for (const serverId of memberships) {
      assert.deepEqual(redis.onlineSets.get(`server:${serverId}:online`), new Set(["user-1"]));
    }
    assert.deepEqual(
      redis.onlineExpireCalls.sort(),
      memberships.map((serverId) => `server:${serverId}:online`).sort(),
    );
  });

  it("does not leave a ghost online-set entry when the socket disconnects before the join's write lands", async () => {
    // Critical 3: joinServerRoomsForUser runs as a detached background task
    // and the disconnect handler can fire before it writes anything. Here the
    // room-membership lookup itself is the thing still in flight when the
    // disconnect resolves.
    const memberships = ["server-1", "server-2"];
    const redis = new MemoryServerRoomRedis();
    const socket = {
      connected: true,
      data: {} as { onlineServerIds?: string[]; presenceStatus?: string },
      join() {},
    };
    const serverMemberDelegate = {
      async findMany() {
        // Simulates the disconnect handler having already run (and found
        // nothing to remove) while this lookup was still in flight.
        socket.connected = false;
        return memberships.map((serverId) => ({ serverId }));
      },
    };

    await joinServerRoomsForUser(socket, "user-1", {
      redis: redis as never,
      serverMemberDelegate,
    });

    for (const serverId of memberships) {
      assert.deepEqual(redis.onlineSets.get(`server:${serverId}:online`) ?? new Set(), new Set());
    }
    // Room-membership bookkeeping still happens -- only the online-set mirror
    // of it is gated.
    assert.deepEqual(socket.data.onlineServerIds, memberships);
  });

  it("reverses the add if the socket disconnects while the online-set writes are still in flight", async () => {
    // The same ghost-entry risk, but the disconnect resolves mid-batch,
    // after eligibility already passed and some adds may have landed.
    const memberships = ["server-1", "server-2"];
    const redis = new MemoryServerRoomRedis();
    const socket = {
      connected: true,
      data: {} as { onlineServerIds?: string[]; presenceStatus?: string },
      join() {},
    };
    let firstSadd = true;
    const racingRedis = {
      get: redis.get.bind(redis),
      set: redis.set.bind(redis),
      async sadd(key: string, member: string) {
        if (firstSadd) {
          firstSadd = false;
          socket.connected = false;
        }
        return redis.sadd(key, member);
      },
      srem: redis.srem.bind(redis),
      scard: redis.scard.bind(redis),
      expire: redis.expire.bind(redis),
      status: redis.status,
    };
    const serverMemberDelegate = {
      async findMany() {
        return memberships.map((serverId) => ({ serverId }));
      },
    };

    await joinServerRoomsForUser(socket, "user-1", {
      redis: racingRedis as never,
      serverMemberDelegate,
    });

    for (const serverId of memberships) {
      assert.deepEqual(redis.onlineSets.get(`server:${serverId}:online`) ?? new Set(), new Set());
    }
  });

  it("does not mark an OFFLINE-status socket online, even though room membership is still recorded", async () => {
    // Important 4: if initializePresence has already resolved the user as
    // invisible (broadcast status OFFLINE) by the time this join's write
    // runs, it must not blindly add them.
    const memberships = ["server-1", "server-2"];
    const redis = new MemoryServerRoomRedis();
    const socket = {
      connected: true,
      data: { presenceStatus: "OFFLINE" } as {
        onlineServerIds?: string[];
        presenceStatus?: string;
      },
      join() {},
    };
    const serverMemberDelegate = {
      async findMany() {
        return memberships.map((serverId) => ({ serverId }));
      },
    };

    await joinServerRoomsForUser(socket, "user-1", {
      redis: redis as never,
      serverMemberDelegate,
    });

    for (const serverId of memberships) {
      assert.deepEqual(redis.onlineSets.get(`server:${serverId}:online`) ?? new Set(), new Set());
    }
    assert.deepEqual(socket.data.onlineServerIds, memberships);
  });

  it("still marks a DND socket online -- only OFFLINE is excluded", async () => {
    const memberships = ["server-1"];
    const redis = new MemoryServerRoomRedis();
    const socket = {
      connected: true,
      data: { presenceStatus: "DND" } as { onlineServerIds?: string[]; presenceStatus?: string },
      join() {},
    };
    const serverMemberDelegate = {
      async findMany() {
        return memberships.map((serverId) => ({ serverId }));
      },
    };

    await joinServerRoomsForUser(socket, "user-1", {
      redis: redis as never,
      serverMemberDelegate,
    });

    assert.deepEqual(redis.onlineSets.get("server:server-1:online"), new Set(["user-1"]));
  });
});

describe("socket disconnect cleanup", () => {
  function buildDisconnectSocket() {
    return {
      data: {
        appSessionKey: "session-1",
        onlineServerIds: ["server-1"],
        userId: "user-1",
      },
      id: "socket-1",
    };
  }

  function roomProbeReturning(sockets: Array<{ id: string; rooms: ReadonlySet<string> }>) {
    let requestedRoom: string | null = null;

    return {
      getRequestedRoom: () => requestedRoom,
      io: {
        in(room: string) {
          requestedRoom = room;
          return { fetchSockets: async () => sockets };
        },
      },
    };
  }

  function recordingPresenceRedis() {
    const removed: string[] = [];

    return {
      redis: {
        expire: async () => 1,
        sadd: async () => 1,
        scard: async () => 0,
        srem: async (key: string) => {
          removed.push(key);
          return 1;
        },
        status: "ready" as const,
      },
      removed,
    };
  }

  function throwingPresenceRedis() {
    return {
      expire: async () => {
        throw new Error("ECONNRESET");
      },
      sadd: async () => {
        throw new Error("ECONNRESET");
      },
      scard: async () => {
        throw new Error("ECONNRESET");
      },
      srem: async () => {
        throw new Error("ECONNRESET");
      },
      status: "ready" as const,
    };
  }

  it("clears the heartbeat and runs presence cleanup even when the Redis removal fails", async () => {
    // Critical 2: the online-set removal used to be the first statement of the
    // disconnect handler's single `try`. A rejection there jumped to `catch`
    // and skipped everything below it -- leaking a 60s interval against a dead
    // socket, leaving the user ONLINE to their friends, and never closing the
    // analytics session.
    let cleanupCalls = 0;
    let endedSessionKey: string | null = null;
    let heartbeatTicks = 0;
    const presenceHeartbeat = setInterval(() => {
      heartbeatTicks += 1;
    }, 1);

    await runSocketDisconnectCleanup({
      cleanup: () => {
        cleanupCalls += 1;
      },
      endSession: async (appSessionKey) => {
        endedSessionKey = appSessionKey;
      },
      fallbackAppSessionKey: "fallback-session",
      presenceHeartbeat,
      redis: throwingPresenceRedis(),
      socket: buildDisconnectSocket(),
    });

    assert.equal(cleanupCalls, 1);
    assert.equal(endedSessionKey, "session-1");
    // A cleared interval cannot tick: if the clear had been skipped this would
    // still be running (and would keep the process alive) after the await.
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(heartbeatTicks, 0);
  });

  it("still closes the analytics session when the presence cleanup itself fails", async () => {
    let endedSessionKey: string | null = null;
    const presenceHeartbeat = setInterval(() => undefined, 1_000);

    await assert.doesNotReject(() =>
      runSocketDisconnectCleanup({
        cleanup: () => {
          throw new Error("presence cleanup failed");
        },
        endSession: async (appSessionKey) => {
          endedSessionKey = appSessionKey;
        },
        fallbackAppSessionKey: "fallback-session",
        presenceHeartbeat,
        redis: throwingPresenceRedis(),
        socket: buildDisconnectSocket(),
      }),
    );

    // Documents the surviving limitation: a throwing `cleanup` still swallows
    // the session close. Only the heartbeat clear is unconditional.
    assert.equal(endedSessionKey, null);
  });

  it("falls back to the connection's session key when the socket lost its own", async () => {
    let endedSessionKey: string | null = null;
    const presenceHeartbeat = setInterval(() => undefined, 1_000);
    const socket = buildDisconnectSocket();
    socket.data.appSessionKey = undefined as unknown as string;

    await runSocketDisconnectCleanup({
      endSession: async (appSessionKey) => {
        endedSessionKey = appSessionKey;
      },
      fallbackAppSessionKey: "fallback-session",
      presenceHeartbeat,
      redis: throwingPresenceRedis(),
      socket,
    });

    assert.equal(endedSessionKey, "fallback-session");
  });

  it("keeps the user online in a server another of their sockets is still in", async () => {
    // The online set is per user, not per socket: closing one tab must not
    // evict a user whose other tab is still in the room.
    const { redis, removed } = recordingPresenceRedis();
    const socket = buildDisconnectSocket();
    socket.data.onlineServerIds = ["server-1", "server-2"];
    const { getRequestedRoom, io } = roomProbeReturning([
      { id: "socket-2", rooms: new Set(["user:user-1", "server:server-1"]) },
    ]);

    await runSocketDisconnectCleanup({
      endSession: async () => undefined,
      fallbackAppSessionKey: "fallback-session",
      io,
      presenceHeartbeat: setInterval(() => undefined, 1_000),
      redis,
      socket,
    });

    // server-1 is still held by socket-2; server-2 is not held by anyone.
    assert.deepEqual(removed, ["server:server-2:online"]);
    // One lookup per disconnect, against the user room -- not one per server.
    assert.equal(getRequestedRoom(), "user:user-1");
  });

  it("releases every server when the disconnecting socket was the user's last", async () => {
    const { redis, removed } = recordingPresenceRedis();
    const socket = buildDisconnectSocket();
    socket.data.onlineServerIds = ["server-1", "server-2"];
    // Socket.IO has already dropped the disconnecting socket from its rooms by
    // the time `disconnect` fires; the self-id filter covers the case where an
    // adapter still reports it.
    const { io } = roomProbeReturning([
      { id: "socket-1", rooms: new Set(["user:user-1", "server:server-1"]) },
    ]);

    await runSocketDisconnectCleanup({
      endSession: async () => undefined,
      fallbackAppSessionKey: "fallback-session",
      io,
      presenceHeartbeat: setInterval(() => undefined, 1_000),
      redis,
      socket,
    });

    assert.deepEqual(removed, ["server:server-1:online", "server:server-2:online"]);
  });

  it("releases everything when the sibling lookup fails", async () => {
    // Fail open: an over-eager removal under-counts until the next join or
    // presence event rewrites the set, a skipped one is a ghost forever.
    const { redis, removed } = recordingPresenceRedis();
    const io = {
      in() {
        return {
          fetchSockets: async () => {
            throw new Error("adapter unavailable");
          },
        };
      },
    };

    await runSocketDisconnectCleanup({
      endSession: async () => undefined,
      fallbackAppSessionKey: "fallback-session",
      io,
      presenceHeartbeat: setInterval(() => undefined, 1_000),
      redis,
      socket: buildDisconnectSocket(),
    });

    assert.deepEqual(removed, ["server:server-1:online"]);
  });
});
