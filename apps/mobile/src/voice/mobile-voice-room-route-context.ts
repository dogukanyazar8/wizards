import type { MobileVoiceRoomState } from "./mobile-voice-room-contract";

export interface MobileVoiceRoomRouteContext {
  readonly channelId: string | null;
  readonly channelName: string;
  readonly conversationId: string | null;
  readonly serverId: string | null;
  readonly sessionMode: "channel" | "direct";
}

export type MobileVoiceRoomRouteTarget =
  | {
      readonly channelId: string;
      readonly channelName: string;
      readonly serverId: string;
      readonly sessionMode?: "channel";
    }
  | {
      readonly channelId: null;
      readonly channelName: string;
      readonly conversationId: string;
      readonly serverId: null;
      readonly sessionMode: "direct";
    };

let activeVoiceRoomRouteContext: MobileVoiceRoomRouteContext | null = null;

export function setMobileVoiceRoomRouteContext(
  context: MobileVoiceRoomRouteTarget,
): MobileVoiceRoomRouteContext | null {
  const sessionMode = context.sessionMode ?? "channel";
  const validTarget =
    sessionMode === "direct"
      ? "conversationId" in context && Boolean(context.conversationId.trim())
      : Boolean(context.channelId?.trim() && context.serverId?.trim());
  if (!validTarget || !context.channelName.trim()) {
    activeVoiceRoomRouteContext = null;
    return null;
  }

  activeVoiceRoomRouteContext = {
    channelId: context.channelId,
    channelName: context.channelName,
    conversationId: "conversationId" in context ? context.conversationId : null,
    serverId: context.serverId,
    sessionMode,
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
    (room.conversationId ?? null) === context.conversationId &&
    room.serverId === context.serverId &&
    (room.sessionMode ?? "channel") === context.sessionMode,
  );
}
