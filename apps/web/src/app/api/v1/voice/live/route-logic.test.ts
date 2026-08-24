import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import {
  UNAUTHENTICATED,
  createFakeDatabase,
  fakeChannelResolver,
  fakePresenceStateReader,
  readJson,
  recordRateLimit,
} from "@/lib/home/home-test-doubles";
import { toRelativeAppHref } from "@/lib/home/href";
import { listHomeLiveRooms } from "@/lib/home/live-service";
import { VoiceLiveResponseSchema } from "@/lib/home/types";
import { VOICE_HEARTBEAT_TIMEOUT_MS } from "@/lib/voice/types";

import { voiceLiveRoute, type VoiceLiveRouteDependencies } from "./route-logic";

const NOW = new Date("2026-08-19T09:00:00.000Z");

function voiceState(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    channel: {
      id: "c-voice",
      name: "Genel Sohbet",
      server: { id: "s1", name: "Whispr" },
      topic: "sabah toplantısı",
    },
    channelId: "c-voice",
    user: { avatarUrl: null, displayName: null, id: userId, username: userId },
    ...overrides,
  };
}

function liveDatabase(
  overrides: { groups?: readonly unknown[]; states?: readonly unknown[] } = {},
) {
  return createFakeDatabase({
    models: {
      dMParticipant: { findMany: () => overrides.groups ?? [] },
      serverMember: { findMany: () => [{ serverId: "s1" }] },
      user: {
        findMany: () => [{ avatarUrl: null, displayName: "Kerem", id: "u9", username: "kerem" }],
      },
      voiceState: {
        findMany: () =>
          overrides.states ?? [
            voiceState("u2"),
            voiceState("u3"),
            voiceState("u4"),
            voiceState("u5"),
            voiceState("u6"),
          ],
      },
    },
  });
}

function serviceDependencies(
  database: ReturnType<typeof liveDatabase>["database"],
  callStates: readonly (string | null)[] = [],
  hidden: readonly string[] = [],
) {
  return {
    database,
    listVisibleChannels: fakeChannelResolver({ s1: ["c-voice"] }),
    now: NOW,
    readCallStates: () => Promise.resolve([...callStates]),
    readPresence: fakePresenceStateReader({ u2: "ONLINE", u3: "OFFLINE", u9: "ONLINE" }, hidden),
  };
}

function routeDependencies(
  overrides: Partial<VoiceLiveRouteDependencies> = {},
): VoiceLiveRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    listRooms: () => Promise.resolve({ rooms: [], totalCount: 0 }),
    ...overrides,
  };
}

