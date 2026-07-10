/**
 * Opt-in biometric app lock — native-agnostic core.
 *
 * The lock is a UI-level gate only. It never authorizes, rejects, or mutates a
 * Whispr session token; a locked app still holds a valid session in SecureStore.
 * Availability failures fail OPEN (the user is let in) so a broken or removed
 * biometric sensor can never trap a signed-in user out of the app.
 */

export type MobileAppLockStatus = "idle" | "checking" | "locked" | "unlocked" | "unavailable";

export type MobileAppLockAvailability = "available" | "unavailable" | "unknown";

export interface MobileBiometricAuthResult {
  success: boolean;
}

export interface MobileBiometricPromptOptions {
  cancelLabel: string;
  disableDeviceFallback: boolean;
  fallbackLabel: string;
  promptMessage: string;
}

export interface MobileBiometricAuthenticator {
  authenticate(options: MobileBiometricPromptOptions): Promise<MobileBiometricAuthResult>;
  hasHardware(): Promise<boolean>;
  isEnrolled(): Promise<boolean>;
}

/**
 * Availability is "available" only when the device has biometric hardware AND at
 * least one biometric is enrolled. Any native failure fails open to "unavailable"
 * so the lock is skipped rather than trapping the user.
 */
export async function assessMobileAppLockAvailability(
  authenticator: MobileBiometricAuthenticator,
): Promise<MobileAppLockAvailability> {
  try {
    if (!(await authenticator.hasHardware())) {
      return "unavailable";
    }

    if (!(await authenticator.isEnrolled())) {
      return "unavailable";
    }

    return "available";
  } catch {
    return "unavailable";
  }
}

/**
 * The lock only arms for a signed-in user who explicitly enabled it on a device
 * whose biometrics are currently available. Every other combination fails open.
 */
export function shouldArmMobileAppLock(input: {
  availability: MobileAppLockAvailability;
  preferenceEnabled: boolean;
  signedIn: boolean;
}): boolean {
  return input.signedIn && input.preferenceEnabled && input.availability === "available";
}

/**
 * Runs a biometric prompt and reports whether it unlocked. A thrown native error
 * is treated as an unsuccessful attempt (stay locked) and its detail is dropped;
 * the lock screen still offers retry and a sign-out escape hatch.
 */
export async function runMobileAppLockAuthentication(
  authenticator: MobileBiometricAuthenticator,
  options: MobileBiometricPromptOptions,
): Promise<boolean> {
  try {
    const result = await authenticator.authenticate(options);
    return result.success === true;
  } catch {
    return false;
  }
}
