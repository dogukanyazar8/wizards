import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

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
      echoCancellation: true,
      noiseSuppression: true,
      voiceIsolation: false,
    });
    assert.equal(getAudioCaptureRestartSignature(preferences), DEFAULT_AUDIO_DEVICE_ID);
  });

  it("includes selected device ids and ideal voice isolation when supported", () => {
    const preferences: VoiceAudioPreferences = {
      autoGainControl: false,
      echoCancellation: false,
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
      deviceId: "mic-1",
      echoCancellation: false,
      noiseSuppression: false,
      voiceIsolation: { ideal: true },
    });
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
