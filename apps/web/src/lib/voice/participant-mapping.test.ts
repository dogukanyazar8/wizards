import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Track } from "livekit-client";

import {
  collectScreenShares,
  countActiveScreenShares,
  getParticipantCameraState,
  getParticipantDeafenState,
  getParticipantProfile,
  getScreenShareId,
  parseParticipantMetadata,
} from "./participant-mapping";

const currentUser = {
  id: "user-1",
  avatarUrl: "https://example.com/me.png",
  displayName: "Current User",
  username: "current",
};

function createParticipant(input: {
  identity: string;
  isCameraMuted?: boolean;
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
    getTrackPublications() {
      return publications;
    },
    identity: input.identity,
    metadata: input.metadata ?? null,
    name: input.name ?? null,
  };
}

describe("voice participant mapping helpers", () => {
  it("parses participant metadata safely", () => {
    assert.deepEqual(parseParticipantMetadata({ metadata: null }), {});
    assert.deepEqual(parseParticipantMetadata({ metadata: "not-json" }), {});
    assert.deepEqual(
      parseParticipantMetadata({
        metadata: JSON.stringify({
          avatarUrl: "https://example.com/a.png",
          displayName: "Alice",
          isDeafened: true,
          username: "alice",
        }),
      }),
      {
        avatarUrl: "https://example.com/a.png",
        displayName: "Alice",
        isDeafened: true,
        username: "alice",
      },
    );
  });

  it("prefers the current user snapshot for the local participant", () => {
    assert.deepEqual(
      getParticipantProfile(
        createParticipant({
          identity: "user-1",
          metadata: JSON.stringify({ username: "stale" }),
          name: "Stale",
        }) as never,
        currentUser,
      ),
      {
        avatarUrl: "https://example.com/me.png",
        displayName: "Current User",
        userId: "user-1",
        username: "current",
      },
    );
  });

  it("falls back through metadata, participant name, and identity for remote profiles", () => {
    assert.deepEqual(
      getParticipantProfile(
        createParticipant({
          identity: "user-2",
          metadata: JSON.stringify({ displayName: "Display Only" }),
          name: "LiveKit Name",
        }) as never,
        currentUser,
      ),
      {
        avatarUrl: null,
        displayName: "Display Only",
        userId: "user-2",
        username: "Display Only",
      },
    );
  });

  it("maps camera publications only when the camera track is present and unmuted", () => {
    const cameraTrack = {};

    assert.deepEqual(
      getParticipantCameraState(
        createParticipant({
          identity: "user-2",
          publications: [
            {
              source: Track.Source.Camera,
              trackSid: "camera-track",
              videoTrack: cameraTrack,
            },
          ],
        }) as never,
      ),
      {
        cameraTrack,
        isCameraEnabled: true,
      },
    );
    assert.deepEqual(
      getParticipantCameraState(
        createParticipant({
          identity: "user-2",
          publications: [
            {
              isMuted: true,
              source: Track.Source.Camera,
              trackSid: "camera-track",
              videoTrack: cameraTrack,
            },
          ],
        }) as never,
      ),
      {
        cameraTrack: null,
        isCameraEnabled: false,
      },
    );
  });

  it("reads remote deafen state from participant metadata", () => {
    assert.equal(
      getParticipantDeafenState(
        createParticipant({
          identity: "user-2",
          metadata: JSON.stringify({ isDeafened: true }),
        }) as never,
      ),
      true,
    );
    assert.equal(
      getParticipantDeafenState(
        createParticipant({
          identity: "user-2",
          metadata: JSON.stringify({ isDeafened: false }),
        }) as never,
      ),
      false,
    );
  });

  it("collects only active screen-share publications", () => {
    const localShareTrack = {};
    const remoteShareTrack = {};
    const localParticipant = createParticipant({
      identity: "user-1",
      publications: [
        {
          source: Track.Source.ScreenShare,
          trackSid: "local-share",
          videoTrack: localShareTrack,
        },
      ],
    });
    const remoteParticipant = createParticipant({
      identity: "user-2",
      metadata: JSON.stringify({ username: "remote" }),
      publications: [
        {
          source: Track.Source.ScreenShare,
          trackSid: "remote-muted",
          isMuted: true,
          videoTrack: {},
        },
        {
          source: Track.Source.ScreenShare,
          trackSid: "remote-share",
          videoTrack: remoteShareTrack,
        },
      ],
    });
    const room = {
      localParticipant,
      remoteParticipants: new Map([["user-2", remoteParticipant]]),
    };

    assert.equal(getScreenShareId("user-2", "track-1"), "user-2:track-1");
    assert.equal(countActiveScreenShares(room as never), 2);
    assert.deepEqual(collectScreenShares(room as never, currentUser), [
      {
        avatarUrl: "https://example.com/me.png",
        displayName: "Current User",
        id: "user-1:local-share",
        isLocal: true,
        participantId: "user-1",
        track: localShareTrack,
        trackSid: "local-share",
        username: "current",
      },
      {
        avatarUrl: null,
        displayName: null,
        id: "user-2:remote-share",
        isLocal: false,
        participantId: "user-2",
        track: remoteShareTrack,
        trackSid: "remote-share",
        username: "remote",
      },
    ]);
  });
});
