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

/**
 * Route intents arrive from outside the current screen stack: notification
 * taps, deep links, voice re-entry. React Navigation 7 `navigate` pushes unless
 * the target is already the focused route, so without `pop` a tap could stack a
 * second ChannelChat above an open thread and back would walk a duplicate
 * trail. Popping to the existing instance keeps one copy of every route and
 * makes back unwind toward MainTabs. In-app drill-downs keep plain `navigate`,
 * which is the push the user expects.
 */
const ROUTE_INTENT_OPTIONS = { pop: true } as const;

export function navigateMobileRouteIntent(intent: MobileNavigationRouteIntent): boolean {
  if (!mobileNavigationRef.isReady()) {
    return false;
  }

  switch (intent.name) {
    case "MainTabs":
      mobileNavigationRef.navigate("MainTabs", intent.params, ROUTE_INTENT_OPTIONS);
      break;
    case "VoiceRoom":
      if (!getMobileVoiceRoomRouteContext()) {
        return false;
      }
      mobileNavigationRef.navigate("VoiceRoom", undefined, ROUTE_INTENT_OPTIONS);
      break;
    case "ChannelChat":
      mobileNavigationRef.navigate("ChannelChat", intent.params, ROUTE_INTENT_OPTIONS);
      break;
    case "DirectMessage":
      mobileNavigationRef.navigate("DirectMessage", intent.params, ROUTE_INTENT_OPTIONS);
      break;
    case "MessageThread":
      mobileNavigationRef.navigate("MessageThread", intent.params, ROUTE_INTENT_OPTIONS);
      break;
    case "SettingsDetail":
      mobileNavigationRef.navigate("SettingsDetail", intent.params, ROUTE_INTENT_OPTIONS);
      break;
    case "ServerRoles":
      mobileNavigationRef.navigate("ServerRoles", intent.params, ROUTE_INTENT_OPTIONS);
      break;
    case "UserProfile":
      mobileNavigationRef.navigate("UserProfile", intent.params, ROUTE_INTENT_OPTIONS);
      break;
    case "ProfileEdit":
      mobileNavigationRef.navigate("ProfileEdit", undefined, ROUTE_INTENT_OPTIONS);
      break;
    case "BlockedUsers":
      mobileNavigationRef.navigate("BlockedUsers", undefined, ROUTE_INTENT_OPTIONS);
      break;
  }

  return true;
}
