import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as liveKitServer from "./server";

describe("LiveKit participant grants", () => {
  it("does not let participants rewrite their own identity metadata", () => {
    const buildGrant = (
      liveKitServer as unknown as {
        buildLiveKitParticipantGrant?: (roomName: string) => Record<string, unknown>;
      }
    ).buildLiveKitParticipantGrant;

    assert.equal(typeof buildGrant, "function");
    if (!buildGrant) return;

    const grant = buildGrant("voice:channel-1");
    assert.equal(grant.canUpdateOwnMetadata, undefined);
    assert.equal(grant.room, "voice:channel-1");
    assert.equal(grant.roomJoin, true);
  });
});

describe("LiveKit channel room policy", () => {
  it("resolves only server-allowlisted RTC endpoints", () => {
    assert.equal(
      liveKitServer.resolveLiveKitRtcUrl("EU_WEST", "wss://auto.example.test", {
        EU_WEST: "wss://eu.example.test",
      }),
      "wss://eu.example.test",
    );
    assert.equal(
      liveKitServer.resolveLiveKitRtcUrl(null, "wss://auto.example.test", {}),
      "wss://auto.example.test",
    );
    assert.throws(
      () =>
        liveKitServer.resolveLiveKitRtcUrl("UNKNOWN", "wss://auto.example.test", {
          EU_WEST: "wss://eu.example.test",
        }),
      /not available/i,
    );
  });

  it("creates a missing room with the effective participant ceiling", async () => {
    const calls: unknown[] = [];
    await liveKitServer.ensureVoiceRoomParticipantLimit({
      client: {
        async createRoom(options) {
          calls.push(options);
          return {};
        },
        async listRooms(names) {
          calls.push({ list: names });
          return [];
        },
      },
      roomName: "voice:channel-1",
      userLimit: 4,
    });

    assert.deepEqual(calls, [
      { list: ["voice:channel-1"] },
      { maxParticipants: 4, name: "voice:channel-1", emptyTimeout: 300, departureTimeout: 20 },
    ]);
  });

  it("does not recreate an active room or eject its participants after a limit change", async () => {
    let createCalls = 0;
    await liveKitServer.ensureVoiceRoomParticipantLimit({
      client: {
        async createRoom() {
          createCalls += 1;
          return {};
        },
        async listRooms() {
          return [{ name: "voice:channel-1" }];
        },
      },
      roomName: "voice:channel-1",
      userLimit: 2,
    });
    assert.equal(createCalls, 0);
  });
});

it("screen sources require channel STREAM permission; direct rooms keep sharing", async () => {
  const { TrackSource } = await import("livekit-server-sdk");
  for (const allowed of [false, true]) {
    assert.equal(
      liveKitServer
        .buildLiveKitParticipantGrant("voice:test", allowed)
        .canPublishSources.includes(TrackSource.SCREEN_SHARE),
      allowed,
    );
    assert.equal(
      liveKitServer
        .buildLiveKitParticipantGrant("voice:test", allowed)
        .canPublishSources.includes(TrackSource.SCREEN_SHARE_AUDIO),
      allowed,
    );
    assert.equal(
      liveKitServer
        .buildLiveKitParticipantGrant("dm:test", allowed)
        .canPublishSources.includes(TrackSource.SCREEN_SHARE),
      true,
    );
  }
  assert.equal(
    liveKitServer
      .buildLiveKitParticipantGrant("voice:test")
      .canPublishSources.includes(TrackSource.SCREEN_SHARE),
    false,
  );
});

it("updates an existing participant grant atomically without screen sources", async () => {
  const calls: unknown[][] = [];
  await liveKitServer.updateLiveKitScreenSharePermission("c1", "u1", false, {
    updateParticipant: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
  } as never);
  assert.equal(calls[0]?.[0], "voice:c1");
  assert.equal(calls[0]?.[1], "u1");
  assert.deepEqual((calls[0]?.[2] as { permission: unknown }).permission, {
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: liveKitServer.buildLiveKitParticipantGrant("voice:c1", false)
      .canPublishSources,
  });
});
