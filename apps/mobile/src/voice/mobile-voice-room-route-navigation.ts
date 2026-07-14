import { navigateMobileRouteIntent } from "../navigation/mobile-navigation-ref";
import { setMobileVoiceRoomRouteContext } from "./mobile-voice-room-route-context";

export interface MobileVoiceRoomJoinContext {
  readonly channelId: string;
  readonly channelName: string;
  readonly serverId: string;
}

export function openMobileVoiceRoom(context: MobileVoiceRoomJoinContext): void {
  setMobileVoiceRoomRouteContext(context);
  navigateMobileRouteIntent({ name: "VoiceRoom", params: undefined, type: "route" });
}
