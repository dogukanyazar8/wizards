import {
  isMicrophoneConstraintError,
  isMicrophoneDeviceUnavailable,
} from "@/lib/voice/error-classification";
import { DEFAULT_AUDIO_DEVICE_ID, type VoiceAudioPreferences } from "@/store/voice-store";

export type MicrophoneCaptureRetryReason = "bare-capture" | "default-device" | "stable-processing";

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
  if (isMicrophoneDeviceUnavailable(error)) {
    if (preferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID) {
      return {
        persistDeviceFallback: true,
        persistProcessingFallback: false,
        preferences: { ...preferences, inputDeviceId: DEFAULT_AUDIO_DEVICE_ID },
        reason: "default-device",
      };
    }

    // The system default device fails too while it is momentarily held by another application or
    // by a parallel capture attempt. Retry once with the plainest constraints instead of leaving
    // the user with a dead microphone and no fallback.
    return {
      persistDeviceFallback: false,
      persistProcessingFallback: false,
      preferences: {
        ...preferences,
        inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
        voiceIsolation: false,
      },
      reason: "bare-capture",
    };
  }

  if (preferences.voiceIsolation && isMicrophoneConstraintError(error)) {
    return {
      persistDeviceFallback: false,
      persistProcessingFallback: true,
      preferences: { ...preferences, voiceIsolation: false },
      reason: "stable-processing",
    };
  }

  return null;
}
