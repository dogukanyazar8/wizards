import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Track } from "livekit-client";

import {
  resumeRemoteVideoFromBackground,
  suspendRemoteVideoForBackground,
  type BackgroundVideoPublication,
  type BackgroundVideoRoom,
} from "./remote-video-background";

type PublicationInput = {
  enabled?: boolean;
  kind?: string;
  local?: boolean;
  subscribed?: boolean;
  trackSid: string;
  /** Mimics a livekit build that refuses the settings change. */
  refuses?: boolean;
  /** Mimics a build without the internals used to hand control back. */
  withoutInternals?: boolean;
};

type TestPublication = {
  emitTrackUpdate?: () => void;
  emitted: number;
  isEnabled: boolean;
  isSubscribed: boolean;
  kind: string;
  requestedDisabled?: boolean | undefined;
  setEnabled?: (enabled: boolean) => void;
  setEnabledCalls: boolean[];
  trackSid: string;
};

function createPublication(input: PublicationInput): TestPublication {
  const publication: TestPublication = {
    emitted: 0,
    isEnabled: input.enabled ?? true,
    isSubscribed: input.subscribed ?? true,
    kind: input.kind ?? Track.Kind.Video,
    setEnabledCalls: [],
    trackSid: input.trackSid,
  };

  // A local publication carries no `setEnabled`: it belongs to the local-media
  // rule, and this one must skip it.
  if (!input.local) {
    publication.setEnabled = (enabled: boolean) => {
      publication.setEnabledCalls.push(enabled);

      if (input.refuses) {
        return;
      }

      publication.isEnabled = enabled;

      if (!input.withoutInternals) {
        publication.requestedDisabled = !enabled;
      }
    };
  }

  // A build that still exposes livekit's internals lets the rule hand control
  // back instead of pinning the track to enabled.
  if (!input.withoutInternals) {
    publication.requestedDisabled = undefined;
    publication.emitTrackUpdate = () => {
      publication.emitted += 1;
    };
  }

  return publication;
}

function createRoom(publications: TestPublication[]): BackgroundVideoRoom {
  return {
    remoteParticipants: new Map([
      [
        "user-1",
        {
          trackPublications: new Map(
            publications.map((publication) => [
              publication.trackSid,
              publication as BackgroundVideoPublication,
            ]),
          ),
        },
      ],
    ]),
  };
}

describe("web remote video background rule", () => {
  it("stops remote video while the tab is hidden and leaves audio alone", () => {
    const camera = createPublication({ trackSid: "camera" });
    const share = createPublication({ trackSid: "share" });
    const microphone = createPublication({ kind: Track.Kind.Audio, trackSid: "mic" });
    const room = createRoom([camera, share, microphone]);

    const suspended = suspendRemoteVideoForBackground(room);

    assert.deepEqual(suspended.sort(), ["camera", "share"]);
    assert.deepEqual(camera.setEnabledCalls, [false]);
    assert.deepEqual(share.setEnabledCalls, [false]);
    assert.deepEqual(microphone.setEnabledCalls, []);
  });

  it("hands control back instead of pinning the publication to enabled", () => {
    const camera = createPublication({ trackSid: "camera" });
    const room = createRoom([camera]);

    const suspended = suspendRemoteVideoForBackground(room);
    assert.equal(camera.requestedDisabled, true);

    const resumed = resumeRemoteVideoFromBackground(room, suspended);

    assert.deepEqual(resumed, ["camera"]);
    // Clearing the field is the point: setEnabled(true) would park the track in
    // an enabled state livekit could never pause again.
    assert.equal(camera.requestedDisabled, undefined);
    assert.equal(camera.emitted, 1);
    assert.deepEqual(camera.setEnabledCalls, [false]);
  });

  it("falls back to setEnabled(true) when the build lost the internals", () => {
    const camera = createPublication({ trackSid: "camera", withoutInternals: true });
    const room = createRoom([camera]);

    const suspended = suspendRemoteVideoForBackground(room);
    const resumed = resumeRemoteVideoFromBackground(room, suspended);

    assert.deepEqual(resumed, ["camera"]);
    assert.deepEqual(camera.setEnabledCalls, [false, true]);
  });

  it("never claims a track it did not pause", () => {
    const alreadyPaused = createPublication({ enabled: false, trackSid: "paused" });
    const refused = createPublication({ refuses: true, trackSid: "refused" });
    const unsubscribed = createPublication({ subscribed: false, trackSid: "unsubscribed" });
    const local = createPublication({ local: true, trackSid: "local" });
    const room = createRoom([alreadyPaused, refused, unsubscribed, local]);

    assert.deepEqual(suspendRemoteVideoForBackground(room), []);
    assert.deepEqual(alreadyPaused.setEnabledCalls, []);
    assert.deepEqual(unsubscribed.setEnabledCalls, []);
  });

  it("resumes only the sids it was given, and survives a track that left", () => {
    const stayed = createPublication({ trackSid: "stayed" });
    const untouched = createPublication({ trackSid: "untouched" });
    const room = createRoom([stayed, untouched]);

    suspendRemoteVideoForBackground(room);
    const resumed = resumeRemoteVideoFromBackground(room, ["stayed", "left-the-room"]);

    assert.deepEqual(resumed, ["stayed"]);
    assert.equal(stayed.requestedDisabled, undefined);
    assert.equal(untouched.requestedDisabled, true);
  });

  it("is a no-op without a room or without suspended tracks", () => {
    assert.deepEqual(suspendRemoteVideoForBackground(null), []);
    assert.deepEqual(suspendRemoteVideoForBackground(undefined), []);
    assert.deepEqual(suspendRemoteVideoForBackground({}), []);
    assert.deepEqual(resumeRemoteVideoFromBackground(createRoom([]), []), []);
    assert.deepEqual(resumeRemoteVideoFromBackground(null, ["camera"]), []);
  });
});
