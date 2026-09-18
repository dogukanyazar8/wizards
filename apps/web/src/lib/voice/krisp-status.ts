import type { VoiceStateContextValue } from "@/components/providers/voice-context";
import { shouldUseKrispNoiseFilter } from "./noise-filter";

type KrispStatusInput = Pick<
  VoiceStateContextValue,
  | "audioPreferences"
  | "krispAvailability"
  | "isKrispNoiseCancellationActive"
  | "isMuted"
  | "isApplyingAudioPreferences"
  | "isRecoveringKrispNoiseCancellation"
  | "isJoining"
> & { isConnected: boolean };

/** A saved preference is not proof that the microphone processor is running. */
export function getKrispStatus(input: KrispStatusInput) {
  const status = (labelKey: string, descriptionKey = labelKey, active = false) => ({
    active,
    labelKey,
    descriptionKey,
  });
  if (!shouldUseKrispNoiseFilter(input.audioPreferences, true)) {
    return status("server.voice.header.krispInactive");
  }
  if (input.isJoining || input.isRecoveringKrispNoiseCancellation) {
    return status("voice.room.krispChecking");
  }
  if (!input.isConnected) return status("server.voice.header.krispReady");
  if (input.isMuted) return status("server.voice.header.krispPaused");
  if (input.isKrispNoiseCancellationActive) {
    return status("server.voice.header.krispActive", undefined, true);
  }
  if (input.isApplyingAudioPreferences || input.krispAvailability === "checking") {
    return status("voice.room.krispChecking");
  }
  const descriptions = {
    available: "voice.settings.krispUnavailable",
    unavailable: "voice.settings.krispUnavailable",
    requires_livekit_cloud: "voice.settings.krispRequiresCloud",
    unsupported_browser: "voice.settings.krispUnsupportedBrowser",
    blocked_by_security_policy: "voice.settings.krispBlockedBySecurityPolicy",
  };
  return status("server.voice.header.krispUnavailable", descriptions[input.krispAvailability]);
}
