export const MOBILE_DEVICE_INTEGRITY_COMPROMISED_EVENT = "mobile_device_integrity_compromised";
export const MOBILE_DEVICE_INTEGRITY_CHECK_FAILED_EVENT = "mobile_device_integrity_check_failed";

export type MobileDeviceIntegrityStatus =
  | "checking"
  | "clean"
  | "compromised"
  | "emulator"
  | "unavailable";

export interface MobileDeviceIntegrityDetector {
  isPhysicalDevice(): boolean;
  isRootedOrJailbroken(): Promise<boolean>;
}

export type MobileDeviceIntegrityResult = {
  status: Exclude<MobileDeviceIntegrityStatus, "checking">;
};

export type MobileSecuritySignal = {
  advisory: true;
  event:
    | typeof MOBILE_DEVICE_INTEGRITY_CHECK_FAILED_EVENT
    | typeof MOBILE_DEVICE_INTEGRITY_COMPROMISED_EVENT;
  platform: "android" | "ios" | "other";
};

export interface MobileSecuritySignalLogger {
  log(signal: MobileSecuritySignal): void;
}

/**
 * Advisory signal only. Root and jailbreak detection can be bypassed and must
 * never authorize, reject, or otherwise gate a Whispr session.
 */
export async function assessMobileDeviceIntegrity(
  detector: MobileDeviceIntegrityDetector,
): Promise<MobileDeviceIntegrityResult> {
  try {
    if (!detector.isPhysicalDevice()) {
      return { status: "emulator" };
    }

    return {
      status: (await detector.isRootedOrJailbroken()) ? "compromised" : "clean",
    };
  } catch {
    return { status: "unavailable" };
  }
}

export function createMobileDeviceIntegritySignal(
  result: MobileDeviceIntegrityResult,
  platform: MobileSecuritySignal["platform"],
): MobileSecuritySignal | null {
  if (result.status === "compromised") {
    return {
      advisory: true,
      event: MOBILE_DEVICE_INTEGRITY_COMPROMISED_EVENT,
      platform,
    };
  }

  if (result.status === "unavailable") {
    return {
      advisory: true,
      event: MOBILE_DEVICE_INTEGRITY_CHECK_FAILED_EVENT,
      platform,
    };
  }

  return null;
}
