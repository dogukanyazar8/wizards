import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConnectionState } from "livekit-client";
import {
  buildVoiceMiniSnapshot,
  resolveVoiceMiniConnectionQuality,
} from "@/lib/desktop/voice-mini";
import type { VoiceParticipantViewModel } from "@/lib/voice/participant-view-model";

function participant(
  overrides: Partial<VoiceParticipantViewModel> = {},
): VoiceParticipantViewModel {
  return {
    audioLevel: 0.42,
    avatarUrl: "https://whispr.test/avatar.png",
    cameraTrack: null,
    displayName: "Codex",
    isCameraEnabled: false,
    isDeafened: false,
    isLocal: false,
    isMuted: false,
    isSpeaking: true,
    userId: "user-1",
    username: "codex",
    ...overrides,
  };
}

describe("desktop voice mini snapshot", () => {
  it("sanitizes the exported participant payload", () => {
    const snapshot = buildVoiceMiniSnapshot({
      activeChannelId: "channel-1",
      connectionState: ConnectionState.Connected,
      isDeafened: true,
      isMuted: true,
      participants: [
        participant({
          audioLevel: 3,
          avatarUrl: "javascript:alert(1)",
          displayName: "A".repeat(120),
          isLocal: true,
          userId: "u".repeat(180),
        }),
      ],
      socketConnected: true,
    });

    assert.equal(snapshot.active, true);
    assert.equal(snapshot.participants.length, 1);
    assert.equal(snapshot.participants[0]?.avatarUrl, null);
    assert.equal(snapshot.participants[0]?.audioLevel, 1);
    assert.equal(snapshot.participants[0]?.displayName.length, 80);
    assert.equal(snapshot.participants[0]?.isDeafened, true);
    assert.equal(snapshot.participants[0]?.isMuted, true);
    assert.equal(snapshot.participants[0]?.userId.length, 128);
    assert.deepEqual(Object.keys(snapshot.participants[0] ?? {}).sort(), [
      "audioLevel",
      "avatarUrl",
      "displayName",
      "isDeafened",
      "isLocal",
      "isMuted",
      "isSpeaking",
      "userId",
    ]);
  });

  it("caps the payload to a small participant roster", () => {
    const snapshot = buildVoiceMiniSnapshot({
      activeChannelId: "channel-1",
      connectionState: ConnectionState.Connected,
      isDeafened: false,
      isMuted: false,
      participants: Array.from({ length: 20 }, (_, index) =>
        participant({ userId: `user-${index}` }),
      ),
      socketConnected: true,
    });

    assert.equal(snapshot.participants.length, 12);
  });

  it("preserves remote participant deafen state for desktop overlays", () => {
    const snapshot = buildVoiceMiniSnapshot({
      activeChannelId: "channel-1",
      connectionState: ConnectionState.Connected,
      isDeafened: false,
      isMuted: false,
      participants: [
        participant({
          isDeafened: true,
          isLocal: false,
          userId: "remote-user",
        }),
      ],
      socketConnected: true,
    });

    assert.equal(snapshot.participants[0]?.isDeafened, true);
  });

  it("minimizes exported identity fields in streamer privacy mode", () => {
    const snapshot = buildVoiceMiniSnapshot({
      activeChannelId: "channel-1",
      connectionState: ConnectionState.Connected,
      isDeafened: false,
      isMuted: true,
      participants: [
        participant({
          avatarUrl: "https://whispr.test/private-avatar.png",
          displayName: "Private Broadcaster",
          isLocal: true,
          userId: "real-user-id",
        }),
      ],
      privacyMode: "streamer",
      socketConnected: true,
    });

    assert.equal(snapshot.privacyMode, "streamer");
    assert.equal(snapshot.participants[0]?.avatarUrl, null);
    assert.equal(snapshot.participants[0]?.displayName, "Voice participant");
    assert.equal(snapshot.participants[0]?.userId, "participant-1");
    assert.equal(snapshot.participants[0]?.isMuted, true);
    assert.equal(snapshot.participants[0]?.audioLevel, 0.42);
  });

  it("marks realtime loss without treating it as participant data", () => {
    assert.equal(
      resolveVoiceMiniConnectionQuality({
        activeChannelId: "channel-1",
        connectionState: ConnectionState.Connected,
        socketConnected: false,
      }),
      "lost",
    );
  });
});
