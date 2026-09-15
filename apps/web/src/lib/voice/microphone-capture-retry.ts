import {
  isMicrophoneConstraintError,
  isMicrophoneDeviceUnavailable,
  getMicrophoneConstraintName,
} from "@/lib/voice/error-classification";
import { DEFAULT_AUDIO_DEVICE_ID, type VoiceAudioPreferences } from "@/store/voice-store";

export type MicrophoneCaptureRetryReason = "default-device" | "stable-processing";

export type MicrophoneCaptureRetry = {
  persistDeviceFallback: boolean;
  persistProcessingFallback: boolean;
  preferences: VoiceAudioPreferences;
  reason: MicrophoneCaptureRetryReason;
};

/**
 * Decides how a failed microphone capture should be retried. Returns null when the error is not
 * recoverable by changing capture options (permission denials, publish failures, ...).
 */
export function resolveMicrophoneCaptureRetry(
  preferences: VoiceAudioPreferences,
  error: unknown,
): MicrophoneCaptureRetry | null {
  const constraint = getMicrophoneConstraintName(error);
  if (
    preferences.voiceIsolation &&
    isMicrophoneConstraintError(error) &&
    (constraint === "voiceIsolation" ||
      (!constraint && preferences.inputDeviceId === DEFAULT_AUDIO_DEVICE_ID))
  ) {
    return {
      persistDeviceFallback: false,
      persistProcessingFallback: true,
      preferences: { ...preferences, voiceIsolation: false },
      reason: "stable-processing",
    };
  }
  if (isMicrophoneDeviceUnavailable(error) && (!constraint || constraint === "deviceId")) {
    if (preferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID) {
      return {
        persistDeviceFallback: true,
        persistProcessingFallback: false,
        preferences: { ...preferences, inputDeviceId: DEFAULT_AUDIO_DEVICE_ID },
        reason: "default-device",
      };
    }
  }
  // No changed capture condition means no useful immediate retry.
  return null;
}
