import { useCallback, useEffect, useRef, useState } from "react";
import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
} from "livekit-client";

import type { MobileApiClient } from "../api/mobile-api-client";
import type { MobileSessionUser } from "../auth/session-types";
import {
  fetchMobileVoiceToken,
  joinMobileVoiceState,
  leaveMobileVoiceState,
  sendMobileVoiceHeartbeat,
} from "./mobile-voice-client";
import {
  createCheckingMobileVoiceRuntimeState,
  createErroredMobileVoiceRuntimeState,
  createInitialMobileVoiceRuntimeState,
  createMobileVoiceRuntimeStateFromPermission,
  type MobileVoiceRuntimeState,
} from "./mobile-voice-contract";
import {
  createInitialMobileVoiceRoomState,
  createMobileVoiceSessionId,
  createSelfVoiceRoomParticipant,
  mapServerVoiceParticipantToRoomParticipant,
  mergeMobileVoiceRoomParticipants,
  redactMobileVoiceRoomError,
  type MobileVoiceAudioOutputMode,
  type MobileVoiceRoomParticipant,
  type MobileVoiceRoomState,
} from "./mobile-voice-room-contract";
import { requestMobileVoicePermissionAfterUserAction } from "./mobile-voice-runtime";
import type { MobileVoiceStateParticipant } from "@wizards/types";

const MOBILE_VOICE_HEARTBEAT_INTERVAL_MS = 25_000;
const MOBILE_VOICE_LEVEL_INTERVAL_MS = 90;
const MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD = 0.025;

type JoinVoiceChannelInput = {
  channelId: string;
  channelName: string;
  serverId: string;
};

type SyncServerVoiceParticipantsInput = {
  channelId: string;
  participants: readonly MobileVoiceStateParticipant[];
  serverId: string;
};

type SyncServerVoiceAudioLevelInput = {
  audioLevel: number;
  channelId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
};

function toBoundedAudioLevel(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value ?? 0));
}

function participantIdentityToUserId(identity: string): string {
  return identity.replace(/^user:/, "");
}

function voiceParticipantsChanged(
  current: readonly MobileVoiceRoomParticipant[],
  next: readonly MobileVoiceRoomParticipant[],
): boolean {
  if (current.length !== next.length) {
    return true;
  }

  const currentByUserId = new Map(current.map((participant) => [participant.userId, participant]));

  for (const participant of next) {
    const previous = currentByUserId.get(participant.userId);
    if (!previous) {
      return true;
    }

    if (
      previous.isCameraEnabled !== participant.isCameraEnabled ||
      previous.isMuted !== participant.isMuted ||
      previous.isScreenSharing !== participant.isScreenSharing ||
      previous.isSpeaking !== participant.isSpeaking ||
      Math.abs(previous.audioLevel - participant.audioLevel) >=
        MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD
    ) {
      return true;
    }
  }

  return false;
}

function mapLiveKitParticipantToRoomParticipant(
  participant: Participant,
  currentUser: MobileSessionUser,
): MobileVoiceRoomParticipant {
  const userId = participantIdentityToUserId(participant.identity);
  const isSelf = userId === currentUser.id;
  const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const screenSharePublication = participant.getTrackPublication(Track.Source.ScreenShare);

  return {
    audioLevel: toBoundedAudioLevel(participant.audioLevel),
    avatarUrl: isSelf ? currentUser.avatarUrl : null,
    displayName: isSelf ? currentUser.displayName : null,
    isCameraEnabled: Boolean(cameraPublication?.isSubscribed || cameraPublication?.isEnabled),
    isMuted: microphonePublication ? microphonePublication.isMuted : false,
    isScreenSharing: Boolean(screenSharePublication?.isSubscribed || screenSharePublication),
    isSelf,
    isSpeaking: participant.isSpeaking,
    userId,
    username: isSelf ? currentUser.username : userId,
  };
}

function mergeServerParticipants(
  currentUser: MobileSessionUser,
  current: readonly MobileVoiceRoomParticipant[],
  participants: readonly MobileVoiceStateParticipant[],
): MobileVoiceRoomParticipant[] {
  return mergeMobileVoiceRoomParticipants(
    current,
    participants.map((participant) =>
      mapServerVoiceParticipantToRoomParticipant(participant, currentUser.id),
    ),
  );
}

