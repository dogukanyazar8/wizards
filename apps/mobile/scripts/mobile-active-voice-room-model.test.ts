import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMobileActiveVoiceRoomModel } from "../src/app/screens/active-voice-room-model";
import {
  createInitialMobileVoiceRoomState,
  type MobileVoiceRoomParticipant,
} from "../src/voice/mobile-voice-room-contract";

function createParticipant(
  overrides: Partial<MobileVoiceRoomParticipant>,
): MobileVoiceRoomParticipant {
  return {
    audioLevel: 0,
    avatarUrl: null,
    displayName: null,
    isCameraEnabled: false,
    isMuted: false,
    isScreenSharing: false,
    isSelf: false,
    isSpeaking: false,
    userId: "user-1",
    username: "user-1",
    ...overrides,
  };
}

describe("mobile active voice room model", () => {
  it("derives the connected room, duration, and participant states without changing them", () => {
    const participants = [
      createParticipant({ audioLevel: 0.82, isSpeaking: true, userId: "speaker" }),
      createParticipant({ isMuted: true, userId: "muted" }),
    ];
    const room = {
      ...createInitialMobileVoiceRoomState(),
      channelId: "voice-1",
      channelName: "live-room",
      connectedAt: 1_000,
      participants,
      serverId: "server-1",
      status: "connected" as const,
    };

    const model = getMobileActiveVoiceRoomModel(room, "UAT ENV", 1_457_000);

    assert.equal(model.channelName, "live-room");
    assert.equal(model.serverName, "UAT ENV");
    assert.equal(model.connectionStatus, "connected");
    assert.equal(model.durationLabel, "24:16");
    assert.equal(model.participants, participants);
    assert.equal(model.participants[0]?.isSpeaking, true);
    assert.equal(model.participants[1]?.isMuted, true);
  });

  it("keeps transient states empty instead of inventing a room participant or server", () => {
    for (const status of ["connecting", "reconnecting", "error"] as const) {
      const model = getMobileActiveVoiceRoomModel(
        {
          ...createInitialMobileVoiceRoomState(),
          channelId: "voice-1",
          channelName: "live-room",
          serverId: "server-1",
          status,
        },
        null,
        10_000,
      );

      assert.equal(model.connectionStatus, status);
      assert.equal(model.durationLabel, null);
      assert.equal(model.serverName, null);
      assert.deepEqual(model.participants, []);
    }
  });
});
