import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Track } from "livekit-client";

import { collectVoiceParticipants } from "./participant-view-model";

const currentUser = {
  id: "user-1",
  avatarUrl: "https://example.com/me.png",
  displayName: "Current User",
  username: "current",
};

function createParticipant(input: {
  audioLevel?: number;
  identity: string;
  isMicrophoneEnabled?: boolean;
  isSpeaking?: boolean;
  metadata?: string | null;
  name?: string | null;
  publications?: Array<{
    isMuted?: boolean;
    source: string;
    trackSid: string;
    videoTrack?: unknown;
  }>;
}) {
  const publications = input.publications ?? [];

  return {
    audioLevel: input.audioLevel ?? 0,
    getTrackPublication(source: string) {
      const publication = publications.find((entry) => entry.source === source);
      if (!publication) {
        return null;
      }

      return {
        isMuted: publication.isMuted ?? false,
        videoTrack: publication.videoTrack ?? null,
      };
    },
    identity: input.identity,
    isMicrophoneEnabled: input.isMicrophoneEnabled ?? false,
    isSpeaking: input.isSpeaking ?? false,
    metadata: input.metadata ?? null,
    name: input.name ?? null,
  };
}

describe("voice participant view models", () => {
  it("collects local and remote participants with audio and camera state", () => {
    const localCameraTrack = {};
    const remoteCameraTrack = {};
    const localParticipant = createParticipant({
      audioLevel: 0.4,
      identity: "user-1",
      isMicrophoneEnabled: true,
      isSpeaking: true,
      publications: [
        {
          source: Track.Source.Camera,
          trackSid: "local-camera",
          videoTrack: localCameraTrack,
        },
        {
          source: Track.Source.Microphone,
          trackSid: "local-mic",
        },
      ],
    });
    const remoteParticipant = createParticipant({
      audioLevel: 0.5,
      identity: "user-2",
      isMicrophoneEnabled: true,
      isSpeaking: true,
      metadata: JSON.stringify({
        avatarUrl: "https://example.com/remote.png",
        displayName: "Remote User",
        username: "remote",
      }),
      publications: [
        {
          source: Track.Source.Camera,
          trackSid: "remote-camera",
          videoTrack: remoteCameraTrack,
        },
      ],
    });
    const room = {
      localParticipant,
      remoteParticipants: new Map([["user-2", remoteParticipant]]),
    };

    assert.deepEqual(collectVoiceParticipants(room as never, currentUser), [
      {
        audioLevel: 0.4,
        avatarUrl: "https://example.com/me.png",
        cameraTrack: localCameraTrack,
        displayName: "Current User",
        isCameraEnabled: true,
        isLocal: true,
        isMuted: false,
        isSpeaking: true,
        userId: "user-1",
        username: "current",
      },
      {
        audioLevel: 0.5,
        avatarUrl: "https://example.com/remote.png",
        cameraTrack: remoteCameraTrack,
        displayName: "Remote User",
        isCameraEnabled: true,
        isLocal: false,
        isMuted: false,
        isSpeaking: true,
        userId: "user-2",
        username: "remote",
      },
    ]);
  });
});
