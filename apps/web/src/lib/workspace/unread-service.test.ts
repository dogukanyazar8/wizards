import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setSocketServer } from "@/lib/socket/runtime";
import {
  MOBILE_UNREAD_COUNT_CAP,
  buildServerChannelUnreadQuery,
  buildServerUnreadTotalsQuery,
  getActiveChannelViewerUserIds,
  getOnlineServerMemberCount,
  groupUsersByVisibleChannelIds,
} from "./unread-service";

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
    let requestedRoom: string | null = null;
    const socketServer = {
      in(room: string) {
        requestedRoom = room;

        return {
          async fetchSockets() {
            return [
              { data: { presenceStatus: "ONLINE", userId: "user-1" } },
              { data: { presenceStatus: "IDLE", userId: "user-2" } },
              { data: { presenceStatus: "OFFLINE", userId: "user-3" } },
              { data: { presenceStatus: "DND", userId: "user-1" } },
              { data: { presenceStatus: "ONLINE" } },
            ];
          },
        };
      },
    } as unknown as Parameters<typeof setSocketServer>[0];

    setSocketServer(socketServer);

    const count = await getOnlineServerMemberCount("server-1");

    assert.equal(requestedRoom, "server:server-1");
    assert.equal(count, 2);
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
