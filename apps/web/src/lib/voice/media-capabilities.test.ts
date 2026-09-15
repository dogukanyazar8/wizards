import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Room } from "livekit-client";

import {
  buildAudioCaptureOptions,
  buildCameraCaptureOptions,
  getAudioCaptureRestartSignature,
  getMicrophonePermissionState,
  isCameraSupported,
  isLiveKitCloudUrl,
  isScreenShareSupported,
  supportsMediaConstraint,
} from "./media-capabilities";

import {
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_VOICE_AUDIO_PREFERENCES,
  DEFAULT_CAMERA_DEVICE_ID,
  DEFAULT_VOICE_CAMERA_PREFERENCES,
  type VoiceAudioPreferences,
  type VoiceCameraPreferences,
} from "@/store/voice-store";

type NavigatorGlobal = typeof globalThis & {
  navigator?: Navigator;
};

const navigatorGlobal = globalThis as NavigatorGlobal;
const originalNavigator = navigatorGlobal.navigator;

it("replaces stale room defaults at the real LiveKit capture boundary", async () => {
  const selected = { ...DEFAULT_VOICE_AUDIO_PREFERENCES, inputDeviceId: "disconnected-mic" };
  const captured: MediaStreamConstraints[] = [];
  const stopAtCapture = new Error("capture boundary reached");
  setNavigator({
    mediaDevices: {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        captured.push(constraints);
        throw stopAtCapture;
      },
    } as unknown as MediaDevices,
  });
  const room = new Room({ audioCaptureDefaults: buildAudioCaptureOptions(selected) });
  for (const inputDeviceId of ["disconnected-mic", DEFAULT_AUDIO_DEVICE_ID, "replacement-mic"]) {
    await assert.rejects(
      room.localParticipant.createTracks({
        audio: buildAudioCaptureOptions({ ...selected, inputDeviceId }),
        video: false,
      }),
      (error) => error === stopAtCapture,
    );
  }
  assert.deepEqual(
    captured.map((item) => (item.audio as MediaTrackConstraints).deviceId),
    [{ exact: "disconnected-mic" }, { ideal: "default" }, { exact: "replacement-mic" }],
  );
});

