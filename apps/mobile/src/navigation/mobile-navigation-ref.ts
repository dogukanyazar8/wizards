import { createNavigationContainerRef } from "@react-navigation/native";
import type {
  MobileNavigationRouteIntent,
  MobileRootStackParamList,
} from "./mobile-navigation-types";

export const mobileNavigationRef = createNavigationContainerRef<MobileRootStackParamList>();

export function isMobileNavigationReady(): boolean {
  return mobileNavigationRef.isReady();
}

export function navigateMobileRouteIntent(intent: MobileNavigationRouteIntent): boolean {
  if (!mobileNavigationRef.isReady()) {
    return false;
  }

  switch (intent.name) {
    case "MainTabs":
      mobileNavigationRef.navigate("MainTabs", intent.params);
      break;
    case "ChannelChat":
      mobileNavigationRef.navigate("ChannelChat", intent.params);
      break;
    case "DirectMessage":
      mobileNavigationRef.navigate("DirectMessage", intent.params);
      break;
    case "SettingsDetail":
      mobileNavigationRef.navigate("SettingsDetail", intent.params);
      break;
  }

  return true;
}
