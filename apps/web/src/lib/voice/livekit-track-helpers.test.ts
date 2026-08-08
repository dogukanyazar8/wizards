import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { LocalTrack, Track, type LocalAudioTrack, type LocalVideoTrack } from "livekit-client";

import {
  applyRemoteAudioState,
  applyScreenShareQualityToTrack,
  getLocalScreenShareTracks,
  isLocalCameraTrackLive,
  isLocalMicrophoneTrackLive,
  isLocalScreenShareTrackLive,
  resolveParticipantVolume,
  resolveScreenShareAudioVolume,
  runNonFatalVoiceJoinStep,
  suppressLocalScreenShareAudioPlayback,
} from "./livekit-track-helpers";

/** `getLocalScreenShareTracks` filters on `instanceof LocalTrack`. */
function createLocalTrack(name: string): LocalTrack {
  return Object.assign(Object.create(LocalTrack.prototype) as LocalTrack, { name });
}

function createRoomWithPublications(
  publications: Array<{ source: Track.Source; track: unknown }>,
  screenShareAudio?: { applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void> },
) {
  return {
    localParticipant: {
      getTrackPublication(source: Track.Source) {
        if (source !== Track.Source.ScreenShareAudio || !screenShareAudio) {
          return undefined;
        }

        return { track: { mediaStreamTrack: screenShareAudio } };
      },
      getTrackPublications() {
        return publications;
      },
    },
  };
}

const originalConsoleError = console.error;

afterEach(() => {
  console.error = originalConsoleError;
});

