import * as LocalAuthentication from "expo-local-authentication";

import type {
  MobileBiometricAuthenticator,
  MobileBiometricPromptOptions,
} from "./mobile-app-lock";

/**
 * Expo adapter over `expo-local-authentication`. This is the only file that
 * imports the native module; the app-lock logic and tests inject the interface.
 */
export const expoMobileBiometricAuthenticator: MobileBiometricAuthenticator = {
  authenticate(options: MobileBiometricPromptOptions) {
    return LocalAuthentication.authenticateAsync({
      cancelLabel: options.cancelLabel,
      // disableDeviceFallback stays false so the OS device-passcode fallback is offered.
      disableDeviceFallback: options.disableDeviceFallback,
      promptMessage: options.promptMessage,
      // Only forward a custom iOS fallback label when one is provided; an empty
      // label lets iOS render its default device-passcode affordance.
      ...(options.fallbackLabel ? { fallbackLabel: options.fallbackLabel } : {}),
    });
  },
  hasHardware() {
    return LocalAuthentication.hasHardwareAsync();
  },
  isEnrolled() {
    return LocalAuthentication.isEnrolledAsync();
  },
};
