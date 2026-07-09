import type { MobileVoiceStateParticipant, WorkspaceMember } from "@wizards/types";
import type { Participant, Track, TrackPublication } from "livekit-client";

import type { MobileSessionUser } from "../auth/session-types";

export type MobileVoiceRoomConnectionStatus =
  | "checking-permission"
  | "connected"
  | "connecting"
  | "error"
  | "idle"
  | "leaving"
  | "permission-denied";

export type MobileVoiceScreenShareStatus =
  | "error"
  | "off"
  | "on"
  | "permission-denied"
  | "starting"
  | "stopping"
  | "unsupported";
export type MobileVoiceAudioOutputMode = "default" | "speaker";
export type MobileVoiceInviteStatus = "accepted" | "declined" | "failed" | "sending" | "sent";

export type MobileVoiceInviteMember = Pick<
  WorkspaceMember,
  "avatarUrl" | "displayName" | "status" | "userId" | "username"
>;

export interface MobileVoiceInviteCandidate {
  readonly avatarUrl: string | null;
  readonly label: string;
  readonly status: MobileVoiceInviteMember["status"];
  readonly userId: string;
  readonly username: string;
}

export interface MobileVoiceInviteReceived {
  readonly channelId: string;
  readonly channelName: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly fromUser: {
    readonly avatarUrl: string | null;
    readonly displayName: string;
    readonly id: string;
    readonly username: string;
  };
  readonly id: string;
  readonly serverId: string;
  readonly serverName: string;
}

export interface MobileVoiceInviteSendResult {
  readonly channelId: string;
  readonly expiresAt: string;
  readonly inviteId: string;
  readonly targetUserId: string;
}

export interface MobileVoiceInviteStatusUpdate {
  readonly channelId: string;
  readonly inviteId: string;
  readonly serverId: string;
  readonly status: "accepted" | "declined";
  readonly targetUserId: string;
}

export interface MobileVoiceInviteError {
  readonly channelId: string | null;
  readonly code: string;
  readonly inviteId: string | null;
  readonly message: string;
  readonly targetUserId: string | null;
}

export interface MobileVoiceInviteSendState {
  readonly errorMessage: string | null;
  readonly expiresAt: string | null;
  readonly inviteId: string | null;
  readonly status: MobileVoiceInviteStatus;
}

export interface MobileVoiceRoomParticipant {
  readonly audioLevel: number;
  readonly avatarUrl: string | null;
  readonly displayName: string | null;
  readonly isCameraEnabled: boolean;
  readonly isMuted: boolean;
  readonly isScreenSharing: boolean;
  readonly isSelf: boolean;
  readonly isSpeaking: boolean;
  readonly screenShareTrackRef?: MobileScreenShareTrackReference;
  readonly userId: string;
  readonly username: string;
}

export interface MobileScreenShareTrackReference {
  readonly participant: Participant;
  readonly publication: TrackPublication;
  readonly source: Track.Source;
}

export interface MobileVoiceRoomState {
  readonly channelId: string | null;
  readonly channelName: string | null;
  readonly errorMessage: string | null;
  readonly participants: readonly MobileVoiceRoomParticipant[];
  readonly screenShareStatus: MobileVoiceScreenShareStatus;
  readonly selfAudioOutput: MobileVoiceAudioOutputMode;
  readonly selfCameraEnabled: boolean;
  readonly selfMuted: boolean;
  readonly selfScreenShareEnabled: boolean;
  readonly serverId: string | null;
  readonly sessionId: string | null;
  readonly status: MobileVoiceRoomConnectionStatus;
  readonly updatedAt: number | null;
}

const SENSITIVE_VOICE_ROOM_ERROR_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9._-]+|wss?:\/\/[^\s]+)/i;
const ACTIVE_VOICE_INVITE_STATUSES = new Set(["ONLINE", "IDLE", "DND"]);

