export type VoicePageExitRoom = {
  disconnect: (stopTracks?: boolean) => Promise<unknown>;
};

export type VoicePageExitState = {
  activeChannelId: string | null;
  isScreenSharing: boolean;
  screenShareMode: string | null;
  serverId: string | null;
  sessionId: string | null;
};

export type VoicePageExitHandlerOptions<RoomType extends VoicePageExitRoom> = {
  clearReconnectTimeout: () => void;
  emitVoiceScreenShareState: (
    channelId: string | null,
    serverId: string | null,
    isScreenSharing: boolean,
    options: { force: boolean },
  ) => void;
  getRoom: () => RoomType | null;
  getState: () => VoicePageExitState;
  notifyVoiceExit: (sessionId: string) => Promise<unknown>;
  stopCamera: (room: RoomType) => Promise<unknown>;
  stopHeartbeat: () => void;
  stopLocalTracks: (room: RoomType) => Promise<unknown>;
  stopScreenShare: (room: RoomType) => Promise<unknown>;
};

export function createVoicePageExitHandler<RoomType extends VoicePageExitRoom>(
  options: VoicePageExitHandlerOptions<RoomType>,
) {
  return () => {
    options.stopHeartbeat();
    options.clearReconnectTimeout();

    const activeRoom = options.getRoom();
    const store = options.getState();

    if (store.isScreenSharing && store.screenShareMode === "voice") {
      options.emitVoiceScreenShareState(store.activeChannelId, store.serverId, false, {
        force: true,
      });
    }

    if (activeRoom) {
      void options.stopScreenShare(activeRoom).catch(() => undefined);
      void options.stopCamera(activeRoom).catch(() => undefined);
      void options.stopLocalTracks(activeRoom).catch(() => undefined);
      void activeRoom.disconnect(true).catch(() => undefined);
    }

    const activeSession = options.getState().sessionId;
    if (activeSession) {
      void options.notifyVoiceExit(activeSession).catch(() => undefined);
    }
  };
}
