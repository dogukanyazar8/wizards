import type { AppStateStatus } from "react-native";

export function shouldShowMobilePrivacyShield(status: AppStateStatus | null): boolean {
  return status !== null && status !== "active";
}
