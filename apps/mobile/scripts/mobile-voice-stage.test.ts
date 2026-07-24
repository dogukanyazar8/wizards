import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOBILE_VOICE_STAGE_TILES_PER_PAGE,
  buildMobileVoiceStageTiles,
  getMobileVoiceStageMode,
  getMobileVoiceStageTileLayout,
  paginateMobileVoiceStageTiles,
  selectMobileVoiceStageAudience,
} from "../src/voice/mobile-voice-stage";
import type { MobileVoiceRoomParticipant } from "../src/voice/mobile-voice-room-contract";

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

describe("mobile voice stage", () => {
  it("reports audio mode when nobody publishes camera or screen", () => {
    const participants = [
      createParticipant({ userId: "a", username: "ali" }),
      createParticipant({ userId: "b", username: "veli", isMuted: true }),
    ];

    assert.equal(getMobileVoiceStageMode(participants), "audio");
    assert.deepEqual(buildMobileVoiceStageTiles(participants), []);
  });

  it("switches to video mode when at least one camera or screen is live", () => {
    const cameraOnly = [createParticipant({ userId: "a", isCameraEnabled: true })];
    const screenOnly = [createParticipant({ userId: "b", isScreenSharing: true })];

    assert.equal(getMobileVoiceStageMode(cameraOnly), "video");
    assert.equal(getMobileVoiceStageMode(screenOnly), "video");
  });

  it("emits one tile per live camera and screen, camera before screen for the same user", () => {
    const participants = [
      createParticipant({
        userId: "a",
        username: "ali",
        isSelf: true,
        isCameraEnabled: true,
        isScreenSharing: true,
      }),
    ];

    const tiles = buildMobileVoiceStageTiles(participants);

    assert.deepEqual(
      tiles.map((tile) => ({ key: tile.key, kind: tile.kind, userId: tile.participant.userId })),
      [
        { key: "a:camera", kind: "camera", userId: "a" },
        { key: "a:screen", kind: "screen", userId: "a" },
      ],
    );
  });

  it("orders tiles by self first, then room join order, ignoring speaking churn", () => {
    const participants = [
      // Deliberately shuffled + a speaker that must NOT be promoted on the stage.
      createParticipant({ userId: "c", isCameraEnabled: true, joinedAt: 300, isSpeaking: true }),
      createParticipant({ userId: "self", isCameraEnabled: true, joinedAt: 999, isSelf: true }),
      createParticipant({ userId: "a", isCameraEnabled: true, joinedAt: 100 }),
      createParticipant({ userId: "b", isCameraEnabled: true, joinedAt: 200 }),
    ];

    const tiles = buildMobileVoiceStageTiles(participants);

    assert.deepEqual(
      tiles.map((tile) => tile.participant.userId),
      ["self", "a", "b", "c"],
    );
  });

  it("paginates tiles four per screen preserving order", () => {
    const participants = Array.from({ length: 5 }, (_, index) =>
      createParticipant({
        userId: `u${index}`,
        isCameraEnabled: true,
        joinedAt: index,
      }),
    );

    const pages = paginateMobileVoiceStageTiles(buildMobileVoiceStageTiles(participants));

    assert.equal(MOBILE_VOICE_STAGE_TILES_PER_PAGE, 4);
    assert.equal(pages.length, 2);
    assert.deepEqual(
      pages[0]!.map((tile) => tile.participant.userId),
      ["u0", "u1", "u2", "u3"],
    );
    assert.deepEqual(
      pages[1]!.map((tile) => tile.participant.userId),
      ["u4"],
    );
  });

  it("returns an efficient row layout for one through four tiles", () => {
    assert.deepEqual(getMobileVoiceStageTileLayout(1).rows, [1]);
    assert.deepEqual(getMobileVoiceStageTileLayout(2).rows, [1, 1]);
    assert.deepEqual(getMobileVoiceStageTileLayout(3).rows, [1, 2]);
    assert.deepEqual(getMobileVoiceStageTileLayout(4).rows, [2, 2]);
  });

  it("clamps a full page layout and never exceeds four tiles per screen", () => {
    assert.deepEqual(getMobileVoiceStageTileLayout(6).rows, [2, 2]);
    assert.deepEqual(getMobileVoiceStageTileLayout(0).rows, []);
  });

  it("keeps only camera-off, non-sharing members in the audio rail", () => {
    const participants = [
      createParticipant({ userId: "self", isSelf: true }),
      createParticipant({ userId: "cam", isCameraEnabled: true }),
      createParticipant({ userId: "screen", isScreenSharing: true }),
      createParticipant({ userId: "listener" }),
    ];

    const audience = selectMobileVoiceStageAudience(participants);

    assert.deepEqual(
      audience.map((participant) => participant.userId),
      ["self", "listener"],
    );
  });
});
