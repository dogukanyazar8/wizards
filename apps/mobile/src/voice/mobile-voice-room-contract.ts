import type { MobileVoiceStateParticipant, WorkspaceMember } from "@wizards/types";
import type { Participant, Track, TrackPublication } from "livekit-client";

import type { MobileSessionUser } from "../auth/session-types";
import {
  DEFAULT_MOBILE_CAMERA_FACING_MODE,
  type MobileCameraFacingMode,
} from "./mobile-camera-contract";
import type {
  MobileVoiceInputOption,
  MobileVoiceOutputOption,
} from "./mobile-voice-device-contract";
import type { MobileCameraVideoCodec } from "./mobile-video-quality";
import type { MobileScreenShareHealthSnapshot } from "./mobile-screen-share-health";

export type MobileVoiceRoomConnectionStatus =
  | "checking-permission"
  | "connected"
  | "connecting"
  | "error"
  | "idle"
  | "leaving"
  | "permission-denied"
  | "reconnecting";

export type MobileVoiceScreenShareStatus =
  "error" | "off" | "on" | "permission-denied" | "starting" | "stopping" | "unsupported";
export type MobileVoiceAudioOutputMode = "default" | "speaker";
export type MobileVoiceSessionMode = "channel" | "direct";
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
  readonly cameraTrackRef?: MobileVoiceTrackReference;
  readonly displayName: string | null;
  readonly isCameraEnabled: boolean;
  readonly isMuted: boolean;
  readonly isScreenSharing: boolean;
  readonly isSelf: boolean;
  readonly isSpeaking: boolean;
  /** Room join time (ms). Drives stable, speaking-independent stage order. */
  readonly joinedAt?: number | undefined;
  readonly screenShareTrackRef?: MobileVoiceTrackReference;
  readonly userId: string;
  readonly username: string;
}

export interface MobileVoiceTrackReference {
  readonly participant: Participant;
  readonly publication: TrackPublication;
  readonly source: Track.Source;
}

export type MobileScreenShareTrackReference = MobileVoiceTrackReference;

export interface MobileVoiceRoomState {
  readonly availableAudioInputs: readonly MobileVoiceInputOption[];
  readonly availableAudioOutputs: readonly MobileVoiceOutputOption[];
  readonly cameraFacingMode: MobileCameraFacingMode;
  /** Codec the local camera publication actually negotiated, null while off. */
  readonly cameraVideoCodec: MobileCameraVideoCodec | null;
  readonly channelId: string | null;
  readonly channelName: string | null;
  readonly conversationId?: string | null;
  readonly connectedAt: number | null;
  readonly errorMessage: string | null;
  readonly noiseSuppressionEnabled: boolean;
  readonly participants: readonly MobileVoiceRoomParticipant[];
  /**
   * Ş0.2: last measured sample of the share on stage (own share first, else
   * the watched one); null while nothing is shared or before the first read.
   * Optional so test fixtures that spell the whole state keep compiling.
   */
  readonly screenShareHealth?: MobileScreenShareHealthSnapshot | null;
  /** In-memory track identity for matching measurements to the displayed stream. */
  readonly screenShareHealthTrack?: object | null;
  readonly screenShareStatus: MobileVoiceScreenShareStatus;
  readonly selectedAudioInputId: string | null;
  readonly selectedAudioOutputId: string | null;
  readonly selfAudioOutput: MobileVoiceAudioOutputMode;
  readonly selfCameraEnabled: boolean;
  readonly selfMuted: boolean;
  readonly selfScreenShareEnabled: boolean;
  readonly serverId: string | null;
  readonly sessionMode?: MobileVoiceSessionMode | null;
  readonly sessionId: string | null;
  readonly status: MobileVoiceRoomConnectionStatus;
  readonly updatedAt: number | null;
  readonly videoQualityMode: "AUTO" | "FULL";
}

const SENSITIVE_VOICE_ROOM_ERROR_PATTERN =
  /(access[_-]?token|refresh[_-]?token|oauth[_-]?code|password|secret|bearer\s+[a-z0-9._-]+|wss?:\/\/[^\s]+)/i;
const ACTIVE_VOICE_INVITE_STATUSES = new Set(["ONLINE", "IDLE", "DND"]);

