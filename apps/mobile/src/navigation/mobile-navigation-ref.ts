import { createNavigationContainerRef } from "@react-navigation/native";
import type {
  MobileNavigationRouteIntent,
  MobileRootStackParamList,
} from "./mobile-navigation-types";
import { getMobileVoiceRoomRouteContext } from "../voice/mobile-voice-room-route-context";

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
    case "VoiceRoom":
      if (!getMobileVoiceRoomRouteContext()) {
        return false;
      }
      mobileNavigationRef.navigate("VoiceRoom");
      break;
    case "ChannelChat":
      mobileNavigationRef.navigate("ChannelChat", intent.params);
      break;
    case "DirectMessage":
      mobileNavigationRef.navigate("DirectMessage", intent.params);
      break;
    case "MessageThread":
      mobileNavigationRef.navigate("MessageThread", intent.params);
      break;
    case "SettingsDetail":
      mobileNavigationRef.navigate("SettingsDetail", intent.params);
      break;
    case "ProfileEdit":
      mobileNavigationRef.navigate("ProfileEdit");
      break;
    case "BlockedUsers":
      mobileNavigationRef.navigate("BlockedUsers");
      break;
  }

  return true;
}