function mergeLiveKitParticipants(
  currentUser: MobileSessionUser,
  current: readonly MobileVoiceRoomParticipant[],
  room: Room,
): MobileVoiceRoomParticipant[] {
  const participants = [
    mapLiveKitParticipantToRoomParticipant(room.localParticipant, currentUser),
    ...Array.from(room.remoteParticipants.values()).map((participant) =>
      mapLiveKitParticipantToRoomParticipant(participant, currentUser),
    ),
  ];

  return mergeMobileVoiceRoomParticipants(current, participants);
}

export function useMobileVoiceRoom({
  apiClient,
  currentUser,
}: {
  apiClient: MobileApiClient;
  currentUser: MobileSessionUser | null;
}) {
  const [permissionState, setPermissionState] = useState<MobileVoiceRuntimeState>(
    createInitialMobileVoiceRuntimeState,
  );
  const [roomState, setRoomState] = useState<MobileVoiceRoomState>(
    createInitialMobileVoiceRoomState,
  );
  const roomRef = useRef<Room | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const currentUserRef = useRef<MobileSessionUser | null>(currentUser);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const clearHeartbeat = useCallback(() => {
    if (!heartbeatRef.current) {
      return;
    }

    clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }, []);

  const clearLevelTicker = useCallback(() => {
    if (!levelTickerRef.current) {
      return;
    }

    clearInterval(levelTickerRef.current);
    levelTickerRef.current = null;
  }, []);

  const updateParticipantsFromRoom = useCallback(() => {
    const user = currentUserRef.current;
    const room = roomRef.current;

    if (!user || !room) {
      return;
    }

    setRoomState((current) => {
      const participants = mergeLiveKitParticipants(user, current.participants, room);
      const selfCameraEnabled = room.localParticipant.isCameraEnabled;
      const selfMuted = !room.localParticipant.isMicrophoneEnabled;

      if (
        current.selfCameraEnabled === selfCameraEnabled &&
        current.selfMuted === selfMuted &&
        !voiceParticipantsChanged(current.participants, participants)
      ) {
        return current;
      }

      return {
        ...current,
        participants,
        selfCameraEnabled,
        selfMuted,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    setPermissionState((current) => createCheckingMobileVoiceRuntimeState(current));
    const nextState = await requestMobileVoicePermissionAfterUserAction();
    setPermissionState(nextState);
    return nextState;
  }, []);

  const leaveVoiceChannel = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const room = roomRef.current;

    clearHeartbeat();
    clearLevelTicker();
    setRoomState((current) =>
      current.status === "idle"
        ? current
        : {
            ...current,
            status: "leaving",
          },
    );

    try {
      room?.disconnect(true);
    } catch {
      // Room disconnect is best-effort; server state cleanup is still attempted.
    } finally {
      roomRef.current = null;
    }

    try {
      await AudioSession.stopAudioSession();
    } catch {
      // Audio session cleanup must not block server-side voice state cleanup.
    }

    if (sessionId) {
      try {
        await leaveMobileVoiceState(apiClient, { sessionId });
      } catch {
        // Stale server state is bounded by the heartbeat timeout.
      }
    }

    sessionIdRef.current = null;
    setRoomState(createInitialMobileVoiceRoomState());
  }, [apiClient, clearHeartbeat, clearLevelTicker]);

  const startLevelTicker = useCallback(() => {
    clearLevelTicker();
    levelTickerRef.current = setInterval(() => {
      updateParticipantsFromRoom();
    }, MOBILE_VOICE_LEVEL_INTERVAL_MS);
  }, [clearLevelTicker, updateParticipantsFromRoom]);

  const startHeartbeat = useCallback(
    (sessionId: string) => {
      clearHeartbeat();
      heartbeatRef.current = setInterval(() => {
        const room = roomRef.current;
        void sendMobileVoiceHeartbeat(apiClient, {
          selfStream: Boolean(
            room?.localParticipant.getTrackPublication(Track.Source.ScreenShare),
          ),
          selfVideo: Boolean(room?.localParticipant.isCameraEnabled),
          sessionId,
        }).catch(() => {
          // Heartbeat failures are surfaced by reconnect/state refresh paths.
        });
      }, MOBILE_VOICE_HEARTBEAT_INTERVAL_MS);
    },
    [apiClient, clearHeartbeat],
  );

  const bindRoomEvents = useCallback(
    (room: Room) => {
      const refresh = () => updateParticipantsFromRoom();
      const refreshOnParticipant = (_participant: RemoteParticipant) => refresh();

      room.on(RoomEvent.ActiveSpeakersChanged, refresh);
      room.on(RoomEvent.ParticipantConnected, refreshOnParticipant);
      room.on(RoomEvent.ParticipantDisconnected, refreshOnParticipant);
      room.on(RoomEvent.TrackMuted, refresh);
      room.on(RoomEvent.TrackUnmuted, refresh);
      room.on(RoomEvent.TrackPublished, refresh);
      room.on(RoomEvent.TrackUnpublished, refresh);
      room.on(RoomEvent.TrackSubscribed, refresh);
      room.on(RoomEvent.TrackUnsubscribed, refresh);
      room.on(RoomEvent.LocalTrackPublished, refresh);
      room.on(RoomEvent.LocalTrackUnpublished, refresh);
      room.on(RoomEvent.Disconnected, refresh);

      return () => {
        room.off(RoomEvent.ActiveSpeakersChanged, refresh);
        room.off(RoomEvent.ParticipantConnected, refreshOnParticipant);
        room.off(RoomEvent.ParticipantDisconnected, refreshOnParticipant);
        room.off(RoomEvent.TrackMuted, refresh);
        room.off(RoomEvent.TrackUnmuted, refresh);
        room.off(RoomEvent.TrackPublished, refresh);
        room.off(RoomEvent.TrackUnpublished, refresh);
        room.off(RoomEvent.TrackSubscribed, refresh);
        room.off(RoomEvent.TrackUnsubscribed, refresh);
        room.off(RoomEvent.LocalTrackPublished, refresh);
        room.off(RoomEvent.LocalTrackUnpublished, refresh);
        room.off(RoomEvent.Disconnected, refresh);
      };
    },
    [updateParticipantsFromRoom],
  );

  const joinVoiceChannel = useCallback(
    async ({ channelId, channelName, serverId }: JoinVoiceChannelInput): Promise<boolean> => {
      const user = currentUserRef.current;
      if (!user) {
        setRoomState((current) => ({
          ...current,
          channelId,
          channelName,
          errorMessage: "Voice room requires an active mobile session.",
          serverId,
          status: "error",
          updatedAt: Date.now(),
        }));
        return false;
      }

      if (roomState.status === "connected" && roomState.channelId === channelId) {
        return true;
      }

      await leaveVoiceChannel();

      setRoomState({
        ...createInitialMobileVoiceRoomState(),
        channelId,
        channelName,
        participants: [createSelfVoiceRoomParticipant(user)],
        serverId,
        status: "checking-permission",
        updatedAt: Date.now(),
      });

      const permission = await requestMicrophonePermission();
      if (!permission.hasMicrophonePermission) {
        setRoomState((current) => ({
          ...current,
          errorMessage: permission.errorMessage,
          status: "permission-denied",
          updatedAt: Date.now(),
        }));
        return false;
      }

      const sessionId = createMobileVoiceSessionId();
      sessionIdRef.current = sessionId;
      setRoomState((current) => ({
        ...current,
        sessionId,
        status: "connecting",
        updatedAt: Date.now(),
      }));

      try {
        const serverState = await joinMobileVoiceState(apiClient, {
          channelId,
          serverId,
          sessionId,
        });
        const tokenResponse = await fetchMobileVoiceToken(apiClient, { channelId });
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        const unbindRoomEvents = bindRoomEvents(room);

        roomRef.current = room;
        await AudioSession.configureAudio({
          android: {
            audioTypeOptions: AndroidAudioTypePresets.communication,
            preferredOutputList: ["bluetooth", "headset", "speaker", "earpiece"],
          },
          ios: {
            defaultOutput: "speaker",
          },
        });
        await AudioSession.startAudioSession();
        await room.connect(tokenResponse.url, tokenResponse.token, {
          autoSubscribe: true,
        });
        await room.localParticipant.setMicrophoneEnabled(true);
        startHeartbeat(sessionId);
        startLevelTicker();

        setRoomState((current) => ({
          ...current,
          channelId,
          channelName,
          errorMessage: null,
          participants: mergeLiveKitParticipants(
            user,
            mergeServerParticipants(user, current.participants, serverState.participants),
            room,
          ),
          screenShareStatus: "unsupported",
          selfCameraEnabled: room.localParticipant.isCameraEnabled,
          selfMuted: !room.localParticipant.isMicrophoneEnabled,
          serverId,
          sessionId,
          status: "connected",
          updatedAt: Date.now(),
        }));

        room.once(RoomEvent.Disconnected, () => {
          unbindRoomEvents();
        });

        return true;
      } catch (error) {
        await leaveVoiceChannel();
        setPermissionState((current) =>
          current.hasMicrophonePermission ? current : createErroredMobileVoiceRuntimeState(error),
        );
        setRoomState({
          ...createInitialMobileVoiceRoomState(),
          channelId,
          channelName,
          errorMessage: redactMobileVoiceRoomError(error),
          serverId,
          status: "error",
          updatedAt: Date.now(),
        });
        return false;
      }
    },
    [
      apiClient,
      bindRoomEvents,
      leaveVoiceChannel,
      requestMicrophonePermission,
      roomState.channelId,
      roomState.status,
      startHeartbeat,
      startLevelTicker,
    ],
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected") {
      return;
    }

    const nextEnabled = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(nextEnabled);
    updateParticipantsFromRoom();
  }, [roomState.status, updateParticipantsFromRoom]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected") {
      return;
    }

    const nextEnabled = !room.localParticipant.isCameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(nextEnabled);
      updateParticipantsFromRoom();
      if (sessionIdRef.current) {
        void sendMobileVoiceHeartbeat(apiClient, {
          selfVideo: nextEnabled,
          sessionId: sessionIdRef.current,
        });
      }
    } catch (error) {
      setRoomState((current) => ({
        ...current,
        errorMessage: redactMobileVoiceRoomError(error),
        updatedAt: Date.now(),
      }));
    }
  }, [apiClient, roomState.status, updateParticipantsFromRoom]);

  const selectAudioOutput = useCallback(
    async (mode: MobileVoiceAudioOutputMode) => {
      if (roomState.status !== "connected") {
        return;
      }

      try {
        await AudioSession.selectAudioOutput(mode === "speaker" ? "force_speaker" : "default");
        setRoomState((current) => ({
          ...current,
          errorMessage: null,
          selfAudioOutput: mode,
          updatedAt: Date.now(),
        }));
      } catch (error) {
        setRoomState((current) => ({
          ...current,
          errorMessage: redactMobileVoiceRoomError(error),
          updatedAt: Date.now(),
        }));
      }
    },
    [roomState.status],
  );

  const syncParticipantsFromServer = useCallback(
    ({ channelId, participants, serverId }: SyncServerVoiceParticipantsInput) => {
      const user = currentUserRef.current;
      if (!user) {
        return;
      }

      setRoomState((current) => {
        if (current.channelId !== channelId || current.serverId !== serverId) {
          return current;
        }

        return {
          ...current,
          participants: mergeServerParticipants(user, current.participants, participants),
          updatedAt: Date.now(),
        };
      });
    },
    [],
  );

  const syncParticipantAudioLevelFromServer = useCallback(
    ({ audioLevel, channelId, isMuted, isSpeaking, userId }: SyncServerVoiceAudioLevelInput) => {
      const level = toBoundedAudioLevel(audioLevel);

      setRoomState((current) => {
        if (current.channelId !== channelId || current.participants.length === 0) {
          return current;
        }

        let changed = false;
        const participants = current.participants.map((participant) => {
          if (participant.userId !== userId) {
            return participant;
          }

          const nextSpeaking = isMuted ? false : isSpeaking;
          if (
            participant.isMuted === isMuted &&
            participant.isSpeaking === nextSpeaking &&
            Math.abs(participant.audioLevel - level) < MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD
          ) {
            return participant;
          }

          changed = true;
          return {
            ...participant,
            audioLevel: isMuted ? 0 : level,
            isMuted,
            isSpeaking: nextSpeaking,
          };
        });

        if (!changed) {
          return current;
        }

        return {
          ...current,
          participants,
          updatedAt: Date.now(),
        };
      });
    },
    [],
  );

  useEffect(
    () => () => {
      clearHeartbeat();
      clearLevelTicker();
      try {
        roomRef.current?.disconnect(true);
      } catch {
        // Best-effort cleanup on unmount.
      }
      roomRef.current = null;
      void AudioSession.stopAudioSession().catch(() => undefined);
    },
    [clearHeartbeat, clearLevelTicker],
  );

  return {
    joinVoiceChannel,
    leaveVoiceChannel,
    permissionState,
    requestMicrophonePermission,
    roomState,
    selectAudioOutput,
    syncParticipantAudioLevelFromServer,
    syncParticipantsFromServer,
    toggleCamera,
    toggleMute,
  };
}
