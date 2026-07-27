import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAnalyticsClientInfo } from "@/lib/analytics/client-info";
import {
  getSocketMobileBearerToken,
  joinServerRoomsForUser,
  listServerRoomIdsForUser,
  listServerRoomIdsPage,
  mergeHandshakeAttribution,
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

class MemoryServerRoomRedis {
  status = "ready";
  store = new Map<string, string>();
  setCalls: Array<{ key: string; ttlSeconds: number; value: string }> = [];

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, mode: "EX", ttlSeconds: number) {
    assert.equal(mode, "EX");
    this.store.set(key, value);
    this.setCalls.push({ key, ttlSeconds, value });
    return "OK";
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

    await joinServerRoomsForUser(
      {
        join(room: string | string[]) {
          joinedRooms.push(room);
        },
      },
      "user-1",
      {
        redis: redis as never,
        serverMemberDelegate,
      },
    );

    assert.equal(findManyCalls, 1);
    assert.deepEqual(joinedRooms, [memberships.map((serverId) => `server:${serverId}`)]);
  });
});
