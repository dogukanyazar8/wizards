import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { Track, type LocalAudioTrack, type LocalVideoTrack } from "livekit-client";

import {
  applyRemoteAudioState,
  applyScreenShareQualityToTrack,
  isLocalCameraTrackLive,
  isLocalMicrophoneTrackLive,
  isLocalScreenShareTrackLive,
  resolveParticipantVolume,
  runNonFatalVoiceJoinStep,
} from "./livekit-track-helpers";

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
