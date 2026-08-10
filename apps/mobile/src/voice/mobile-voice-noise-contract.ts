import type { AudioCaptureOptions } from "livekit-client";
import type { MobileVoiceAudioProcessing } from "./mobile-voice-device-contract";

export interface MobileMicrophoneLocalParticipant {
  setMicrophoneEnabled(enabled: boolean, options?: AudioCaptureOptions): Promise<unknown>;
}

/**
 * Accepts either the whole processing preference or the bare noise-suppression
 * flag, so the older call sites keep reading the way they always did.
 */
export function getMobileMicrophoneCaptureOptions(
  processing: MobileVoiceAudioProcessing | boolean = true,
): AudioCaptureOptions {
  if (typeof processing === "boolean") {
    return {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: processing,
    };
  }

  return {
    autoGainControl: processing.autoGainControlEnabled,
    echoCancellation: processing.echoCancellationEnabled,
    noiseSuppression: processing.noiseSuppressionEnabled,
  };
}

export function getMobileNoiseSuppressionLabel(locale: "en" | "tr"): string {
  return locale === "tr" ? "Gurultu bastirma aktif" : "Noise suppression active";
}

export async function setMobileMicrophoneEnabledWithNoiseSuppression(
  localParticipant: MobileMicrophoneLocalParticipant,
  enabled: boolean,
  captureOptions: AudioCaptureOptions = getMobileMicrophoneCaptureOptions(),
): Promise<unknown> {
  return localParticipant.setMicrophoneEnabled(enabled, enabled ? captureOptions : undefined);
}
