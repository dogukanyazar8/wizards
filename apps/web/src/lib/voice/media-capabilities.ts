import type { AudioCaptureOptions, VideoCaptureOptions } from "livekit-client";

import {
  DEFAULT_CAMERA_QUALITY_TIER,
  getCameraCaptureOptions,
  type CameraQualityTier,
} from "@/lib/voice/video-quality";
import {
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_CAMERA_DEVICE_ID,
  type VoiceAudioPreferences,
  type VoiceCameraPreferences,
} from "@/store/voice-store";
import type { AudioCaptureProcessingProfile } from "@/lib/voice/noise-filter";

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
  captureProcessing: { enhancedNoiseFilterActive?: boolean } = {},
): AudioCaptureOptions {
  const enhancedNoiseFilterActive = captureProcessing.enhancedNoiseFilterActive === true;
  const options: AudioCaptureOptions = {
    autoGainControl: audioPreferences.autoGainControl,
    channelCount: { ideal: 1 },
    echoCancellation: audioPreferences.echoCancellation,
    noiseSuppression: enhancedNoiseFilterActive ? false : audioPreferences.noiseSuppression,
    // Keep advanced browser cleanup as a preference, not a hard requirement.
    // Unsupported or unavailable implementations should not block microphone access.
    voiceIsolation:
      !enhancedNoiseFilterActive &&
      audioPreferences.voiceIsolation &&
      supportsMediaConstraint("voiceIsolation")
        ? { ideal: true }
        : false,
  };

  if (audioPreferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID) {
    // A scalar deviceId is only a preference in MediaTrackConstraints. That lets Chrome silently
    // keep the system default when another valid input exists, so the UI can say Logitech while
    // the published track is a silent virtual microphone. An explicit user choice must be exact.
    options.deviceId = { exact: audioPreferences.inputDeviceId };
  }

  return options;
}

export function buildCameraCaptureOptions(
  cameraPreferences: VoiceCameraPreferences,
  tier: CameraQualityTier = DEFAULT_CAMERA_QUALITY_TIER,
): VideoCaptureOptions {
  return cameraPreferences.deviceId === DEFAULT_CAMERA_DEVICE_ID
    ? getCameraCaptureOptions(tier)
    : getCameraCaptureOptions(tier, cameraPreferences.deviceId);
}

export function getAudioCaptureRestartSignature(
  audioPreferences: VoiceAudioPreferences,
  processingProfile: AudioCaptureProcessingProfile = "native",
) {
  return [
    audioPreferences.inputDeviceId,
    audioPreferences.noiseSuppression ? "ns" : "no-ns",
    audioPreferences.echoCancellation ? "ec" : "no-ec",
    audioPreferences.autoGainControl ? "agc" : "no-agc",
    audioPreferences.voiceIsolation ? "vi" : "no-vi",
    processingProfile,
  ].join("::");
}
