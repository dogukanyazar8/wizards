import {
  createErroredMobileVoiceRuntimeState,
  createMobileVoiceRuntimeStateFromPermission,
  createUnavailableMobileVoiceRuntimeState,
  mapNativeMicrophonePermissionStatus,
  type MobileVoiceRuntimeState,
} from "./mobile-voice-contract";
import { PermissionsAndroid, Platform } from "react-native";
import { activeMobileCopy as copy } from "../locale/mobile-locale-preferences";

const ANDROID_MICROPHONE_PERMISSION = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

/** Read per request so the dialog follows the language the user picked. */
function getAndroidMicrophoneRationale() {
  return {
    buttonNegative: copy.voicePermissionRationaleNotNowAction,
    buttonPositive: copy.voicePermissionRationaleContinueAction,
    message: copy.voicePermissionRationaleMessage,
    title: copy.voicePermissionRationaleTitle,
  };
}

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
      getAndroidMicrophoneRationale(),
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
