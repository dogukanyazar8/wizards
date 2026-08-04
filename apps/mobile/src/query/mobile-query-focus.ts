import type { AppStateStatus } from "react-native";

export interface MobileQueryFocusPlan {
  /** `null` preserves the prior value through iOS control-center transitions. */
  readonly focused: boolean | null;
}

export function planMobileQueryFocus(status: AppStateStatus | null): MobileQueryFocusPlan {
  if (status === "inactive") {
    return { focused: null };
  }

  return { focused: status === "active" };
}
