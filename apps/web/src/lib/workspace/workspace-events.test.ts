import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
  buildServerOnlineKey,
  countServerOnlineMembers,
  type ServerOnlinePresenceRedis,
} from "@/lib/socket/server-online-presence";
import { setSocketServer, type AppSocketServer } from "@/lib/socket/runtime";
import { detachUserFromServerSocketRoom } from "./workspace-events";

type Restore = () => void;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

function buildOnlinePresenceRedis() {
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
    status: "ready",
  };

  return { redis, sets };
}

function fakeSocketServerReturning(sockets: unknown[]) {
  let requestedRoom: string | null = null;

  const io = {
    in(room: string) {
      requestedRoom = room;
      return {
        async fetchSockets() {
          return sockets;
        },
      };
    },
  } as unknown as AppSocketServer;

  return { getRequestedRoom: () => requestedRoom, io };
}

describe("detachUserFromServerSocketRoom", { concurrency: false }, () => {
  it("removes the departed user from the server's online-presence set", async () => {
    const restores: Restore[] = [];
    patchMethod(
      prisma.channel,
      "findMany",
      async () => [
        { id: "text-1", type: "TEXT" },
        { id: "voice-1", type: "VOICE" },
      ],
      restores,
    );

    const { redis, sets } = buildOnlinePresenceRedis();
    sets.set(buildServerOnlineKey("server-1"), new Set(["user-1", "user-2"]));

    const leftRooms: string[] = [];
    const socket = {
      data: { onlineServerIds: ["server-1", "server-2"] } as { onlineServerIds?: string[] },
      async leave(room: string) {
        leftRooms.push(room);
      },
    };
    const { io } = fakeSocketServerReturning([socket]);
    setSocketServer(io);

    try {
      const detachedVoiceUsers: string[] = [];
      await (
        detachUserFromServerSocketRoom as unknown as (
          userId: string,
          serverId: string,
          options: {
            detachVoice(userId: string): Promise<unknown>;
            redis: ServerOnlinePresenceRedis;
          },
        ) => Promise<unknown>
      )("user-1", "server-1", {
        async detachVoice(userId) {
          detachedVoiceUsers.push(userId);
        },
        redis,
      });

      // The kicked/banned/departed user must no longer count as online for
      // the server they left, even though user-2 still does.
      assert.equal(await countServerOnlineMembers(redis, "server-1"), 1);
      assert.deepEqual([...(sets.get(buildServerOnlineKey("server-1")) ?? [])].sort(), ["user-2"]);

      // The socket's own bookkeeping must agree, or a later presence
      // transition could resurrect the user into a server they no longer
      // belong to.
      assert.deepEqual(socket.data.onlineServerIds, ["server-2"]);
      assert.deepEqual(leftRooms, [
        "server:server-1",
        "text-1",
        "voice-1",
        "voice-viewers:voice-1",
      ]);
      assert.deepEqual(detachedVoiceUsers, ["user-1"]);
    } finally {
      setSocketServer(null as unknown as AppSocketServer);
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("removes a stale online-presence entry even when no live socket is in the room", async () => {
    const restores: Restore[] = [];
    patchMethod(prisma.channel, "findMany", async () => [], restores);

    const { redis, sets } = buildOnlinePresenceRedis();
    // Simulates a crashed socket that never got a clean disconnect: the user
    // is still marked online in Redis even though nothing is connected now.
    sets.set(buildServerOnlineKey("server-1"), new Set(["user-1"]));

    const { io } = fakeSocketServerReturning([]);
    setSocketServer(io);

    try {
      await detachUserFromServerSocketRoom("user-1", "server-1", {
        detachVoice: async () => null,
        redis,
      });

      assert.equal(await countServerOnlineMembers(redis, "server-1"), 0);
    } finally {
      setSocketServer(null as unknown as AppSocketServer);
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });
});
