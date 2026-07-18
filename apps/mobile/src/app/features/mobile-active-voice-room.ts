import {
  getMobileVoiceInviteCandidates,
  type MobileBootstrapViewState,
  type MobileVoiceInviteCandidate,
  type MobileVoiceInviteSendState,
  type MobileVoiceRoomParticipant,
  type MobileVoiceRoomState,
  type MobileWorkspaceServerViewState,
} from "../mobile-root-screen-shared";
import type { MobileVoiceScreenProps } from "../providers/mobile-product-screen-provider";

/**
 * Online, invitable members for the room's server, excluding those already
 * connected. Empty until the active server detail matches the room's server.
 */
export function getMobileActiveVoiceInviteCandidates({
  currentUserId,
  participants,
  serverId,
  workspaceServerState,
}: {
  readonly currentUserId: string | null;
  readonly participants: readonly MobileVoiceRoomParticipant[];
  readonly serverId: string | null;
  readonly workspaceServerState: MobileWorkspaceServerViewState;
}): MobileVoiceInviteCandidate[] {
  const detail =
    workspaceServerState.status === "ready" && workspaceServerState.serverId === serverId
      ? workspaceServerState.payload.detail
      : null;
  if (!serverId || !detail) {
    return [];
  }

  return getMobileVoiceInviteCandidates({
    currentUserId,
    members: detail.members,
    participants,
  });
}

/** Resolves the display name of the server hosting the active voice room. */
export function getMobileActiveVoiceRoomServerName({
  bootstrapState,
  voiceRoomState,
}: {
  readonly bootstrapState: MobileBootstrapViewState;
  readonly voiceRoomState: MobileVoiceRoomState;
}): string | null {
  return bootstrapState.status === "ready"
    ? (bootstrapState.payload.home.servers.recent.find(
        (server) => server.id === voiceRoomState.serverId,
      )?.name ?? null)
    : null;
}

/** Binds the voice-room screen contract to the active session runtime. */
export function createMobileVoiceScreenProps({
  bootstrapState,
  inviteCandidates,
  inviteSendStates,
  onBeginVoicePushToTalk,
  onEndVoicePushToTalk,
  onFlipVoiceCamera,
  onLeaveVoiceChannel,
  onRefreshVoiceDevices,
  onSelectVoiceAudioInput,
  onSelectVoiceAudioOutput,
  onSelectVoiceAudioOutputDevice,
  onSelectVoiceNoiseSuppression,
  onSendInvite,
  onToggleVoiceCamera,
  onToggleVoiceMute,
  onToggleVoiceScreenShare,
  voiceInputMode,
  voicePushToTalkPhase,
  voiceRoomState,
}: {
  readonly bootstrapState: MobileBootstrapViewState;
  readonly inviteCandidates: readonly MobileVoiceInviteCandidate[];
  readonly inviteSendStates: Readonly<Record<string, MobileVoiceInviteSendState>>;
  readonly onBeginVoicePushToTalk: MobileVoiceScreenProps["onBeginVoicePushToTalk"];
  readonly onEndVoicePushToTalk: MobileVoiceScreenProps["onEndVoicePushToTalk"];
  readonly onFlipVoiceCamera?: MobileVoiceScreenProps["onFlipVoiceCamera"];
  readonly onLeaveVoiceChannel: MobileVoiceScreenProps["onLeaveVoiceChannel"];
  readonly onRefreshVoiceDevices: MobileVoiceScreenProps["onRefreshVoiceDevices"];
  readonly onSelectVoiceAudioInput: MobileVoiceScreenProps["onSelectVoiceAudioInput"];
  readonly onSelectVoiceAudioOutput: MobileVoiceScreenProps["onSelectVoiceAudioOutput"];
  readonly onSelectVoiceAudioOutputDevice: MobileVoiceScreenProps["onSelectVoiceAudioOutputDevice"];
  readonly onSelectVoiceNoiseSuppression: MobileVoiceScreenProps["onSelectVoiceNoiseSuppression"];
  readonly onSendInvite: (targetUserId: string) => void;
  readonly onToggleVoiceCamera?: MobileVoiceScreenProps["onToggleVoiceCamera"];
  readonly onToggleVoiceMute: MobileVoiceScreenProps["onToggleVoiceMute"];
  readonly onToggleVoiceScreenShare?: MobileVoiceScreenProps["onToggleVoiceScreenShare"];
  readonly voiceInputMode: MobileVoiceScreenProps["voiceInputMode"];
  readonly voicePushToTalkPhase: MobileVoiceScreenProps["voicePushToTalkPhase"];
  readonly voiceRoomState: MobileVoiceRoomState;
}): MobileVoiceScreenProps {
  return {
    bootstrapState,
    inviteCandidates,
    inviteSendStates,
    onBeginVoicePushToTalk,
    onEndVoicePushToTalk,
    ...(onFlipVoiceCamera ? { onFlipVoiceCamera } : {}),
    onLeaveVoiceChannel,
    ...(onRefreshVoiceDevices ? { onRefreshVoiceDevices } : {}),
    ...(onSelectVoiceAudioInput ? { onSelectVoiceAudioInput } : {}),
    ...(onSelectVoiceAudioOutput ? { onSelectVoiceAudioOutput } : {}),
    ...(onSelectVoiceAudioOutputDevice ? { onSelectVoiceAudioOutputDevice } : {}),
    ...(onSelectVoiceNoiseSuppression ? { onSelectVoiceNoiseSuppression } : {}),
    onSendInvite,
    ...(onToggleVoiceCamera ? { onToggleVoiceCamera } : {}),
    onToggleVoiceMute,
    ...(onToggleVoiceScreenShare ? { onToggleVoiceScreenShare } : {}),
    serverName: getMobileActiveVoiceRoomServerName({ bootstrapState, voiceRoomState }),
    voiceInputMode,
    voicePushToTalkPhase,
    voiceRoomState,
  };
}