afterEach(() => {
  if (originalNavigator === undefined) {
    Reflect.deleteProperty(navigatorGlobal, "navigator");
  } else {
    Object.defineProperty(navigatorGlobal, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

function setNavigator(value: Partial<Navigator>) {
  Object.defineProperty(navigatorGlobal, "navigator", {
    configurable: true,
    value,
  });
}

describe("voice media capability helpers", () => {
  it("detects browser media support and LiveKit Cloud URLs", () => {
    setNavigator({
      mediaDevices: {
        getDisplayMedia: async () => ({}) as MediaStream,
        getUserMedia: async () => ({}) as MediaStream,
      } as MediaDevices,
    });

    assert.equal(isScreenShareSupported(), true);
    assert.equal(isCameraSupported(), true);
    assert.equal(isLiveKitCloudUrl("wss://tenant.livekit.cloud"), true);
    assert.equal(isLiveKitCloudUrl("wss://voice.example.com"), false);
  });

  it("returns null for unavailable microphone permission APIs", async () => {
    setNavigator({});

    assert.equal(await getMicrophonePermissionState(), null);
  });

  it("reads microphone permission state when the browser exposes it", async () => {
    setNavigator({
      permissions: {
        async query() {
          return { state: "granted" } as PermissionStatus;
        },
      } as Permissions,
    });

    assert.equal(await getMicrophonePermissionState(), "granted");
  });

  it("builds audio capture options without hard-requiring unsupported voice isolation", () => {
    const preferences: VoiceAudioPreferences = {
      autoGainControl: true,
      echoCancellation: true,
      enhancedNoiseFilterMode: "layered",
      inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
      krispNoiseCancellation: true,
      noiseSuppression: true,
      outputDeviceId: "default",
      voiceIsolation: true,
    };

    setNavigator({
      mediaDevices: {
        getSupportedConstraints: () => ({ voiceIsolation: false }),
      } as unknown as MediaDevices,
    });

    assert.equal(supportsMediaConstraint("voiceIsolation"), false);
    assert.deepEqual(buildAudioCaptureOptions(preferences), {
      autoGainControl: true,
      channelCount: { ideal: 1 },
      deviceId: { ideal: "default" },
      echoCancellation: true,
      noiseSuppression: true,
      voiceIsolation: false,
    });
    assert.equal(
      getAudioCaptureRestartSignature(preferences),
      `${DEFAULT_AUDIO_DEVICE_ID}::ns::ec::agc::vi::native`,
    );
  });

  it("includes selected device ids and ideal voice isolation when supported", () => {
    const preferences: VoiceAudioPreferences = {
      autoGainControl: false,
      echoCancellation: false,
      enhancedNoiseFilterMode: "layered",
      inputDeviceId: "mic-1",
      krispNoiseCancellation: false,
      noiseSuppression: false,
      outputDeviceId: "speaker-1",
      voiceIsolation: true,
    };

    setNavigator({
      mediaDevices: {
        getSupportedConstraints: () => ({ voiceIsolation: true }),
      } as unknown as MediaDevices,
    });

    assert.deepEqual(buildAudioCaptureOptions(preferences), {
      autoGainControl: false,
      channelCount: { ideal: 1 },
      deviceId: { exact: "mic-1" },
      echoCancellation: false,
      noiseSuppression: false,
      voiceIsolation: { ideal: true },
    });
  });

  it("can request enhanced noise filtering without disabling echo or gain cleanup", () => {
    const preferences: VoiceAudioPreferences = {
      autoGainControl: true,
      echoCancellation: true,
      enhancedNoiseFilterMode: "layered",
      inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
      krispNoiseCancellation: true,
      noiseSuppression: true,
      outputDeviceId: "default",
      voiceIsolation: true,
    };

    setNavigator({
      mediaDevices: {
        getSupportedConstraints: () => ({ voiceIsolation: true }),
      } as unknown as MediaDevices,
    });

    assert.deepEqual(buildAudioCaptureOptions(preferences, { enhancedNoiseFilterActive: true }), {
      autoGainControl: true,
      channelCount: { ideal: 1 },
      deviceId: { ideal: "default" },
      echoCancellation: true,
      noiseSuppression: false,
      voiceIsolation: false,
    });
  });

  it("captures live restart-affecting audio preferences in the restart signature", () => {
    const preferences: VoiceAudioPreferences = {
      autoGainControl: true,
      echoCancellation: true,
      enhancedNoiseFilterMode: "krisp_only",
      inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
      krispNoiseCancellation: true,
      noiseSuppression: true,
      outputDeviceId: "default",
      voiceIsolation: true,
    };

    assert.equal(
      getAudioCaptureRestartSignature(preferences),
      `${DEFAULT_AUDIO_DEVICE_ID}::ns::ec::agc::vi::native`,
    );
    assert.equal(
      getAudioCaptureRestartSignature({ ...preferences, noiseSuppression: false }),
      `${DEFAULT_AUDIO_DEVICE_ID}::no-ns::ec::agc::vi::native`,
    );
    assert.equal(
      getAudioCaptureRestartSignature({ ...preferences, echoCancellation: false }),
      `${DEFAULT_AUDIO_DEVICE_ID}::ns::no-ec::agc::vi::native`,
    );
    assert.equal(
      getAudioCaptureRestartSignature({ ...preferences, autoGainControl: false }),
      `${DEFAULT_AUDIO_DEVICE_ID}::ns::ec::no-agc::vi::native`,
    );
    assert.equal(
      getAudioCaptureRestartSignature({ ...preferences, voiceIsolation: false }),
      `${DEFAULT_AUDIO_DEVICE_ID}::ns::ec::agc::no-vi::native`,
    );
    assert.equal(
      getAudioCaptureRestartSignature(preferences, "enhanced"),
      `${DEFAULT_AUDIO_DEVICE_ID}::ns::ec::agc::vi::enhanced`,
    );
    assert.equal(
      getAudioCaptureRestartSignature({ ...preferences, krispNoiseCancellation: false }),
      getAudioCaptureRestartSignature(preferences),
    );
  });

  it("builds camera capture options with h720 defaults and optional selected device", () => {
    const defaultPreferences: VoiceCameraPreferences = {
      ...DEFAULT_VOICE_CAMERA_PREFERENCES,
      deviceId: DEFAULT_CAMERA_DEVICE_ID,
    };
    const selectedPreferences: VoiceCameraPreferences = {
      ...DEFAULT_VOICE_CAMERA_PREFERENCES,
      deviceId: "camera-1",
    };

    assert.equal(buildCameraCaptureOptions(defaultPreferences).deviceId, undefined);
    assert.equal(buildCameraCaptureOptions(selectedPreferences).deviceId, "camera-1");
    assert.deepEqual(buildCameraCaptureOptions(selectedPreferences).frameRate, {
      ideal: 30,
      max: 30,
    });
  });
});

it("saved camera quality drives live capture resolution and frame rate", () => {
  for (const quality of ["h720", "h1080"] as const) {
    for (const frameRate of [15, 30] as const) {
      const options = buildCameraCaptureOptions({
        ...DEFAULT_VOICE_CAMERA_PREFERENCES,
        quality,
        frameRate,
      });
      assert.equal(options.resolution?.height, quality === "h720" ? 720 : 1080);
      assert.deepEqual(options.frameRate, { ideal: frameRate, max: frameRate });
      assert.equal(options.resolution?.frameRate, frameRate);
    }
  }
});
