import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createInitialMobileVoiceRoomState,
  getMobileVoiceInviteCandidates,
  type MobileVoiceInviteMember,
  mergeMobileVoiceRoomParticipants,
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
    username: "dogukan",
    ...overrides,
  };
}

describe("mobile voice room contract", () => {
  it("starts with safe default audio output routing", () => {
    const state = createInitialMobileVoiceRoomState();

    assert.equal(state.selfAudioOutput, "default");
  });

  it("does not keep stale speaking or audio level state after a participant goes quiet", () => {
    const speaking = createParticipant({
      audioLevel: 0.82,
      isSpeaking: true,
    });
    const quiet = createParticipant({
      audioLevel: 0,
      isSpeaking: false,
    });

    const merged = mergeMobileVoiceRoomParticipants([speaking], [quiet]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.isSpeaking, false);
    assert.equal(merged[0]?.audioLevel, 0);
  });

  it("keeps explicit false media flags from the newest participant snapshot", () => {
    const previous = createParticipant({
      isCameraEnabled: true,
      isMuted: true,
    });
    const next = createParticipant({
      isCameraEnabled: false,
      isMuted: false,
    });

    const merged = mergeMobileVoiceRoomParticipants([previous], [next]);

    assert.equal(merged[0]?.isCameraEnabled, false);
    assert.equal(merged[0]?.isMuted, false);
  });

  it("keeps the newest live camera track and clears it when camera stops", () => {
    const previousTrack = { publication: { trackSid: "old" } };
    const currentTrack = { publication: { trackSid: "new" } };
    const withCamera = mergeMobileVoiceRoomParticipants(
      [
        createParticipant({
          cameraTrackRef: previousTrack as NonNullable<
            MobileVoiceRoomParticipant["cameraTrackRef"]
          >,
          isCameraEnabled: true,
        }),
      ],
      [
        createParticipant({
          cameraTrackRef: currentTrack as NonNullable<
            MobileVoiceRoomParticipant["cameraTrackRef"]
          >,
          isCameraEnabled: true,
        }),
      ],
    );

    assert.equal(withCamera[0]?.cameraTrackRef, currentTrack);
    assert.equal(
      mergeMobileVoiceRoomParticipants(withCamera, [
        createParticipant({ isCameraEnabled: false }),
      ])[0]?.cameraTrackRef,
      undefined,
    );
  });

  it("builds invite candidates only from real online server members outside the active room", () => {
    const members: MobileVoiceInviteMember[] = [
      {
        avatarUrl: null,
        displayName: "Dogukan",
        status: "ONLINE",
        userId: "self",
        username: "dogukan",
      },
      {
        avatarUrl: null,
        displayName: "Joined",
        status: "ONLINE",
        userId: "joined",
        username: "joined",
      },
      {
        avatarUrl: null,
        displayName: "Offline",
        status: "OFFLINE",
        userId: "offline",
        username: "offline",
      },
      {
        avatarUrl: null,
        displayName: "Target",
        status: "IDLE",
        userId: "target",
        username: "target",
      },
    ];

    const candidates = getMobileVoiceInviteCandidates({
      currentUserId: "self",
      members,
      participants: [createParticipant({ userId: "joined" })],
    });

    assert.deepEqual(
      candidates.map((candidate) => candidate.userId),
      ["target"],
    );
    assert.equal(candidates[0]?.label, "Target");
  });
});
