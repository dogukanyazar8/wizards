import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import { AppState } from "react-native";
import {
  LocalAudioTrack,
  LocalVideoTrack,
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
  type MobileVoiceScreenShareStatus,
} from "./mobile-voice-room-contract";
import {
  getMobileScreenShareCaptureOptions,
  getMobileScreenSharePublishOptions,
} from "./mobile-screen-share";
import {
  MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE,
  buildMobileScreenShareHeartbeatPayload,
  isMobileScreenSharePermissionDenied,
  redactMobileScreenShareError,
} from "./mobile-screen-share-contract";
import {
  MOBILE_VOICE_DISCONNECTED_MESSAGE,
  MOBILE_VOICE_HEARTBEAT_INTERVAL_MS,
  MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD,
  MOBILE_VOICE_LEVEL_INTERVAL_MS,
} from "./mobile-voice-lifecycle-contract";
import {
  createInitialMobilePushToTalkState,
  createMobilePushToTalkController,
  type MobilePushToTalkState,
  type MobileVoiceInputMode,
} from "./mobile-voice-ptt-contract";
import {
  getMobileMicrophoneCaptureOptions,
  setMobileMicrophoneEnabledWithNoiseSuppression,
} from "./mobile-voice-noise-contract";
import { requestMobileVoicePermissionAfterUserAction } from "./mobile-voice-runtime";
import type { MobileVoiceStateParticipant } from "@wizards/types";
import {
  getMobileCameraCaptureOptions,
  getNextMobileCameraFacingMode,
} from "./mobile-camera-contract";
import {
  DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES,
  sanitizeMobileVoiceDeviceId,
  toMobileVoiceInputOptions,
  toMobileVoiceOutputOptions,
  type MobileVoiceDevicePreferences,
} from "./mobile-voice-device-contract";

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

function getScreenShareTrackKey(participant: MobileVoiceRoomParticipant): string | null {
  const publication = participant.screenShareTrackRef?.publication;
  if (!publication) {
    return null;
  }

  return `${publication.trackSid}:${publication.track ? "subscribed" : "pending"}`;
}

function getCameraTrackKey(participant: MobileVoiceRoomParticipant): string | null {
  const publication = participant.cameraTrackRef?.publication;
  return publication
    ? `${publication.trackSid}:${publication.track ? "subscribed" : "pending"}`
    : null;
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
      getCameraTrackKey(previous) !== getCameraTrackKey(participant) ||
      getScreenShareTrackKey(previous) !== getScreenShareTrackKey(participant) ||
      Math.abs(previous.audioLevel - participant.audioLevel) >= MOBILE_VOICE_LEVEL_CHANGE_THRESHOLD
    ) {
      return true;
    }
  }

  return false;
}

function getCameraTrackRef(
  participant: Participant,
): MobileVoiceRoomParticipant["cameraTrackRef"] {
  const publication = participant.getTrackPublication(Track.Source.Camera);
  if (!publication?.track) {
    return undefined;
  }

  return {
    participant,
    publication,
    source: Track.Source.Camera,
  };
}