export function createInitialMobileVoiceRoomState(): MobileVoiceRoomState {
  return {
    availableAudioInputs: [],
    availableAudioOutputs: [],
    cameraFacingMode: DEFAULT_MOBILE_CAMERA_FACING_MODE,
    cameraVideoCodec: null,
    channelId: null,
    channelName: null,
    conversationId: null,
    connectedAt: null,
    errorMessage: null,
    noiseSuppressionEnabled: true,
    participants: [],
    screenShareHealth: null,
    screenShareStatus: "off",
    selectedAudioInputId: null,
    selectedAudioOutputId: null,
    selfAudioOutput: "default",
    selfCameraEnabled: false,
    selfMuted: false,
    selfScreenShareEnabled: false,
    serverId: null,
    sessionMode: null,
    sessionId: null,
    status: "idle",
    updatedAt: null,
    videoQualityMode: "AUTO",
  };
}

export function advanceMobileVoiceSessionGeneration(currentGeneration: number): number {
  return currentGeneration + 1;
}

export function isCurrentMobileVoiceSessionGeneration(
  capturedGeneration: number,
  currentGeneration: number,
): boolean {
  return capturedGeneration === currentGeneration;
}

export function isVoiceSessionActive(status: MobileVoiceRoomConnectionStatus): boolean {
  return status === "connecting" || status === "connected" || status === "reconnecting";
}

export function hasVoiceRoomContext(state: MobileVoiceRoomState): boolean {
  const hasTarget =
    state.sessionMode === "direct"
      ? Boolean(state.conversationId && state.channelName && state.serverId === null)
      : Boolean(state.channelId && state.channelName && state.serverId);
  if (!hasTarget) {
    return false;
  }

  return (
    isVoiceSessionActive(state.status) ||
    state.status === "checking-permission" ||
    state.status === "leaving" ||
    (state.status === "error" && Boolean(state.errorMessage))
  );
}

export function transitionMobileVoiceRoomConnectionState(
  state: MobileVoiceRoomState,
  status: MobileVoiceRoomConnectionStatus,
  updatedAt: number,
): MobileVoiceRoomState {
  const resetsConnectedAt =
    status === "error" ||
    status === "idle" ||
    status === "leaving" ||
    status === "permission-denied";

  return {
    ...state,
    connectedAt:
      status === "connected"
        ? (state.connectedAt ?? updatedAt)
        : resetsConnectedAt
          ? null
          : state.connectedAt,
    status,
    updatedAt,
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

/**
 * Picks the most human-readable username. A username equal to the userId is the
 * raw LiveKit-identity fallback, so a previously resolved real username wins.
 */
function preferResolvedVoiceUsername(
  incoming: MobileVoiceRoomParticipant,
  previous: MobileVoiceRoomParticipant | undefined,
): string {
  if (incoming.username && incoming.username !== incoming.userId) {
    return incoming.username;
  }

  if (previous?.username && previous.username !== incoming.userId) {
    return previous.username;
  }

  return incoming.username;
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
    const {
      cameraTrackRef: _previousCameraTrackRef,
      screenShareTrackRef: _previousScreenShareTrackRef,
      ...previousWithoutTrackRef
    } = previous ?? {};
    const {
      cameraTrackRef: _participantCameraTrackRef,
      screenShareTrackRef: _participantScreenShareTrackRef,
      ...participantWithoutTrackRef
    } = participant;
    const cameraTrackRef = participant.isCameraEnabled
      ? (participant.cameraTrackRef ?? previous?.cameraTrackRef)
      : undefined;
    const screenShareTrackRef = participant.isScreenSharing
      ? (participant.screenShareTrackRef ?? previous?.screenShareTrackRef)
      : undefined;
    const merged = {
      ...previousWithoutTrackRef,
      ...participantWithoutTrackRef,
      audioLevel: Number.isFinite(participant.audioLevel)
        ? participant.audioLevel
        : (previous?.audioLevel ?? 0),
      // Identity fields survive a merge from a source that only knows the raw
      // LiveKit identity (displayName null, username === userId). Real names and
      // avatars from the server voice-state must not be clobbered back to a UUID.
      avatarUrl: participant.avatarUrl ?? previous?.avatarUrl ?? null,
      displayName: participant.displayName ?? previous?.displayName ?? null,
      username: preferResolvedVoiceUsername(participant, previous),
      // The LiveKit join time only arrives on the LiveKit snapshot; a server sync
      // omits it, so the previously learned value must survive the merge.
      joinedAt: participant.joinedAt ?? previous?.joinedAt,
      isCameraEnabled: participant.isCameraEnabled,
      isMuted: participant.isMuted,
      isScreenSharing: participant.isScreenSharing,
      isSpeaking: participant.isSpeaking,
    };

    byUserId.set(
      participant.userId,
      cameraTrackRef || screenShareTrackRef
        ? {
            ...merged,
            ...(cameraTrackRef ? { cameraTrackRef } : {}),
            ...(screenShareTrackRef ? { screenShareTrackRef } : {}),
          }
        : merged,
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
