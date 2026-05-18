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
      { identity: "bob", source: Track.Source.Microphone, volume: 0.8 },
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
