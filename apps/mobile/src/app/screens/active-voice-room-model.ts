import {
  isVoiceSessionActive,
  type MobileVoiceRoomParticipant,
  type MobileVoiceRoomState,
} from "../../voice/mobile-voice-room-contract";

export interface MobileActiveVoiceRoomModel {
  readonly canLeave: boolean;
  readonly canMinimize: boolean;
  readonly canToggleMute: boolean;
  readonly channelName: string | null;
  readonly connectionStatus: MobileVoiceRoomState["status"];
  readonly durationLabel: string | null;
  readonly participants: readonly MobileVoiceRoomParticipant[];
  readonly serverName: string | null;
}

export function getMobileActiveVoiceRoomModel(
  room: MobileVoiceRoomState,
  serverName: string | null,
  now: number,
): MobileActiveVoiceRoomModel {
  return {
    canLeave: room.status !== "idle" && room.status !== "leaving",
    canMinimize: isVoiceSessionActive(room.status),
    canToggleMute: room.status === "connected",
    channelName: room.channelName,
    connectionStatus: room.status,
    durationLabel: formatMobileVoiceRoomDuration(room.connectedAt, now),
    participants: room.participants,
    serverName,
  };
}

/**
 * The 5a session strip counts only a live session. While the room reconnects the
 * elapsed time holds its last value, so the strip never implies the call kept
 * running through the gap.
 */
export function shouldTickMobileVoiceRoomDuration(status: MobileVoiceRoomState["status"]): boolean {
  return status === "connected";
}

export function formatMobileVoiceRoomDuration(
  connectedAt: number | null,
  now: number,
): string | null {
  if (typeof connectedAt !== "number" || !Number.isFinite(connectedAt) || !Number.isFinite(now)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - connectedAt) / 1_000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
