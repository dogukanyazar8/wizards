import type { VoiceAudioPreferences } from "@/store/voice-store";

export const ENHANCED_NOISE_FILTER_MODES = ["layered", "krisp_only", "browser_only"] as const;

export type EnhancedNoiseFilterMode = (typeof ENHANCED_NOISE_FILTER_MODES)[number];

export type KrispProcessorQuality = "high" | "medium" | "low";

export type NoiseFilterTier =
  "krisp_high" | "krisp_medium" | "krisp_low" | "browser_native" | "off";

export type AudioCaptureProcessingProfile = "native" | "enhanced" | "off";

/** Settings expose three choices; capture/runtime still own platform fallback. */
export function getNoiseSuppressionChoice(audio: VoiceAudioPreferences): 0 | 1 | 2 {
  if (audio.krispNoiseCancellation && audio.enhancedNoiseFilterMode !== "browser_only") return 0;
  return audio.noiseSuppression || audio.voiceIsolation ? 1 : 2;
}

export function getNoiseSuppressionPreset(choice: number) {
  if (![0, 1, 2].includes(choice)) throw new Error("INVALID_NOISE_SUPPRESSION_CHOICE");
  return {
    krispNoiseCancellation: choice === 0,
    enhancedNoiseFilterMode: choice === 0 ? ("krisp_only" as const) : ("browser_only" as const),
    // Used as a fallback when Krisp is unavailable; echo/gain remain independent.
    noiseSuppression: choice !== 2,
    voiceIsolation: choice !== 2,
  };
}

export function isEnhancedNoiseFilterMode(value: unknown): value is EnhancedNoiseFilterMode {
  return (
    typeof value === "string" &&
    ENHANCED_NOISE_FILTER_MODES.includes(value as EnhancedNoiseFilterMode)
  );
}

export function shouldUseKrispNoiseFilter(
  audioPreferences: VoiceAudioPreferences,
  liveKitCloudNoiseFilterSupported: boolean,
) {
  return (
    audioPreferences.krispNoiseCancellation &&
    audioPreferences.enhancedNoiseFilterMode !== "browser_only" &&
    liveKitCloudNoiseFilterSupported
  );
}

export function getAudioCaptureProcessingProfile(
  audioPreferences: VoiceAudioPreferences,
  liveKitCloudNoiseFilterSupported: boolean,
  voiceIsolationSupported = false,
): AudioCaptureProcessingProfile {
  if (
    audioPreferences.enhancedNoiseFilterMode === "krisp_only" &&
    shouldUseKrispNoiseFilter(audioPreferences, liveKitCloudNoiseFilterSupported)
  ) {
    return "enhanced";
  }

  return getBrowserNoiseFilterEnabled(audioPreferences, voiceIsolationSupported) ? "native" : "off";
}

export function shouldUseEnhancedNoiseFilterCapture(
  audioPreferences: VoiceAudioPreferences,
  liveKitCloudNoiseFilterSupported: boolean,
  voiceIsolationSupported = false,
) {
  return (
    getAudioCaptureProcessingProfile(
      audioPreferences,
      liveKitCloudNoiseFilterSupported,
      voiceIsolationSupported,
    ) === "enhanced"
  );
}

export function getKrispNoiseFilterTier(quality: KrispProcessorQuality): NoiseFilterTier {
  return `krisp_${quality}` as NoiseFilterTier;
}

export function isKrispNoiseFilterTier(tier: NoiseFilterTier) {
  return tier === "krisp_high" || tier === "krisp_medium" || tier === "krisp_low";
}

export function getBrowserNoiseFilterEnabled(
  audioPreferences: VoiceAudioPreferences,
  voiceIsolationSupported = false,
) {
  return (
    audioPreferences.noiseSuppression ||
    (audioPreferences.voiceIsolation && voiceIsolationSupported)
  );
}

export function resolveNoiseFilterTier({
  browserNoiseFilterEnabled,
  isKrispNoiseCancellationActive,
  krispQuality,
}: {
  browserNoiseFilterEnabled: boolean;
  isKrispNoiseCancellationActive: boolean;
  krispQuality: KrispProcessorQuality | null;
}): NoiseFilterTier {
  if (isKrispNoiseCancellationActive) {
    return getKrispNoiseFilterTier(krispQuality ?? "high");
  }

  return browserNoiseFilterEnabled ? "browser_native" : "off";
}
