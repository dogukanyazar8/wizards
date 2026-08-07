import { useMemo } from "react";
import type { MobileApiClient } from "../../api/mobile-api-client";
import { useMobileServerMembersInfiniteQuery } from "../../workspace/mobile-server-management-query";
import type { useMobileVoiceRuntime } from "../providers/mobile-voice-provider";
import {
  createMobileVoiceScreenProps,
  getMobileActiveVoiceInviteCandidates,
} from "./mobile-active-voice-room";

type MobileVoiceScreenPropsInput = Parameters<typeof createMobileVoiceScreenProps>[0];

/**
 * `voiceRuntime` changes identity whenever room state does — participants,
 * audio levels, push-to-talk phase — which is exactly when the voice screen
 * must update. Keying the memo on the runtime keeps that live behaviour while
 * dropping the rebuilds that unrelated product-app renders used to cause.
 */
export function useMobileVoiceScreenProps({
  apiClient,
  bootstrapState,
  currentUserId,
  inviteSendStates,
  onLeaveVoiceChannel,
  onSendInvite,
  voiceRuntime,
}: {
  readonly apiClient: MobileApiClient;
  readonly bootstrapState: MobileVoiceScreenPropsInput["bootstrapState"];
  readonly currentUserId: string | null;
  readonly inviteSendStates: MobileVoiceScreenPropsInput["inviteSendStates"];
  readonly onLeaveVoiceChannel: MobileVoiceScreenPropsInput["onLeaveVoiceChannel"];
  readonly onSendInvite: MobileVoiceScreenPropsInput["onSendInvite"];
  readonly voiceRuntime: ReturnType<typeof useMobileVoiceRuntime>;
}) {
  const voiceRoomState = voiceRuntime.roomState;
  // Only fetches while a room is open: the query is disabled on an empty id.
  const membersQuery = useMobileServerMembersInfiniteQuery(
    apiClient,
    voiceRoomState.serverId ?? "",
  );
  const members = useMemo(
    () => (membersQuery.data?.pages ?? []).flatMap((page) => page.members),
    [membersQuery.data],
  );
  const inviteCandidates = useMemo(
    () =>
      getMobileActiveVoiceInviteCandidates({
        currentUserId,
        members,
        participants: voiceRoomState.participants,
        serverId: voiceRoomState.serverId,
      }),
    [currentUserId, members, voiceRoomState.participants, voiceRoomState.serverId],
  );

  return useMemo(
    () =>
      createMobileVoiceScreenProps({
        bootstrapState,
        inviteCandidates,
        inviteSendStates,
        onBeginVoicePushToTalk: voiceRuntime.beginPushToTalk,
        onEndVoicePushToTalk: voiceRuntime.endPushToTalk,
        onFlipVoiceCamera: voiceRuntime.flipCamera,
        onLeaveVoiceChannel,
        onRefreshVoiceDevices: voiceRuntime.refreshVoiceDevices,
        onSelectVoiceAudioInput: voiceRuntime.selectAudioInput,
        onSelectVoiceAudioOutput: voiceRuntime.selectAudioOutput,
        onSelectVoiceAudioOutputDevice: voiceRuntime.selectAudioDeviceOutput,
        onSelectVoiceNoiseSuppression: voiceRuntime.selectNoiseSuppression,
        onSelectVoiceScreenShareQuality: voiceRuntime.selectScreenShareQuality,
        onSendInvite,
        onToggleVoiceCamera: voiceRuntime.toggleCamera,
        onToggleVoiceMute: voiceRuntime.toggleMute,
        onToggleVoiceScreenShare: voiceRuntime.toggleScreenShare,
        voiceInputMode: voiceRuntime.voiceInputMode,
        voicePushToTalkPhase: voiceRuntime.pushToTalkState.phase,
        voiceRoomState,
        voiceScreenShareQualityId: voiceRuntime.screenShareQualityId,
      }),
    [
      bootstrapState,
      inviteCandidates,
      inviteSendStates,
      onLeaveVoiceChannel,
      onSendInvite,
      voiceRoomState,
      voiceRuntime,
    ],
  );
}
