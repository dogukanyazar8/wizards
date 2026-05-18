import {
  VideoPresets,
  type AudioCaptureOptions,
  type VideoCaptureOptions,
} from "livekit-client";

import {
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_CAMERA_DEVICE_ID,
  type VoiceAudioPreferences,
  type VoiceCameraPreferences,
} from "@/store/voice-store";

export async function getMicrophonePermissionState() {
  if (typeof navigator === "undefined" || !("permissions" in navigator)) {
    return null;
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
}

export function isScreenShareSupported() {
  return Boolean(typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia);
}

export function isCameraSupported() {
  return Boolean(typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia);
}

export function isLiveKitCloudUrl(url: string) {
  return /livekit\.cloud/i.test(url);
}

export function supportsMediaConstraint(name: string) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getSupportedConstraints) {
    return false;
  }

  return (
    (navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>)[name] === true
  );
}

export function buildAudioCaptureOptions(
  audioPreferences: VoiceAudioPreferences,
): AudioCaptureOptions {
  const options: AudioCaptureOptions = {
    autoGainControl: audioPreferences.autoGainControl,
    channelCount: { ideal: 1 },
    echoCancellation: audioPreferences.echoCancellation,
    noiseSuppression: audioPreferences.noiseSuppression,
    // Keep advanced browser cleanup as a preference, not a hard requirement.
    // Unsupported or unavailable implementations should not block microphone access.
    voiceIsolation:
      audioPreferences.voiceIsolation && supportsMediaConstraint("voiceIsolation")
        ? { ideal: true }
        : false,
  };

  if (audioPreferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID) {
    options.deviceId = audioPreferences.inputDeviceId;
  }

  return options;
}

export function buildCameraCaptureOptions(
  cameraPreferences: VoiceCameraPreferences,
): VideoCaptureOptions {
  const options: VideoCaptureOptions = {
    facingMode: "user",
    frameRate: { ideal: 30, max: 30 },
    resolution: VideoPresets.h720.resolution,
  };

  if (cameraPreferences.deviceId !== DEFAULT_CAMERA_DEVICE_ID) {
    options.deviceId = cameraPreferences.deviceId;
  }

  return options;
}

export function getAudioCaptureRestartSignature(audioPreferences: VoiceAudioPreferences) {
  return audioPreferences.inputDeviceId;
}
