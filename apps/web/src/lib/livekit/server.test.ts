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
      { maxParticipants: 4, name: "voice:channel-1" },
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
