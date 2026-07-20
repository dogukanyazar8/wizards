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
  // The room screen opens first: joining costs a token fetch plus an ICE handshake, and
  // waiting for it made the ringing screen appear seconds after the button press.
  openVoiceRoom({
    channelId: null,
    channelName: title,
    conversationId,
    serverId: null,
    sessionMode: "direct",
  });

  return joinDirectCall({ conversationId, title, video });
}

/** Sends the user back to the conversation the call belonged to. */
export function openMobileDirectMessage(conversationId: string): void {
  navigateMobileRouteIntent({
    name: "DirectMessage",
    params: { conversationId },
    type: "route",
  });
}