describe("LiveKit voice track helpers", () => {
  it("resolves participant volume with deafen and default fallbacks", () => {
    assert.equal(resolveParticipantVolume("alice", false, { alice: 42 }, 100), 0.42);
    assert.equal(resolveParticipantVolume("bob", false, { alice: 42 }, 75), 0.75);
    assert.equal(resolveParticipantVolume("alice", true, { alice: 42 }, 100), 0);
  });

  it("detects live local media tracks without mutating them", () => {
    assert.equal(
      isLocalMicrophoneTrackLive({
        mediaStreamTrack: { readyState: "live" },
      } as LocalAudioTrack),
      true,
    );
    assert.equal(
      isLocalCameraTrackLive({
        mediaStreamTrack: { readyState: "ended" },
      } as LocalVideoTrack),
      false,
    );
    assert.equal(
      isLocalScreenShareTrackLive({
        mediaStreamTrack: { readyState: "live" },
      } as LocalVideoTrack),
      true,
    );
  });

  it("applies remote audio state to every participant", () => {
    const calls: Array<{ identity: string; source: string; volume: number }> = [];
    const room = {
      remoteParticipants: new Map([
        [
          "alice",
          {
            identity: "alice",
            setVolume(volume: number, source: string) {
              calls.push({ identity: "alice", source, volume });
            },
          },
        ],
        [
          "bob",
          {
            identity: "bob",
            setVolume(volume: number, source: string) {
              calls.push({ identity: "bob", source, volume });
            },
          },
        ],
      ]),
    };

    applyRemoteAudioState(room as never, false, { alice: 25 }, 80);

    assert.deepEqual(calls, [
      { identity: "alice", source: Track.Source.Microphone, volume: 0.25 },
      { identity: "alice", source: Track.Source.ScreenShareAudio, volume: 0.25 },
      { identity: "bob", source: Track.Source.Microphone, volume: 0.8 },
      { identity: "bob", source: Track.Source.ScreenShareAudio, volume: 0.8 },
    ]);
  });

  it("silences a participant's screen-share audio while deafened", () => {
    const calls: Array<{ source: string; volume: number }> = [];
    const room = {
      remoteParticipants: new Map([
        [
          "alice",
          {
            identity: "alice",
            setVolume(volume: number, source: string) {
              calls.push({ source, volume });
            },
          },
        ],
      ]),
    };

    applyRemoteAudioState(room as never, true, { alice: 90 }, 80);

    assert.deepEqual(calls, [
      { source: Track.Source.Microphone, volume: 0 },
      { source: Track.Source.ScreenShareAudio, volume: 0 },
    ]);
  });

  it("keeps applying the other sources and participants when setVolume throws", () => {
    console.error = () => undefined;
    const calls: Array<{ identity: string; source: string; volume: number }> = [];
    const room = {
      remoteParticipants: new Map([
        [
          "alice",
          {
            identity: "alice",
            setVolume(volume: number, source: string) {
              if (source === Track.Source.Microphone) {
                throw new Error("no microphone element attached");
              }
              calls.push({ identity: "alice", source, volume });
            },
          },
        ],
        [
          "bob",
          {
            identity: "bob",
            setVolume(volume: number, source: string) {
              calls.push({ identity: "bob", source, volume });
            },
          },
        ],
      ]),
    };

    applyRemoteAudioState(room as never, false, { alice: 25 }, 80);

    assert.deepEqual(calls, [
      { identity: "alice", source: Track.Source.ScreenShareAudio, volume: 0.25 },
      { identity: "bob", source: Track.Source.Microphone, volume: 0.8 },
      { identity: "bob", source: Track.Source.ScreenShareAudio, volume: 0.8 },
    ]);
  });

  it("narrows share audio by the listener's slider without ever raising it", () => {
    const calls: Array<{ source: string; volume: number }> = [];
    const room = {
      remoteParticipants: new Map([
        [
          "alice",
          {
            identity: "alice",
            setVolume(volume: number, source: string) {
              calls.push({ source, volume });
            },
          },
        ],
      ]),
    };

    applyRemoteAudioState(room as never, false, { alice: 50 }, 80, 40);

    assert.deepEqual(calls, [
      { source: Track.Source.Microphone, volume: 0.5 },
      // 50% of the sharer × 40% share ceiling. The microphone is untouched.
      { source: Track.Source.ScreenShareAudio, volume: 0.2 },
    ]);
  });

  it("treats a full share slider as no ceiling at all", () => {
    const calls: Array<{ source: string; volume: number }> = [];
    const room = {
      remoteParticipants: new Map([
        [
          "alice",
          {
            identity: "alice",
            setVolume(volume: number, source: string) {
              calls.push({ source, volume });
            },
          },
        ],
      ]),
    };

    applyRemoteAudioState(room as never, false, { alice: 60 }, 80, 100);

    assert.deepEqual(calls, [
      { source: Track.Source.Microphone, volume: 0.6 },
      { source: Track.Source.ScreenShareAudio, volume: 0.6 },
    ]);
  });

  it("keeps deafen above both controls", () => {
    const calls: Array<{ source: string; volume: number }> = [];
    const room = {
      remoteParticipants: new Map([
        [
          "alice",
          {
            identity: "alice",
            setVolume(volume: number, source: string) {
              calls.push({ source, volume });
            },
          },
        ],
      ]),
    };

    applyRemoteAudioState(room as never, true, { alice: 100 }, 100, 100);

    assert.deepEqual(calls, [
      { source: Track.Source.Microphone, volume: 0 },
      { source: Track.Source.ScreenShareAudio, volume: 0 },
    ]);
  });

  it("composes the two authorities without letting either one exceed the other", () => {
    assert.equal(resolveScreenShareAudioVolume(0.5, 0), 0);
    assert.equal(resolveScreenShareAudioVolume(0.5, 100), 0.5);
    assert.equal(resolveScreenShareAudioVolume(0, 100), 0);
    // Out-of-range input can only ever narrow, never amplify.
    assert.equal(resolveScreenShareAudioVolume(0.5, 400), 0.5);
    assert.equal(resolveScreenShareAudioVolume(0.5, -20), 0);
    assert.equal(resolveScreenShareAudioVolume(0.5, Number.NaN), 0.5);
  });

  it("collects the picture and the share audio together, so neither can leak", () => {
    const screenVideo = createLocalTrack("screen-video");
    const screenAudio = createLocalTrack("screen-audio");
    const room = createRoomWithPublications([
      { source: Track.Source.Camera, track: createLocalTrack("camera") },
      { source: Track.Source.Microphone, track: createLocalTrack("microphone") },
      { source: Track.Source.ScreenShare, track: screenVideo },
      { source: Track.Source.ScreenShareAudio, track: screenAudio },
    ]);

    assert.deepEqual(getLocalScreenShareTracks(room as never), [screenVideo, screenAudio]);
  });

  it("collects nothing from a room that is not sharing", () => {
    const room = createRoomWithPublications([
      { source: Track.Source.Microphone, track: createLocalTrack("microphone") },
      { source: Track.Source.ScreenShare, track: { notALocalTrack: true } },
    ]);

    assert.deepEqual(getLocalScreenShareTracks(room as never), []);
  });

  it("stops the sharer hearing their own surface through their speakers", () => {
    const applied: MediaTrackConstraints[] = [];
    const room = createRoomWithPublications([], {
      applyConstraints: async (constraints: MediaTrackConstraints) => {
        applied.push(constraints);
      },
    });

    assert.equal(suppressLocalScreenShareAudioPlayback(room as never), true);
    assert.deepEqual(applied, [{ suppressLocalAudioPlayback: true }]);
  });

  it("does nothing when the share carries no audio track", () => {
    const room = createRoomWithPublications([]);

    assert.equal(suppressLocalScreenShareAudioPlayback(room as never), false);
  });

  it("survives a browser that rejects the local-playback constraint", () => {
    const room = createRoomWithPublications([], {
      applyConstraints: async () => {
        throw new Error("OverconstrainedError");
      },
    });

    assert.equal(suppressLocalScreenShareAudioPlayback(room as never), true);
  });

  it("applies the selected screen-share quality to the sender encoding", async () => {
    const nextParameters: RTCRtpSendParameters[] = [];
    const track = {
      sender: {
        getParameters() {
          return { encodings: [{}] };
        },
        async setParameters(parameters: RTCRtpSendParameters) {
          nextParameters.push(parameters);
        },
      },
    } as LocalVideoTrack;

    await applyScreenShareQualityToTrack(track, "h720fps60");

    assert.equal(nextParameters[0]?.encodings?.[0]?.maxBitrate, 3_500_000);
    assert.equal(nextParameters[0]?.encodings?.[0]?.maxFramerate, 60);
  });

  it("caps an SVC send without dissolving its scalability layers", async () => {
    const nextParameters: RTCRtpSendParameters[] = [];
    const track = {
      sender: {
        getParameters() {
          return {
            encodings: [{ rid: "q", scalabilityMode: "L3T3_KEY" }],
          };
        },
        async setParameters(parameters: RTCRtpSendParameters) {
          nextParameters.push(parameters);
        },
      },
    } as unknown as LocalVideoTrack;

    await applyScreenShareQualityToTrack(track, "h1080fps60");

    const encodings = nextParameters[0]?.encodings ?? [];
    assert.equal(encodings.length, 1);
    assert.equal(encodings[0]?.maxBitrate, 6_000_000);
    assert.equal(encodings[0]?.maxFramerate, 60);
    // Losing this field collapses the share to a single layer.
    assert.equal(
      (encodings[0] as RTCRtpEncodingParameters & { scalabilityMode?: string })?.scalabilityMode,
      "L3T3_KEY",
    );
    assert.equal(encodings[0]?.rid, "q");
  });

  it("leaves the lower SVC entries alone while rewriting the primary one", async () => {
    const nextParameters: RTCRtpSendParameters[] = [];
    const track = {
      sender: {
        getParameters() {
          return {
            encodings: [
              { rid: "q", scalabilityMode: "L3T3_KEY" },
              { maxBitrate: 150_000, rid: "h" },
            ],
          };
        },
        async setParameters(parameters: RTCRtpSendParameters) {
          nextParameters.push(parameters);
        },
      },
    } as unknown as LocalVideoTrack;

    await applyScreenShareQualityToTrack(track, "h720fps60");

    const encodings = nextParameters[0]?.encodings ?? [];
    assert.equal(encodings[0]?.maxBitrate, 3_500_000);
    assert.equal(encodings[1]?.maxBitrate, 150_000);
  });

  it("contains non-fatal join step failures", () => {
    const errors: unknown[] = [];
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    assert.doesNotThrow(() => {
      runNonFatalVoiceJoinStep("test step", () => {
        throw new Error("expected failure");
      });
    });
    assert.equal(errors.length, 1);
  });
});
