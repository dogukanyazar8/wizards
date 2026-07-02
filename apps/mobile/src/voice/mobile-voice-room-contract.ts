import type { MobileVoiceStateParticipant } from "@wizards/types";

import type { MobileSessionUser } from "../auth/session-types";

export type MobileVoiceRoomConnectionStatus =
  | "checking-permission"
  | "connected"
  | "connecting"
  | "error"
  | "idle"
  | "leaving"
  | "permission-denied";

export type MobileVoiceScreenShareStatus = "off" | "unsupported";

export interface MobileVoiceRoomParticipant {
  readonly audioLevel: number;
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly isCameraEnabled: boolean;
  readonly isMuted: boolean;
  readonly isScreenSharing: boolean;
  readonly isSelf: boolean;
  readonly isSpeaking: boolean;
  readonly userId: string;
  readonly username: string;
}

export interface MobileVoiceRoomState {
  readonly channelId: string | null;
  readonly channelName: string | null;
  readonly errorMessage: string | null;
  readonly participants: readonly MobileVoiceRoomParticipant[];
  readonly screenShareStatus: MobileVoiceScreenShareStatus;
  readonly selfCameraEnabled: boolean;
  readonly selfMuted: boolean;
  readonly serverId: string | null;
  readonly sessionId: string | null;
  readonly status: MobileVoiceRoomConnectionStatus;
  readonly updatedAt: number | null;
}

const SENSITIVE_VOICE_ROOM_ERROR_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9._-]+|wss?:\/\/[^\s]+)/i;

export function createInitialMobileVoiceRoomState(): MobileVoiceRoomState {
  return {
    channelId: null,
    channelName: null,
    errorMessage: null,
    participants: [],
    screenShareStatus: "unsupported",
    selfCameraEnabled: false,
    selfMuted: false,
    serverId: null,
    sessionId: null,
    status: "idle",
    updatedAt: null,
  };
}

export function redactMobileVoiceRoomError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Voice room could not be joined.";

  if (SENSITIVE_VOICE_ROOM_ERROR_PATTERN.test(message)) {
    return "Voice room setup failed without exposing sensitive details.";
  }

  return message.slice(0, 180);
}

export function createMobileVoiceSessionId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUUID) {
    return randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const randomValue = Math.floor(Math.random() * 16);
    const value = token === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createSelfVoiceRoomParticipant(
  user: MobileSessionUser,
): MobileVoiceRoomParticipant {
  return {
    audioLevel: 0,
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    isCameraEnabled: false,
    isMuted: false,
    isScreenSharing: false,
    isSelf: true,
    isSpeaking: false,
    userId: user.id,
    username: user.username,
  };
}

export function mapServerVoiceParticipantToRoomParticipant(
  participant: MobileVoiceStateParticipant,
  currentUserId: string,
): MobileVoiceRoomParticipant {
  return {
    audioLevel: 0,
    avatarUrl: participant.avatarUrl,
    displayName: participant.displayName,
    isCameraEnabled: false,
    isMuted: false,
    isScreenSharing: participant.isScreenSharing,
    isSelf: participant.userId === currentUserId,
    isSpeaking: false,
    userId: participant.userId,
    username: participant.username,
  };
}

export function mergeMobileVoiceRoomParticipants(
  current: readonly MobileVoiceRoomParticipant[],
  incoming: readonly MobileVoiceRoomParticipant[],
): MobileVoiceRoomParticipant[] {
  const byUserId = new Map<string, MobileVoiceRoomParticipant>();

  for (const participant of current) {
    byUserId.set(participant.userId, participant);
  }

  for (const participant of incoming) {
    const previous = byUserId.get(participant.userId);
    byUserId.set(participant.userId, {
      ...previous,
      ...participant,
      audioLevel: participant.audioLevel || previous?.audioLevel || 0,
      isCameraEnabled: participant.isCameraEnabled || previous?.isCameraEnabled || false,
      isMuted: participant.isMuted || previous?.isMuted || false,
      isSpeaking: participant.isSpeaking || previous?.isSpeaking || false,
    });
  }

  return [...byUserId.values()].sort((first, second) => {
    if (first.isSelf !== second.isSelf) {
      return first.isSelf ? -1 : 1;
    }

    if (first.isSpeaking !== second.isSpeaking) {
      return first.isSpeaking ? -1 : 1;
    }

    return first.username.localeCompare(second.username, "tr");
  });
}
