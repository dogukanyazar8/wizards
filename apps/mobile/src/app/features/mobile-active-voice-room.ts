import type {
  MobileBootstrapViewState,
  MobileVoiceRoomState,
} from "../mobile-root-screen-shared";

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