export function createInitialMobileVoiceRoomState(): MobileVoiceRoomState {
  return {
    channelId: null,
    channelName: null,
    errorMessage: null,
    participants: [],
    screenShareStatus: "off",
    selfAudioOutput: "default",
    selfCameraEnabled: false,
    selfMuted: false,
    selfScreenShareEnabled: false,
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

function getSafeStringProperty(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getSafeObjectProperty(payload: unknown, key: string): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeVoiceInviteNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 240) : null;
}

export function getMobileVoiceInviteCandidates({
  currentUserId,
  limit = 24,
  members,
  participants,
}: {
  currentUserId: string | null;
  limit?: number;
  members: readonly MobileVoiceInviteMember[];
  participants: readonly MobileVoiceRoomParticipant[];
}): MobileVoiceInviteCandidate[] {
  const participantIds = new Set(participants.map((participant) => participant.userId));

  return members
    .filter((member) => {
      if (!member.userId || member.userId === currentUserId) {
        return false;
      }

      if (participantIds.has(member.userId)) {
        return false;
      }

      return ACTIVE_VOICE_INVITE_STATUSES.has(member.status);
    })
    .slice(0, Math.max(0, limit))
    .map((member) => ({
      avatarUrl: member.avatarUrl,
      label: member.displayName || member.username,
      status: member.status,
      userId: member.userId,
      username: member.username,
    }));
}

export function getMobileVoiceInviteReceivedPayload(
  payload: unknown,
): MobileVoiceInviteReceived | null {
  const fromUser = getSafeObjectProperty(payload, "fromUser");
  const channelId = getSafeStringProperty(payload, "channelId");
  const channelName = getSafeStringProperty(payload, "channelName");
  const createdAt = getSafeStringProperty(payload, "createdAt");
  const expiresAt = getSafeStringProperty(payload, "expiresAt");
  const id = getSafeStringProperty(payload, "id");
  const serverId = getSafeStringProperty(payload, "serverId");
  const serverName = getSafeStringProperty(payload, "serverName");
  const fromUserId = getSafeStringProperty(fromUser, "id");
  const fromUsername = getSafeStringProperty(fromUser, "username");

  if (
    !channelId ||
    !channelName ||
    !createdAt ||
    !expiresAt ||
    !id ||
    !serverId ||
    !serverName ||
    !fromUserId ||
    !fromUsername
  ) {
    return null;
  }

  return {
    channelId,
    channelName,
    createdAt,
    expiresAt,
    fromUser: {
      avatarUrl: sanitizeVoiceInviteNullableString(fromUser?.avatarUrl),
      displayName: getSafeStringProperty(fromUser, "displayName") ?? fromUsername,
      id: fromUserId,
      username: fromUsername,
    },
    id,
    serverId,
    serverName,
  };
}

export function getMobileVoiceInviteSendResultPayload(
  payload: unknown,
): MobileVoiceInviteSendResult | null {
  const channelId = getSafeStringProperty(payload, "channelId");
  const expiresAt = getSafeStringProperty(payload, "expiresAt");
  const inviteId = getSafeStringProperty(payload, "inviteId");
  const targetUserId = getSafeStringProperty(payload, "targetUserId");

  if (!channelId || !expiresAt || !inviteId || !targetUserId) {
    return null;
  }

  return {
    channelId,
    expiresAt,
    inviteId,
    targetUserId,
  };
}

export function getMobileVoiceInviteStatusPayload(
  payload: unknown,
): MobileVoiceInviteStatusUpdate | null {
  const channelId = getSafeStringProperty(payload, "channelId");
  const inviteId = getSafeStringProperty(payload, "inviteId");
  const serverId = getSafeStringProperty(payload, "serverId");
  const status = getSafeStringProperty(payload, "status");
  const targetUserId = getSafeStringProperty(payload, "targetUserId");

  if (
    !channelId ||
    !inviteId ||
    !serverId ||
    !targetUserId ||
    (status !== "accepted" && status !== "declined")
  ) {
    return null;
  }

  return {
    channelId,
    inviteId,
    serverId,
    status,
    targetUserId,
  };
}

export function getMobileVoiceInviteErrorPayload(payload: unknown): MobileVoiceInviteError | null {
  const code = getSafeStringProperty(payload, "code");
  const message = getSafeStringProperty(payload, "message");

  if (!code || !message) {
    return null;
  }

  return {
    channelId: getSafeStringProperty(payload, "channelId"),
    code,
    inviteId: getSafeStringProperty(payload, "inviteId"),
    message: redactMobileVoiceRoomError(message),
    targetUserId: getSafeStringProperty(payload, "targetUserId"),
  };
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
    const { screenShareTrackRef: _previousScreenShareTrackRef, ...previousWithoutTrackRef } =
      previous ?? {};
    const { screenShareTrackRef: _participantScreenShareTrackRef, ...participantWithoutTrackRef } =
      participant;
    const screenShareTrackRef = participant.isScreenSharing
      ? (participant.screenShareTrackRef ?? previous?.screenShareTrackRef)
      : undefined;
    const merged = {
      ...previousWithoutTrackRef,
      ...participantWithoutTrackRef,
      audioLevel: Number.isFinite(participant.audioLevel)
        ? participant.audioLevel
        : (previous?.audioLevel ?? 0),
      isCameraEnabled: participant.isCameraEnabled,
      isMuted: participant.isMuted,
      isScreenSharing: participant.isScreenSharing,
      isSpeaking: participant.isSpeaking,
    };

    byUserId.set(
      participant.userId,
      screenShareTrackRef ? { ...merged, screenShareTrackRef } : merged,
    );
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
