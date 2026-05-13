import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  joinServerRoomsForUser,
  listServerRoomIdsPage,
  SOCKET_SERVER_ROOM_JOIN_BATCH_SIZE,
} from "./server";

describe("socket server room joins", () => {
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

  it("joins all server rooms in bounded pages without materializing every membership", async () => {
    const memberships = ["server-1", "server-2", "server-3", "server-4", "server-5"];
    const pageSizes: number[] = [];
    const cursors: Array<string | undefined> = [];
    const joinedRooms: string[] = [];
    const serverMemberDelegate = {
      async findMany(args: {
        cursor?: { userId_serverId: { serverId: string; userId: string } };
        take: number;
      }) {
        pageSizes.push(args.take);
        cursors.push(args.cursor?.userId_serverId.serverId);
        const start = args.cursor
          ? memberships.indexOf(args.cursor.userId_serverId.serverId) + 1
          : 0;
        return memberships
          .slice(start, start + args.take)
          .map((serverId) => ({ serverId }));
      },
    };

    await joinServerRoomsForUser(
      {
        join(room: string) {
          joinedRooms.push(room);
        },
      },
      "user-1",
      {
        batchSize: 2,
        serverMemberDelegate,
      },
    );

    assert.deepEqual(joinedRooms, memberships.map((serverId) => `server:${serverId}`));
    assert.deepEqual(pageSizes, [2, 2, 2]);
    assert.deepEqual(cursors, [undefined, "server-2", "server-4"]);
  });
});
