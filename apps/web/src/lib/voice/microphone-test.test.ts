import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acquireMicrophoneTestSource,
  getMicrophoneTestLevelState,
  MicrophoneTestSourceUnavailableError,
  releaseMicrophoneTestSource,
  routeMicrophoneTestOutput,
} from "./microphone-test";
import type { VoiceAudioPreferences } from "@/store/voice-store";

const preferences: VoiceAudioPreferences = {
  autoGainControl: true,
  echoCancellation: true,
  enhancedNoiseFilterMode: "browser_only",
  inputDeviceId: "logitech-input",
  krispNoiseCancellation: false,
  noiseSuppression: true,
  outputDeviceId: "logitech-output",
  voiceIsolation: false,
};

function createTrack(readyState: MediaStreamTrackState = "live") {
  let stopCount = 0;
  return {
    get stopCount() {
      return stopCount;
    },
    readyState,
    stop() {
      stopCount += 1;
    },
  } as unknown as MediaStreamTrack & { readonly stopCount: number };
}

function createStream(tracks: MediaStreamTrack[]) {
  return {
    getAudioTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe("microphone test source", () => {
  it("borrows a live outbound track without opening another capture", async () => {
    const activeTrack = createTrack();
    const borrowedStream = createStream([activeTrack]);
    let captureCalls = 0;

    const result = await acquireMicrophoneTestSource({
      activeTrack,
      createMediaStream: (tracks) => {
        assert.deepEqual(tracks, [activeTrack]);
        return borrowedStream;
      },
      getUserMedia: async () => {
        captureCalls += 1;
        return createStream([]);
      },
      isMuted: false,
      preferences,
    });

    assert.equal(result.owned, false);
    assert.equal(result.stream, borrowedStream);
    assert.equal(result.track, activeTrack);
    assert.equal(captureCalls, 0);
  });

  it("opens the selected input when the outbound track is muted", async () => {
    const temporaryTrack = createTrack();
    const temporaryStream = createStream([temporaryTrack]);
    let receivedConstraints: MediaStreamConstraints | undefined;

    const result = await acquireMicrophoneTestSource({
      activeTrack: createTrack(),
      createMediaStream: createStream,
      getUserMedia: async (constraints) => {
        receivedConstraints = constraints;
        return temporaryStream;
      },
      isMuted: true,
      preferences,
    });

    assert.equal(result.owned, true);
    assert.equal(result.track, temporaryTrack);
    assert.deepEqual(receivedConstraints, {
      audio: {
        autoGainControl: true,
        channelCount: { ideal: 1 },
        deviceId: { exact: "logitech-input" },
        echoCancellation: true,
        noiseSuppression: true,
        voiceIsolation: false,
      },
      video: false,
    });
  });

  it("never stops a borrowed LiveKit track", async () => {
    const activeTrack = createTrack();
    const source = await acquireMicrophoneTestSource({
      activeTrack,
      createMediaStream: createStream,
      getUserMedia: async () => createStream([]),
      isMuted: false,
      preferences,
    });

    releaseMicrophoneTestSource(source);
    releaseMicrophoneTestSource(source);

    assert.equal(activeTrack.stopCount, 0);
  });

  it("stops every owned track exactly once", async () => {
    const audioTrack = createTrack();
    const extraTrack = createTrack();
    const source = await acquireMicrophoneTestSource({
      activeTrack: null,
      createMediaStream: createStream,
      getUserMedia: async () => createStream([audioTrack, extraTrack]),
      isMuted: false,
      preferences,
    });

    releaseMicrophoneTestSource(source);
    releaseMicrophoneTestSource(source);

    assert.equal(audioTrack.stopCount, 1);
    assert.equal(extraTrack.stopCount, 1);
  });

  it("rejects and cleans a stream without an audio track", async () => {
    const nonAudioTrack = createTrack();

    await assert.rejects(
      acquireMicrophoneTestSource({
        activeTrack: null,
        createMediaStream: createStream,
        getUserMedia: async () =>
          ({
            getAudioTracks: () => [],
            getTracks: () => [nonAudioTrack],
          }) as unknown as MediaStream,
        isMuted: false,
        preferences,
      }),
      MicrophoneTestSourceUnavailableError,
    );
    assert.equal(nonAudioTrack.stopCount, 1);
  });
});

describe("routeMicrophoneTestOutput", () => {
  it("routes monitoring to the selected output", async () => {
    const sinkIds: string[] = [];
    const element = {
      setSinkId: async (sinkId: string) => {
        sinkIds.push(sinkId);
      },
    } as unknown as HTMLAudioElement;

    await routeMicrophoneTestOutput(element, "logitech-output");

    assert.deepEqual(sinkIds, ["logitech-output"]);
  });

  it("routes the system preference through the default sink", async () => {
    const sinkIds: string[] = [];
    const element = {
      setSinkId: async (sinkId: string) => {
        sinkIds.push(sinkId);
      },
    } as unknown as HTMLAudioElement;

    await routeMicrophoneTestOutput(element, "default");

    assert.deepEqual(sinkIds, ["default"]);
  });

  it("allows browsers without output routing support", async () => {
    await assert.doesNotReject(
      routeMicrophoneTestOutput({} as HTMLAudioElement, "logitech-output"),
    );
  });

  it("propagates output routing failures for safe UI translation", async () => {
    const element = {
      setSinkId: async () => {
        throw new Error("device rejected");
      },
    } as unknown as HTMLAudioElement;

    await assert.rejects(routeMicrophoneTestOutput(element, "logitech-output"), /device rejected/);
  });
});

describe("getMicrophoneTestLevelState", () => {
  it("reports quiet input below the audible threshold", () => {
    assert.equal(getMicrophoneTestLevelState(0.009), "quiet");
  });

  it("reports active input at the audible threshold", () => {
    assert.equal(getMicrophoneTestLevelState(0.01), "active");
  });
});
