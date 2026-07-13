import type { MobileSecuritySignal, MobileSecuritySignalLogger } from "./mobile-device-integrity";
import { addMobileSecurityBreadcrumb } from "../observability/mobile-sentry";

export const mobileSecuritySignalLogger: MobileSecuritySignalLogger = {
  log(signal: MobileSecuritySignal) {
    console.warn("[mobile-security] device integrity advisory", signal);
    addMobileSecurityBreadcrumb(signal.event);
  },
};
