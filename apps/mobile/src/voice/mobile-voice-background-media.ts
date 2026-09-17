import type { AppStateStatus } from "react-native";

export interface VoiceBackgroundMediaInput {
  readonly platform?: string;
  readonly isScreenSharing?: boolean;
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
 * Camera pauses outside the foreground. A consented mobile screen share keeps
 * publishing other apps until the user or operating system stops it.
 */
export function shouldSuspendVoiceMediaOnAppStateChange(input: VoiceBackgroundMediaInput) {
  const suspend = input.nextAppState !== "active" && !input.captureConsentInProgress;
  return {
    suspendCamera: suspend,
    suspendScreenShare:
      suspend &&
      !(input.isScreenSharing && (input.platform === "android" || input.platform === "ios")),
  };
}
