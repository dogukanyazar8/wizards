import type { MobileSecuritySignal, MobileSecuritySignalLogger } from "./mobile-device-integrity";

export const mobileSecuritySignalLogger: MobileSecuritySignalLogger = {
  log(signal: MobileSecuritySignal) {
    console.warn("[mobile-security] device integrity advisory", signal);
  },
};
