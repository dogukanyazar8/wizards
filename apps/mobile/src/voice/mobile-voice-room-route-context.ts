import type { MobileVoiceRoomState } from "./mobile-voice-room-contract";

export interface MobileVoiceRoomRouteContext {
  readonly channelId: string;
  readonly channelName: string;
  readonly serverId: string;
}

let activeVoiceRoomRouteContext: MobileVoiceRoomRouteContext | null = null;

export function setMobileVoiceRoomRouteContext(
  context: MobileVoiceRoomRouteContext,
): MobileVoiceRoomRouteContext | null {
  if (!context.channelId.trim() || !context.channelName.trim() || !context.serverId.trim()) {
    activeVoiceRoomRouteContext = null;
    return null;
  }

  activeVoiceRoomRouteContext = {
    channelId: context.channelId,
    channelName: context.channelName,
    serverId: context.serverId,
  };
  return activeVoiceRoomRouteContext;
}

export function getMobileVoiceRoomRouteContext(): MobileVoiceRoomRouteContext | null {
  return activeVoiceRoomRouteContext;
}

export function clearMobileVoiceRoomRouteContext(): void {
  activeVoiceRoomRouteContext = null;
}

export function hasMatchingMobileVoiceRoomRouteContext(room: MobileVoiceRoomState): boolean {
  const context = activeVoiceRoomRouteContext;
  return Boolean(
    context &&
    room.channelId === context.channelId &&
    room.channelName === context.channelName &&
    room.serverId === context.serverId,
  );
}
