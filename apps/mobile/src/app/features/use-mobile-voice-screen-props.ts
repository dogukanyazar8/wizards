import { createElement, useMemo, type ReactNode } from "react";
import type { MobileApiClient } from "../../api/mobile-api-client";
import { useMobileServerMembersInfiniteQuery } from "../../workspace/mobile-server-management-query";
import {
  useMobileVoiceRuntime,
  useMobileVoiceRuntimeState,
} from "../providers/mobile-voice-provider";
import { MobileVoiceScreenProvider } from "../providers/mobile-product-screen-provider";
import {
  createMobileVoiceScreenProps,
  getMobileActiveVoiceInviteCandidates,
} from "./mobile-active-voice-room";

type MobileVoiceScreenPropsInput = Parameters<typeof createMobileVoiceScreenProps>[0];

type MobileVoiceScreenRuntimeProviderProps = Omit<
  Parameters<typeof useMobileVoiceScreenProps>[0],
  "voiceRuntime"
> & {
  readonly children: ReactNode;
};

/**
 * Room state comes from the voice store; actions come from the stable context.
 * Depending on the whole runtime used to invalidate this memo for unrelated
 * provider renders even when every screen input stayed the same.
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
  const voiceRoomState = useMobileVoiceRuntimeState((state) => state.roomState);
  const voiceAudioProcessing = useMobileVoiceRuntimeState((state) => state.voiceAudioProcessing);
  const voiceInputMode = useMobileVoiceRuntimeState((state) => state.voiceInputMode);
  const voicePushToTalkPhase = useMobileVoiceRuntimeState((state) => state.pushToTalkState.phase);
  const voiceScreenShareAudioMuted = useMobileVoiceRuntimeState(
    (state) => state.screenShareAudioMuted,
  );
  const voiceScreenShareQualityId = useMobileVoiceRuntimeState(
    (state) => state.screenShareQualityId,
  );
  const {
    beginPushToTalk,
    endPushToTalk,
    flipCamera,
    refreshVoiceDevices,
    selectAudioDeviceOutput,
    selectAudioInput,
    selectAudioOutput,
    selectAudioProcessing,
    selectNoiseSuppression,
    selectScreenShareAudioMuted,
    selectScreenShareQuality,
    selectVoiceInputMode,
    toggleCamera,
    toggleMute,
    toggleScreenShare,
  } = voiceRuntime;
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
        onBeginVoicePushToTalk: beginPushToTalk,
        onEndVoicePushToTalk: endPushToTalk,
        onFlipVoiceCamera: flipCamera,
        onLeaveVoiceChannel,
        onRefreshVoiceDevices: refreshVoiceDevices,
        onSelectVoiceAudioInput: selectAudioInput,
        onSelectVoiceAudioOutput: selectAudioOutput,
        onSelectVoiceAudioOutputDevice: selectAudioDeviceOutput,
        onSelectVoiceAudioProcessing: selectAudioProcessing,
        onSelectVoiceInputMode: selectVoiceInputMode,
        onSelectVoiceNoiseSuppression: selectNoiseSuppression,
        onSelectVoiceScreenShareAudioMuted: selectScreenShareAudioMuted,
        onSelectVoiceScreenShareQuality: selectScreenShareQuality,
        onSendInvite,
        onToggleVoiceCamera: toggleCamera,
        onToggleVoiceMute: toggleMute,
        onToggleVoiceScreenShare: toggleScreenShare,
        voiceAudioProcessing,
        voiceInputMode,
        voicePushToTalkPhase,
        voiceRoomState,
        voiceScreenShareAudioMuted,
        voiceScreenShareQualityId,
      }),
    [
      beginPushToTalk,
      bootstrapState,
      endPushToTalk,
      flipCamera,
      inviteCandidates,
      inviteSendStates,
      onLeaveVoiceChannel,
      onSendInvite,
      refreshVoiceDevices,
      selectAudioDeviceOutput,
      selectAudioInput,
      selectAudioOutput,
      selectAudioProcessing,
      selectNoiseSuppression,
      selectScreenShareAudioMuted,
      selectScreenShareQuality,
      selectVoiceInputMode,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
      voiceAudioProcessing,
      voiceInputMode,
      voicePushToTalkPhase,
      voiceRoomState,
      voiceScreenShareAudioMuted,
      voiceScreenShareQualityId,
    ],
  );
}

/**
 * Voice room state changes at audio-meter speed. Keeping that subscription in
 * this boundary lets the voice screen update without re-running ProductApp and
 * rebuilding unrelated screen-provider values.
 */
export function MobileVoiceScreenRuntimeProvider({
  children,
  ...input
}: MobileVoiceScreenRuntimeProviderProps) {
  const voiceRuntime = useMobileVoiceRuntime();
  const value = useMobileVoiceScreenProps({ ...input, voiceRuntime });
  return createElement(MobileVoiceScreenProvider, { value }, children);
}
