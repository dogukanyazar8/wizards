import { navigateMobileRouteIntent } from "../navigation/mobile-navigation-ref";
import {
  setMobileVoiceRoomRouteContext,
  type MobileVoiceRoomRouteTarget,
} from "./mobile-voice-room-route-context";

export type MobileVoiceRoomJoinContext = MobileVoiceRoomRouteTarget;

export function openMobileVoiceRoom(context: MobileVoiceRoomJoinContext): void {
  setMobileVoiceRoomRouteContext(context);
  navigateMobileRouteIntent({ name: "VoiceRoom", params: undefined, type: "route" });
}

export async function launchMobileDirectCall({
  conversationId,
  joinDirectCall,
  openVoiceRoom,
  title,
  video,
}: {
  conversationId: string;
  joinDirectCall(input: {
    conversationId: string;
    title: string;
    video: boolean;
  }): Promise<boolean>;
  openVoiceRoom(context: MobileVoiceRoomJoinContext): void;
  title: string;
  video: boolean;
}): Promise<boolean> {
  const joined = await joinDirectCall({ conversationId, title, video });
  if (!joined) {
    return false;
  }

  openVoiceRoom({
    channelId: null,
    channelName: title,
    conversationId,
    serverId: null,
    sessionMode: "direct",
  });
  return true;
}
