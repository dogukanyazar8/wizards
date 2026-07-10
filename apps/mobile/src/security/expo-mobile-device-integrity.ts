import * as Device from "expo-device";

import type { MobileDeviceIntegrityDetector } from "./mobile-device-integrity";

export const expoMobileDeviceIntegrityDetector: MobileDeviceIntegrityDetector = {
  isPhysicalDevice() {
    return Device.isDevice;
  },
  async isRootedOrJailbroken() {
    // Expo documents this as advisory and bypassable; callers must not use it as an auth gate.
    return Device.isRootedExperimentalAsync();
  },
};
