import type { AppStateStatus } from "react-native";

export interface VoiceBackgroundMediaInput {
  readonly nextAppState: AppStateStatus;
  /**
   * True while a user-initiated capture flow (screen-share consent, camera
   * permission, iOS broadcast picker) holds a system dialog in front of the app.
   * These dialogs fire a transient background that must NOT be read as the user
   * leaving the app.
   */
  readonly captureConsentInProgress: boolean;
}

/**
 * Camera and screen share stop when the app leaves the foreground — a privacy
 * guarantee — except during a capture-consent dialog, whose transient background
 * would otherwise tear down the very stream the user is turning on.
 */
export function shouldSuspendVoiceMediaOnAppStateChange(input: VoiceBackgroundMediaInput): boolean {
  if (input.nextAppState === "active") {
    return false;
  }

  return !input.captureConsentInProgress;
}
