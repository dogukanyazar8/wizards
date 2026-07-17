import type { MobileBootstrapViewState, MobileVoiceRoomState } from "../mobile-root-screen-shared";
import type { MobileVoiceScreenProps } from "../providers/mobile-product-screen-provider";

type MobileVoiceInviteInput = {
  readonly channelId: string;
  readonly channelName: string;
  readonly serverId: string;
};

export function getMobileActiveVoiceRoomPresentation({
  bootstrapState,
  onOpenVoiceInvite,
  voiceRoomState,
}: {
  readonly bootstrapState: MobileBootstrapViewState;
  readonly onOpenVoiceInvite: (input: MobileVoiceInviteInput) => void;
  readonly voiceRoomState: MobileVoiceRoomState;
}) {
  const serverName =
    bootstrapState.status === "ready"
      ? (bootstrapState.payload.home.servers.recent.find(
          (server) => server.id === voiceRoomState.serverId,
        )?.name ?? null)
      : null;

  return {
    onOpenVoiceInvite: () => {
      if (!voiceRoomState.channelId || !voiceRoomState.channelName || !voiceRoomState.serverId) {
        return;
      }

      onOpenVoiceInvite({
        channelId: voiceRoomState.channelId,
        channelName: voiceRoomState.channelName,
        serverId: voiceRoomState.serverId,
      });
    },
    serverName,
  };
}

/** Binds the voice-room screen contract to the active session runtime. */
export function createMobileVoiceScreenProps({
  bootstrapState,
  onBeginVoicePushToTalk,
  onEndVoicePushToTalk,
  onLeaveVoiceChannel,
  onOpenVoiceInvite,
  onSelectVoiceAudioOutput,
  onToggleVoiceMute,
  voiceInputMode,
  voicePushToTalkPhase,
  voiceRoomState,
}: {
  readonly bootstrapState: MobileBootstrapViewState;
  readonly onBeginVoicePushToTalk: MobileVoiceScreenProps["onBeginVoicePushToTalk"];
  readonly onEndVoicePushToTalk: MobileVoiceScreenProps["onEndVoicePushToTalk"];
  readonly onLeaveVoiceChannel: MobileVoiceScreenProps["onLeaveVoiceChannel"];
  readonly onOpenVoiceInvite: (input: MobileVoiceInviteInput) => void;
  readonly onSelectVoiceAudioOutput: MobileVoiceScreenProps["onSelectVoiceAudioOutput"];
  readonly onToggleVoiceMute: MobileVoiceScreenProps["onToggleVoiceMute"];
  readonly voiceInputMode: MobileVoiceScreenProps["voiceInputMode"];
  readonly voicePushToTalkPhase: MobileVoiceScreenProps["voicePushToTalkPhase"];
  readonly voiceRoomState: MobileVoiceRoomState;
}): MobileVoiceScreenProps {
  const presentation = getMobileActiveVoiceRoomPresentation({
    bootstrapState,
    onOpenVoiceInvite,
    voiceRoomState,
  });

  return {
    bootstrapState,
    onBeginVoicePushToTalk,
    onEndVoicePushToTalk,
    onLeaveVoiceChannel,
    onOpenVoiceInvite: presentation.onOpenVoiceInvite,
    ...(onSelectVoiceAudioOutput ? { onSelectVoiceAudioOutput } : {}),
    onToggleVoiceMute,
    serverName: presentation.serverName,
    voiceInputMode,
    voicePushToTalkPhase,
    voiceRoomState,
  };
}
