import type { AudioCaptureOptions } from "livekit-client";

export interface MobileMicrophoneLocalParticipant {
  setMicrophoneEnabled(enabled: boolean, options?: AudioCaptureOptions): Promise<unknown>;
}

export function getMobileMicrophoneCaptureOptions(
  noiseSuppressionEnabled = true,
): AudioCaptureOptions {
  return {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: noiseSuppressionEnabled,
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
