import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceMobileVoiceSessionGeneration,
  createInitialMobileVoiceRoomState,
  getMobileVoiceInviteCandidates,
  hasVoiceRoomContext,
  isCurrentMobileVoiceSessionGeneration,
  isVoiceSessionActive,
  type MobileVoiceInviteMember,
  mergeMobileVoiceRoomParticipants,
  type MobileVoiceRoomParticipant,
  transitionMobileVoiceRoomConnectionState,
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
    assert.equal(state.connectedAt, null);
  });

  it("models every voice session status without treating terminal routes as active", () => {
    const initial = {
      ...createInitialMobileVoiceRoomState(),
      channelId: "voice-1",
      channelName: "Daily standup",
      serverId: "server-1",
    };
    const statuses = [
      "checking-permission",
      "connecting",
      "connected",
      "reconnecting",
      "leaving",
      "error",
      "permission-denied",
      "idle",
    ] as const;

    for (const status of statuses) {
      const next = transitionMobileVoiceRoomConnectionState(initial, status, 1_000);
      assert.equal(
        isVoiceSessionActive(next.status),
        status === "connecting" || status === "connected" || status === "reconnecting",
      );
    }
  });

  it("keeps connectedAt stable throughout reconnecting and resets it for terminal states", () => {
    const initial = {
      ...createInitialMobileVoiceRoomState(),
      channelId: "voice-1",
      channelName: "Daily standup",
      serverId: "server-1",
      status: "connecting" as const,
    };
    const connected = transitionMobileVoiceRoomConnectionState(initial, "connected", 1_000);
    const reconnecting = transitionMobileVoiceRoomConnectionState(connected, "reconnecting", 2_000);
    const reconnected = transitionMobileVoiceRoomConnectionState(reconnecting, "connected", 3_000);
    const failed = transitionMobileVoiceRoomConnectionState(reconnected, "error", 4_000);

    assert.equal(connected.connectedAt, 1_000);
    assert.equal(reconnecting.connectedAt, 1_000);
    assert.equal(reconnected.connectedAt, 1_000);
    assert.equal(failed.connectedAt, null);
    assert.equal(failed.updatedAt, 4_000);
  });

  it("accepts only the current generation so late callbacks cannot revive an obsolete room", () => {
    const firstGeneration = advanceMobileVoiceSessionGeneration(0);
    const currentGeneration = advanceMobileVoiceSessionGeneration(firstGeneration);
    let applied = false;

    if (isCurrentMobileVoiceSessionGeneration(firstGeneration, currentGeneration)) {
      applied = true;
    }

    assert.equal(firstGeneration, 1);
    assert.equal(currentGeneration, 2);
    assert.equal(applied, false);
  });

  it("requires validated room metadata before retaining a full voice route context", () => {
    const state = transitionMobileVoiceRoomConnectionState(
      {
        ...createInitialMobileVoiceRoomState(),
        channelId: "voice-1",
        channelName: "Daily standup",
        errorMessage: "Connection dropped.",
        serverId: "server-1",
      },
      "error",
      1_000,
    );

    assert.equal(hasVoiceRoomContext(state), true);
    assert.equal(
      hasVoiceRoomContext({
        ...state,
        channelName: null,
      }),
      false,
    );
    assert.equal(hasVoiceRoomContext({ ...state, status: "idle" }), false);
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
          cameraTrackRef: currentTrack as NonNullable<MobileVoiceRoomParticipant["cameraTrackRef"]>,
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

  it("keeps a known join time when a later snapshot omits it", () => {
    const withJoin = mergeMobileVoiceRoomParticipants(
      [],
      [createParticipant({ userId: "a", joinedAt: 123 })],
    );
    assert.equal(withJoin[0]?.joinedAt, 123);

    // A server voice-state sync never carries the LiveKit join time, so a merge
    // that let its undefined win would forget the stage order every few seconds.
    const afterSync = mergeMobileVoiceRoomParticipants(withJoin, [
      createParticipant({ userId: "a", joinedAt: undefined }),
    ]);
    assert.equal(afterSync[0]?.joinedAt, 123);
  });

  it("adopts an incoming join time when it becomes known", () => {
    const seeded = mergeMobileVoiceRoomParticipants(
      [createParticipant({ userId: "a" })],
      [createParticipant({ userId: "a", joinedAt: 456 })],
    );
    assert.equal(seeded[0]?.joinedAt, 456);
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
