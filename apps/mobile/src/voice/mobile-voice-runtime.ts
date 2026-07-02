import {
  createErroredMobileVoiceRuntimeState,
  createMobileVoiceRuntimeStateFromPermission,
  createUnavailableMobileVoiceRuntimeState,
  mapNativeMicrophonePermissionStatus,
  type MobileVoiceRuntimeState,
} from "./mobile-voice-contract";
import { PermissionsAndroid, Platform } from "react-native";

const ANDROID_MICROPHONE_PERMISSION = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

const ANDROID_MICROPHONE_RATIONALE = {
  buttonNegative: "Not now",
  buttonPositive: "Continue",
  message: "Whispr uses the microphone only when you join voice channels or calls.",
  title: "Prepare microphone",
} as const;

export async function requestMobileVoicePermissionAfterUserAction(
  now = Date.now(),
): Promise<MobileVoiceRuntimeState> {
  try {
    if (Platform.OS !== "android") {
      return createUnavailableMobileVoiceRuntimeState(
        "Native microphone permission runtime is not wired for this platform yet.",
        now,
      );
    }

    const alreadyGranted = await PermissionsAndroid.check(ANDROID_MICROPHONE_PERMISSION);
    if (alreadyGranted) {
      return createMobileVoiceRuntimeStateFromPermission("granted", now);
    }

    const requestedStatus = await PermissionsAndroid.request(
      ANDROID_MICROPHONE_PERMISSION,
      ANDROID_MICROPHONE_RATIONALE,
    );

    return createMobileVoiceRuntimeStateFromPermission(
      mapNativeMicrophonePermissionStatus(requestedStatus),
      now,
    );
  } catch (error) {
    const message =
      error instanceof Error && /native module|not available|unavailable/i.test(error.message)
        ? error.message
        : null;

    if (message) {
      return createUnavailableMobileVoiceRuntimeState(message, now);
    }

    return createErroredMobileVoiceRuntimeState(error, now);
  }
}
