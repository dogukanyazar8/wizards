import {
  getMobileVoiceInviteCandidates,
  type MobileBootstrapViewState,
  type MobileVoiceInviteCandidate,
  type MobileVoiceInviteSendState,
  type MobileVoiceRoomParticipant,
  type MobileVoiceRoomState,
} from "../mobile-root-screen-shared";
import type { MobileVoiceInviteMember } from "../../voice/mobile-voice-room-contract";
import type { MobileVoiceScreenProps } from "../providers/mobile-product-screen-provider";

/**
 * Members come from the paged `/servers/:id/members` read rather than the
 * workspace detail payload. Inviting only happens while a voice room is open,
 * so loading the roster there keeps it off the critical path of every server
 * open — the detail response no longer carries a member list at all.
 */
export function getMobileActiveVoiceInviteCandidates({
  currentUserId,
  members,
  participants,
  serverId,
}: {
  readonly currentUserId: string | null;
  readonly members: readonly MobileVoiceInviteMember[];
  readonly participants: readonly MobileVoiceRoomParticipant[];
  readonly serverId: string | null;
}): MobileVoiceInviteCandidate[] {
  if (!serverId || members.length === 0) {
    return [];
  }

  return getMobileVoiceInviteCandidates({
    currentUserId,
    members,
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
  onSelectVoiceAudioProcessing,
  onSelectVoiceInputMode,
  onSelectVoiceNoiseSuppression,
  onSelectVoiceScreenShareAudioMuted,
  onSelectVoiceScreenShareQuality,
  onSendInvite,
  onToggleVoiceCamera,
  onToggleVoiceMute,
  onToggleVoiceScreenShare,
  voiceAudioProcessing,
  voiceInputMode,
  voicePushToTalkPhase,
  voiceRoomState,
  voiceScreenShareAudioMuted,
  voiceScreenShareQualityId,
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
  readonly onSelectVoiceAudioProcessing: MobileVoiceScreenProps["onSelectVoiceAudioProcessing"];
  readonly onSelectVoiceInputMode: MobileVoiceScreenProps["onSelectVoiceInputMode"];
  readonly onSelectVoiceNoiseSuppression: MobileVoiceScreenProps["onSelectVoiceNoiseSuppression"];
  readonly onSelectVoiceScreenShareAudioMuted: MobileVoiceScreenProps["onSelectVoiceScreenShareAudioMuted"];
  readonly onSelectVoiceScreenShareQuality: MobileVoiceScreenProps["onSelectVoiceScreenShareQuality"];
  readonly onSendInvite: (targetUserId: string) => void;
  readonly onToggleVoiceCamera?: MobileVoiceScreenProps["onToggleVoiceCamera"];
  readonly onToggleVoiceMute: MobileVoiceScreenProps["onToggleVoiceMute"];
  readonly onToggleVoiceScreenShare?: MobileVoiceScreenProps["onToggleVoiceScreenShare"];
  readonly voiceAudioProcessing: MobileVoiceScreenProps["voiceAudioProcessing"];
  readonly voiceInputMode: MobileVoiceScreenProps["voiceInputMode"];
  readonly voicePushToTalkPhase: MobileVoiceScreenProps["voicePushToTalkPhase"];
  readonly voiceRoomState: MobileVoiceRoomState;
  readonly voiceScreenShareAudioMuted: MobileVoiceScreenProps["voiceScreenShareAudioMuted"];
  readonly voiceScreenShareQualityId: MobileVoiceScreenProps["voiceScreenShareQualityId"];
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
    ...(onSelectVoiceAudioProcessing ? { onSelectVoiceAudioProcessing } : {}),
    ...(onSelectVoiceInputMode ? { onSelectVoiceInputMode } : {}),
    ...(onSelectVoiceNoiseSuppression ? { onSelectVoiceNoiseSuppression } : {}),
    ...(onSelectVoiceScreenShareAudioMuted ? { onSelectVoiceScreenShareAudioMuted } : {}),
    ...(onSelectVoiceScreenShareQuality ? { onSelectVoiceScreenShareQuality } : {}),
    onSendInvite,
    ...(onToggleVoiceCamera ? { onToggleVoiceCamera } : {}),
    onToggleVoiceMute,
    ...(onToggleVoiceScreenShare ? { onToggleVoiceScreenShare } : {}),
    serverName: getMobileActiveVoiceRoomServerName({ bootstrapState, voiceRoomState }),
    ...(voiceAudioProcessing ? { voiceAudioProcessing } : {}),
    voiceInputMode,
    voicePushToTalkPhase,
    voiceRoomState,
    voiceScreenShareAudioMuted: voiceScreenShareAudioMuted === true,
    ...(voiceScreenShareQualityId ? { voiceScreenShareQualityId } : {}),
  };
}