describe("GET /api/v1/voice/live", () => {
  it("caps the roster at four while reporting the real headcount", async () => {
    const { database } = liveDatabase();

    const payload = VoiceLiveResponseSchema.parse(
      await listHomeLiveRooms("u1", 4, serviceDependencies(database)),
    );

    const room = payload.rooms[0];
    assert.equal(room?.participants.length, 4);
    assert.equal(room?.participantCount, 5);
    assert.equal(room?.kind, "voice");
    assert.equal(room?.serverName, "Whispr");
    assert.equal(room?.caption, "sabah toplantısı");
    // Audio level is live data; the server never invents one.
    assert.equal(room?.speaker, null);
    assert.equal(toRelativeAppHref(room?.href ?? ""), room?.href);
  });

  it("rejects a request without a session", async () => {
    const response = await voiceLiveRoute(
      new Request("https://whispr.test/api/v1/voice/live"),
      routeDependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson(response), { error: "Unauthorized" });
  });

  it("shows nothing to somebody who was removed from the server", async () => {
    const { calls, database } = liveDatabase();

    const payload = await listHomeLiveRooms("u1", 4, {
      ...serviceDependencies(database),
      listVisibleChannels: fakeChannelResolver({ s1: [] }),
    });

    assert.deepEqual(payload.rooms, []);
    // The room query is not issued at all — there is nothing to filter later.
    assert.ok(!calls.some((call) => call.operation === "voiceState.findMany"));
  });

  it("draws a participant the viewer may see with the redacted dot", async () => {
    const { database } = liveDatabase({ states: [voiceState("u2"), voiceState("u3")] });

    const payload = await listHomeLiveRooms("u1", 4, serviceDependencies(database));

    assert.deepEqual(
      payload.rooms[0]?.participants.map((participant) => [participant.id, participant.presence]),
      [
        ["u2", "ONLINE"],
        ["u3", "OFFLINE"],
      ],
    );
  });

  it("keeps an invisible participant out of the roster and out of the count", async () => {
    const { database } = liveDatabase({ states: [voiceState("u2"), voiceState("u3")] });

    const payload = await listHomeLiveRooms("u1", 4, serviceDependencies(database, [], ["u3"]));

    assert.deepEqual(
      payload.rooms[0]?.participants.map((participant) => participant.id),
      ["u2"],
    );
    // Redacting only the dot would still say "u3 is in this room".
    assert.equal(payload.rooms[0]?.participantCount, 1);
  });

  it("does not draw a room whose whole roster is hidden from the viewer", async () => {
    const { database } = liveDatabase({ states: [voiceState("u3")] });

    const payload = await listHomeLiveRooms("u1", 4, serviceDependencies(database, [], ["u3"]));

    assert.deepEqual(payload.rooms, []);
    assert.equal(payload.totalCount, 0);
  });

  it("filters on the cleanup's own heartbeat cutoff rather than a second one", async () => {
    const { calls, database } = liveDatabase();

    await listHomeLiveRooms("u1", 4, serviceDependencies(database));

    const call = calls.find((entry) => entry.operation === "voiceState.findMany");
    const where = (call?.args as { where?: { lastHeartbeat?: { gte?: Date } } })?.where;
    assert.deepEqual(
      where?.lastHeartbeat?.gte,
      new Date(NOW.getTime() - VOICE_HEARTBEAT_TIMEOUT_MS),
    );
  });

  it("is registered in the rate limit table and charged before any work", async () => {
    assert.deepEqual(API_RATE_LIMITS["voice:live:list"], { limit: 60, windowSeconds: 60 });

    const recorded: string[] = [];
    await voiceLiveRoute(
      new Request("https://whispr.test/api/v1/voice/live"),
      routeDependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["voice:live:list"]);
  });

  it("counts every open room, not the ones the limit left", async () => {
    const { database } = liveDatabase({
      states: [
        voiceState("u2"),
        voiceState("u3", {
          channel: {
            id: "c-two",
            name: "İkinci",
            server: { id: "s1", name: "Whispr" },
            topic: null,
          },
          channelId: "c-two",
        }),
        voiceState("u4", {
          channel: {
            id: "c-three",
            name: "Üçüncü",
            server: { id: "s1", name: "Whispr" },
            topic: null,
          },
          channelId: "c-three",
        }),
      ],
    });

    const payload = VoiceLiveResponseSchema.parse(
      await listHomeLiveRooms("u1", 1, {
        ...serviceDependencies(database),
        listVisibleChannels: fakeChannelResolver({ s1: ["c-voice", "c-two", "c-three"] }),
      }),
    );

    // The card renders one room but its header still says three are open.
    assert.equal(payload.rooms.length, 1);
    assert.equal(payload.totalCount, 3);
  });

  it("costs at most four queries, group calls included", async () => {
    const { database, queryCount } = liveDatabase({
      groups: [{ conversation: { id: "conv-1", name: "Takım" } }],
    });

    const payload = await listHomeLiveRooms(
      "u1",
      4,
      serviceDependencies(database, [
        JSON.stringify({
          participants: [{ joinedAt: NOW.toISOString(), userId: "u9" }],
          startedAt: NOW.toISOString(),
          video: false,
        }),
      ]),
    );

    assert.equal(queryCount(), 4);
    assert.deepEqual(
      payload.rooms.map((room) => room.kind),
      ["voice", "call"],
    );
  });
});