function getScreenShareTrackRef(
  participant: Participant,
): MobileVoiceRoomParticipant["screenShareTrackRef"] {
  const publication = participant.getTrackPublication(Track.Source.ScreenShare);
  if (!publication?.track) {
    return undefined;
  }

  return {
    participant,
    publication,
    source: Track.Source.ScreenShare,
  };
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
  const cameraTrackRef = getCameraTrackRef(participant);
  const screenShareTrackRef = getScreenShareTrackRef(participant);

  const roomParticipant = {
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

  return {
    ...roomParticipant,
    ...(cameraTrackRef ? { cameraTrackRef } : {}),
    ...(screenShareTrackRef ? { screenShareTrackRef } : {}),
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

function isLocalParticipantScreenSharing(room: Room): boolean {
  return Boolean(room.localParticipant.getTrackPublication(Track.Source.ScreenShare));
}

function resolveSelfScreenShareStatus(
  currentStatus: MobileVoiceScreenShareStatus,
  isScreenSharing: boolean,
): MobileVoiceScreenShareStatus {
  if (isScreenSharing) {
    return "on";
  }

  if (
    currentStatus === "on" ||
    currentStatus === "starting" ||
    currentStatus === "stopping" ||
    currentStatus === "unsupported"
  ) {
    return "off";
  }

  return currentStatus;
}

export function useMobileVoiceRoom({
  apiClient,
  currentUser,
  onVoiceDevicePreferencesChange,
  voiceDevicePreferences = DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES,
  voiceInputMode,
}: {
  apiClient: MobileApiClient;
  currentUser: MobileSessionUser | null;
  onVoiceDevicePreferencesChange?(preferences: MobileVoiceDevicePreferences): void;
  voiceDevicePreferences?: MobileVoiceDevicePreferences;
  voiceInputMode: MobileVoiceInputMode;
}) {
  const [permissionState, setPermissionState] = useState<MobileVoiceRuntimeState>(
    createInitialMobileVoiceRuntimeState,
  );
  const [roomState, setRoomState] = useState<MobileVoiceRoomState>(
    createInitialMobileVoiceRoomState,
  );
  const [pushToTalkState, setPushToTalkState] = useState<MobilePushToTalkState>(
    createInitialMobilePushToTalkState,
  );
  const roomRef = useRef<Room | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const currentUserRef = useRef<MobileSessionUser | null>(currentUser);
  const voiceDevicePreferencesRef = useRef(voiceDevicePreferences);
  const isIntentionalLeaveRef = useRef(false);
  const intentionallyDisconnectedRoomsRef = useRef<WeakSet<Room>>(new WeakSet());

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    voiceDevicePreferencesRef.current = voiceDevicePreferences;
    setRoomState((current) => ({
      ...current,
      noiseSuppressionEnabled: voiceDevicePreferences.noiseSuppressionEnabled,
      selectedAudioInputId: voiceDevicePreferences.audioInputId,
      selectedAudioOutputId: voiceDevicePreferences.audioOutputId,
    }));
  }, [voiceDevicePreferences]);

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
      const selfScreenShareEnabled = isLocalParticipantScreenSharing(room);
      const screenShareStatus = resolveSelfScreenShareStatus(
        current.screenShareStatus,
        selfScreenShareEnabled,
      );

      if (
        current.selfCameraEnabled === selfCameraEnabled &&
        current.selfMuted === selfMuted &&
        current.selfScreenShareEnabled === selfScreenShareEnabled &&
        current.screenShareStatus === screenShareStatus &&
        !voiceParticipantsChanged(current.participants, participants)
      ) {
        return current;
      }

      return {
        ...current,
        participants,
        screenShareStatus,
        selfCameraEnabled,
        selfMuted,
        selfScreenShareEnabled,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const setMobileMicrophoneEnabled = useCallback(
    async (enabled: boolean) => {
      const room = roomRef.current;
      if (!room) {
        return;
      }

      await setMobileMicrophoneEnabledWithNoiseSuppression(
        room.localParticipant,
        enabled,
        getMobileMicrophoneCaptureOptions(
          voiceDevicePreferencesRef.current.noiseSuppressionEnabled,
        ),
      );
      updateParticipantsFromRoom();
    },
    [updateParticipantsFromRoom],
  );

  const pushToTalkController = useMemo(
    () =>
      createMobilePushToTalkController({
        onStateChange: setPushToTalkState,
        setMicrophoneEnabled: setMobileMicrophoneEnabled,
        timers: {
          clearTimeout,
          now: () => Date.now(),
          setTimeout,
        },
      }),
    [setMobileMicrophoneEnabled],
  );

  const requestMicrophonePermission = useCallback(async () => {
    setPermissionState((current) => createCheckingMobileVoiceRuntimeState(current));
    const nextState = await requestMobileVoicePermissionAfterUserAction();
    setPermissionState(nextState);
    return nextState;
  }, []);

  const commitVoiceDevicePreferences = useCallback(
    (nextPreferences: MobileVoiceDevicePreferences) => {
      voiceDevicePreferencesRef.current = nextPreferences;
      onVoiceDevicePreferencesChange?.(nextPreferences);
      setRoomState((current) => ({
        ...current,
        noiseSuppressionEnabled: nextPreferences.noiseSuppressionEnabled,
        selectedAudioInputId: nextPreferences.audioInputId,
        selectedAudioOutputId: nextPreferences.audioOutputId,
        updatedAt: Date.now(),
      }));
    },
    [onVoiceDevicePreferencesChange],
  );

  const enumerateVoiceDevices = useCallback(async (room: Room) => {
    const [rawInputs, rawOutputs] = await Promise.all([
      Room.getLocalDevices("audioinput"),
      AudioSession.getAudioOutputs(),
    ]);
    const availableAudioInputs = toMobileVoiceInputOptions(rawInputs);
    const availableAudioOutputs = toMobileVoiceOutputOptions(rawOutputs);
    const currentPreferences = voiceDevicePreferencesRef.current;
    const selectedAudioInputId = availableAudioInputs.some(
      ({ id }) => id === currentPreferences.audioInputId,
    )
      ? currentPreferences.audioInputId
      : null;
    const selectedAudioOutputId = availableAudioOutputs.some(
      ({ id }) => id === currentPreferences.audioOutputId,
    )
      ? currentPreferences.audioOutputId
      : null;

    if (selectedAudioInputId) {
      await room.switchActiveDevice("audioinput", selectedAudioInputId);
    }
    if (selectedAudioOutputId) {
      await AudioSession.selectAudioOutput(selectedAudioOutputId);
    }

    if (
      selectedAudioInputId !== currentPreferences.audioInputId ||
      selectedAudioOutputId !== currentPreferences.audioOutputId
    ) {
      commitVoiceDevicePreferences({
        ...currentPreferences,
        audioInputId: selectedAudioInputId,
        audioOutputId: selectedAudioOutputId,
      });
    }

    setRoomState((current) => ({
      ...current,
      availableAudioInputs,
      availableAudioOutputs,
      selectedAudioInputId,
      selectedAudioOutputId,
      selfAudioOutput:
        selectedAudioOutputId === "speaker" || selectedAudioOutputId === "force_speaker"
          ? "speaker"
          : "default",
      updatedAt: Date.now(),
    }));
  }, [commitVoiceDevicePreferences]);

  const refreshVoiceDevices = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    try {
      await enumerateVoiceDevices(room);
    } catch (error) {
      setRoomState((current) => ({
        ...current,
        errorMessage: redactMobileVoiceRoomError(error),
        updatedAt: Date.now(),
      }));
    }
  }, [enumerateVoiceDevices]);

  const leaveVoiceChannel = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const room = roomRef.current;
    isIntentionalLeaveRef.current = true;
    if (room) {
      intentionallyDisconnectedRoomsRef.current.add(room);
    }

    await pushToTalkController.cancel({ closeMicrophone: true });
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
    } finally {
      isIntentionalLeaveRef.current = false;
    }
  }, [apiClient, clearHeartbeat, clearLevelTicker, pushToTalkController]);

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
        const isScreenSharing = Boolean(room && isLocalParticipantScreenSharing(room));
        void sendMobileVoiceHeartbeat(apiClient, {
          ...buildMobileScreenShareHeartbeatPayload({ isScreenSharing, sessionId }),
          selfVideo: Boolean(room?.localParticipant.isCameraEnabled),
        }).catch(() => {
          // Heartbeat failures are surfaced by reconnect/state refresh paths.
        });
      }, MOBILE_VOICE_HEARTBEAT_INTERVAL_MS);
    },
    [apiClient, clearHeartbeat],
  );

  const cleanupDisconnectedRoom = useCallback(
    (room: Room) => {
      clearHeartbeat();
      clearLevelTicker();
      void pushToTalkController.cancel({ closeMicrophone: true }).catch(() => undefined);

      if (roomRef.current === room) {
        roomRef.current = null;
      }

      void AudioSession.stopAudioSession().catch(() => undefined);

      if (isIntentionalLeaveRef.current || intentionallyDisconnectedRoomsRef.current.has(room)) {
        return;
      }

      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;

      if (sessionId) {
        // Unexpected LiveKit disconnects perform server-leave cleanup to avoid stale mobile voice state.
        void leaveMobileVoiceState(apiClient, { sessionId }).catch(() => undefined);
      }

      setRoomState((current) => {
        if (current.status === "idle" || current.status === "leaving") {
          return current;
        }

        return {
          ...current,
          errorMessage: MOBILE_VOICE_DISCONNECTED_MESSAGE,
          sessionId: null,
          status: "error",
          updatedAt: Date.now(),
        };
      });
    },
    [apiClient, clearHeartbeat, clearLevelTicker, pushToTalkController],
  );

  const bindRoomEvents = useCallback(
    (room: Room) => {
      const refresh = () => updateParticipantsFromRoom();
      const refreshOnParticipant = (_participant: RemoteParticipant) => refresh();
      const handleDisconnected = () => {
        refresh();
        cleanupDisconnectedRoom(room);
      };

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
      room.on(RoomEvent.Disconnected, handleDisconnected);

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
        room.off(RoomEvent.Disconnected, handleDisconnected);
      };
    },
    [cleanupDisconnectedRoom, updateParticipantsFromRoom],
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
        await setMobileMicrophoneEnabledWithNoiseSuppression(
          room.localParticipant,
          voiceInputMode === "voice-activity",
          getMobileMicrophoneCaptureOptions(
            voiceDevicePreferencesRef.current.noiseSuppressionEnabled,
          ),
        );
        await enumerateVoiceDevices(room).catch(() => undefined);
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
          noiseSuppressionEnabled:
            voiceDevicePreferencesRef.current.noiseSuppressionEnabled,
          screenShareStatus: "off",
          selfCameraEnabled: room.localParticipant.isCameraEnabled,
          selfMuted: !room.localParticipant.isMicrophoneEnabled,
          selfScreenShareEnabled: false,
          serverId,
          sessionId,
          status: "connected",
          updatedAt: Date.now(),
        }));

        room.once(RoomEvent.Disconnected, unbindRoomEvents);

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
      enumerateVoiceDevices,
      leaveVoiceChannel,
      requestMicrophonePermission,
      roomState.channelId,
      roomState.status,
      startHeartbeat,
      startLevelTicker,
      voiceInputMode,
    ],
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected" || voiceInputMode === "push-to-talk") {
      return;
    }

    const nextEnabled = !room.localParticipant.isMicrophoneEnabled;
    await setMobileMicrophoneEnabledWithNoiseSuppression(
      room.localParticipant,
      nextEnabled,
      getMobileMicrophoneCaptureOptions(
        voiceDevicePreferencesRef.current.noiseSuppressionEnabled,
      ),
    );
    updateParticipantsFromRoom();
  }, [roomState.status, updateParticipantsFromRoom, voiceInputMode]);

  const beginPushToTalk = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected" || voiceInputMode !== "push-to-talk") {
      return;
    }

    await pushToTalkController.begin({
      isMicrophoneEnabled: room.localParticipant.isMicrophoneEnabled,
    });
    updateParticipantsFromRoom();
  }, [pushToTalkController, roomState.status, updateParticipantsFromRoom, voiceInputMode]);

  const endPushToTalk = useCallback(() => {
    if (voiceInputMode !== "push-to-talk") {
      return;
    }

    pushToTalkController.end();
  }, [pushToTalkController, voiceInputMode]);

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

  const flipCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected" || !room.localParticipant.isCameraEnabled) {
      return;
    }

    const cameraTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (!(cameraTrack instanceof LocalVideoTrack)) {
      return;
    }

    const facingMode = getNextMobileCameraFacingMode(roomState.cameraFacingMode);
    try {
      await cameraTrack.restartTrack(getMobileCameraCaptureOptions(facingMode));
      setRoomState((current) => ({
        ...current,
        cameraFacingMode: facingMode,
        errorMessage: null,
        updatedAt: Date.now(),
      }));
      updateParticipantsFromRoom();
    } catch (error) {
      setRoomState((current) => ({
        ...current,
        errorMessage: redactMobileVoiceRoomError(error),
        updatedAt: Date.now(),
      }));
    }
  }, [roomState.cameraFacingMode, roomState.status, updateParticipantsFromRoom]);

  const sendScreenShareHeartbeat = useCallback(
    (isScreenSharing: boolean) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        return;
      }

      void sendMobileVoiceHeartbeat(
        apiClient,
        buildMobileScreenShareHeartbeatPayload({ isScreenSharing, sessionId }),
      ).catch(() => undefined);
    },
    [apiClient],
  );

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room || roomState.status !== "connected") {
      return;
    }

    const nextEnabled = !isLocalParticipantScreenSharing(room);
    setRoomState((current) => ({
      ...current,
      errorMessage: null,
      screenShareStatus: nextEnabled ? "starting" : "stopping",
      updatedAt: Date.now(),
    }));

    try {
      await room.localParticipant.setScreenShareEnabled(
        nextEnabled,
        getMobileScreenShareCaptureOptions(),
        getMobileScreenSharePublishOptions(),
      );
      updateParticipantsFromRoom();
      sendScreenShareHeartbeat(nextEnabled);
      setRoomState((current) => ({
        ...current,
        errorMessage: null,
        screenShareStatus: nextEnabled ? "on" : "off",
        selfScreenShareEnabled: nextEnabled,
        updatedAt: Date.now(),
      }));
    } catch (error) {
      sendScreenShareHeartbeat(false);
      setRoomState((current) => ({
        ...current,
        errorMessage: redactMobileScreenShareError(error),
        screenShareStatus: isMobileScreenSharePermissionDenied(error)
          ? "permission-denied"
          : "error",
        selfScreenShareEnabled: false,
        updatedAt: Date.now(),
      }));
    }
  }, [roomState.status, sendScreenShareHeartbeat, updateParticipantsFromRoom]);

  const selectAudioInput = useCallback(
    async (rawDeviceId: string) => {
      const room = roomRef.current;
      const deviceId = sanitizeMobileVoiceDeviceId(rawDeviceId);
      if (
        !room ||
        !deviceId ||
        roomState.status !== "connected" ||
        !roomState.availableAudioInputs.some(({ id }) => id === deviceId)
      ) {
        return;
      }

      try {
        await room.switchActiveDevice("audioinput", deviceId);
        commitVoiceDevicePreferences({
          ...voiceDevicePreferencesRef.current,
          audioInputId: deviceId,
        });
        setRoomState((current) => ({ ...current, errorMessage: null }));
      } catch (error) {
        setRoomState((current) => ({
          ...current,
          errorMessage: redactMobileVoiceRoomError(error),
          updatedAt: Date.now(),
        }));
      }
    },
    [commitVoiceDevicePreferences, roomState.availableAudioInputs, roomState.status],
  );

  const selectAudioDeviceOutput = useCallback(
    async (rawDeviceId: string) => {
      const deviceId = sanitizeMobileVoiceDeviceId(rawDeviceId);
      if (
        !deviceId ||
        roomState.status !== "connected" ||
        (roomState.availableAudioOutputs.length > 0 &&
          !roomState.availableAudioOutputs.some(({ id }) => id === deviceId))
      ) {
        return;
      }

      try {
        await AudioSession.selectAudioOutput(deviceId);
        commitVoiceDevicePreferences({
          ...voiceDevicePreferencesRef.current,
          audioOutputId: deviceId,
        });
        setRoomState((current) => ({
          ...current,
          errorMessage: null,
          selfAudioOutput:
            deviceId === "speaker" || deviceId === "force_speaker" ? "speaker" : "default",
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
    [commitVoiceDevicePreferences, roomState.availableAudioOutputs, roomState.status],
  );

  const selectAudioOutput = useCallback(
    async (mode: MobileVoiceAudioOutputMode) => {
      const speakerId = roomState.availableAudioOutputs.some(({ id }) => id === "force_speaker")
        ? "force_speaker"
        : "speaker";
      await selectAudioDeviceOutput(mode === "speaker" ? speakerId : "default");
    },
    [roomState.availableAudioOutputs, selectAudioDeviceOutput],
  );

  const selectNoiseSuppression = useCallback(
    async (enabled: boolean) => {
      const room = roomRef.current;
      if (!room || roomState.status !== "connected") {
        return;
      }

      try {
        const microphoneTrack = room.localParticipant.getTrackPublication(
          Track.Source.Microphone,
        )?.track;
        if (room.localParticipant.isMicrophoneEnabled && microphoneTrack instanceof LocalAudioTrack) {
          await microphoneTrack.restartTrack(getMobileMicrophoneCaptureOptions(enabled));
        }
        commitVoiceDevicePreferences({
          ...voiceDevicePreferencesRef.current,
          noiseSuppressionEnabled: enabled,
        });
        setRoomState((current) => ({ ...current, errorMessage: null }));
      } catch (error) {
        setRoomState((current) => ({
          ...current,
          errorMessage: redactMobileVoiceRoomError(error),
          updatedAt: Date.now(),
        }));
      }
    },
    [commitVoiceDevicePreferences, roomState.status],
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

  useEffect(() => {
    if (voiceInputMode !== "push-to-talk") {
      void pushToTalkController.cancel().catch(() => undefined);
      return;
    }

    if (roomState.status !== "connected") {
      void pushToTalkController.cancel({ closeMicrophone: true }).catch(() => undefined);
      return;
    }

    void pushToTalkController
      .cancel({ closeMicrophone: true })
      .catch(() => undefined)
      .finally(updateParticipantsFromRoom);
  }, [pushToTalkController, roomState.status, updateParticipantsFromRoom, voiceInputMode]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        return;
      }

      const room = roomRef.current;
      if (!room) {
        return;
      }

      if (voiceInputMode === "push-to-talk") {
        void pushToTalkController
          .cancel({ closeMicrophone: true })
          .catch(() => undefined)
          .finally(updateParticipantsFromRoom);
      }

      if (room.localParticipant.isCameraEnabled) {
        void room.localParticipant
          .setCameraEnabled(false)
          .catch(() => undefined)
          .finally(() => {
            const sessionId = sessionIdRef.current;
            if (sessionId) {
              void sendMobileVoiceHeartbeat(apiClient, {
                selfVideo: false,
                sessionId,
              }).catch(() => undefined);
            }
            updateParticipantsFromRoom();
          });
      }

      if (isLocalParticipantScreenSharing(room)) {
        void room.localParticipant
          .setScreenShareEnabled(false)
          .catch(() => undefined)
          .finally(() => {
            sendScreenShareHeartbeat(false);
            updateParticipantsFromRoom();
            setRoomState((current) => ({
              ...current,
              errorMessage: MOBILE_SCREEN_SHARE_BACKGROUND_STOP_MESSAGE,
              screenShareStatus: "off",
              selfScreenShareEnabled: false,
              updatedAt: Date.now(),
            }));
          });
      }
    });

    return () => subscription.remove();
  }, [
    apiClient,
    pushToTalkController,
    sendScreenShareHeartbeat,
    updateParticipantsFromRoom,
    voiceInputMode,
  ]);

  useEffect(
    () => () => {
      clearHeartbeat();
      clearLevelTicker();
      isIntentionalLeaveRef.current = true;
      const room = roomRef.current;
      if (room) {
        intentionallyDisconnectedRoomsRef.current.add(room);
      }
      void pushToTalkController.cancel({ closeMicrophone: true }).catch(() => undefined);
      try {
        room?.disconnect(true);
      } catch {
        // Best-effort cleanup on unmount.
      }
      if (sessionIdRef.current) {
        void leaveMobileVoiceState(apiClient, { sessionId: sessionIdRef.current }).catch(
          () => undefined,
        );
        sessionIdRef.current = null;
      }
      roomRef.current = null;
      void AudioSession.stopAudioSession().catch(() => undefined);
    },
    [apiClient, clearHeartbeat, clearLevelTicker, pushToTalkController],
  );

  return {
    beginPushToTalk,
    endPushToTalk,
    flipCamera,
    joinVoiceChannel,
    leaveVoiceChannel,
    permissionState,
    pushToTalkState,
    requestMicrophonePermission,
    refreshVoiceDevices,
    roomState,
    selectAudioDeviceOutput,
    selectAudioInput,
    selectAudioOutput,
    selectNoiseSuppression,
    syncParticipantAudioLevelFromServer,
    syncParticipantsFromServer,
    toggleCamera,
    toggleMute,
    toggleScreenShare,
  };
}
