"use client";

import { ConnectionState, type LocalVideoTrack } from "livekit-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/components/providers/locale-provider";
import {
  VoiceParticipantsContext,
  VoiceStateContext,
  type VoiceCameraStatus,
  type VoiceParticipantViewModel,
  type VoiceParticipantsContextValue,
  type VoiceProviderProps,
  type VoiceScreenShareViewModel,
  type VoiceStateContextValue,
} from "@/components/providers/voice-context";
import {
  notifyVoiceExit,
  TRANSIENT_VOICE_ERROR_DISMISS_MS,
} from "@/components/providers/voice-provider-shared";
import { VoiceInviteToasts } from "@/components/voice/voice-invite-toasts";
import { WHISPR_DESKTOP_BEFORE_CLOSE_EVENT } from "@/lib/desktop/runtime";
import { getSocket } from "@/lib/socket/client";
import {
  deleteVoiceState,
  sendVoiceHeartbeat,
  upsertVoiceState,
  voiceQueryKeys,
} from "@/lib/voice/client";
import { type ScreenShareQualityId } from "@/lib/voice/screen-share";
import { mapVoiceScreenShareStateCache, mapVoiceStateCache } from "@/lib/voice/state-cache";
import { type VoiceChannelStateDTO } from "@/lib/voice/types";
import { useVoiceHeartbeat } from "@/lib/voice/use-voice-heartbeat";
import { DEFAULT_PARTICIPANT_VOLUME, useVoiceStore } from "@/store/voice-store";

const E2E_VOICE_HEARTBEAT_INTERVAL_MS = 10_000;
const E2E_CAMERA_DENIED_KEY = "whispr:e2e:deny-camera";
const E2E_MICROPHONE_DENIED_KEY = "whispr:e2e:deny-microphone";
const E2E_SCREEN_SHARE_DENIED_KEY = "whispr:e2e:deny-screen-share";
const E2E_CAMERA_TRACK = {
  attach: (element: HTMLMediaElement) => element,
  detach: (element?: HTMLMediaElement) => (element ? [element] : []),
} as unknown as LocalVideoTrack;

function getE2EFlag(key: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "true";
}
function mapE2EVoiceParticipants(
  currentUser: VoiceProviderProps["currentUser"],
  participants: VoiceChannelStateDTO["participants"],
  isCameraEnabled: boolean,
  isMuted: boolean,
): VoiceParticipantViewModel[] {
  return participants.map((participant) => {
    const participantCameraEnabled =
      participant.userId === currentUser.id ? isCameraEnabled : false;

    return {
      audioLevel: 0,
      avatarUrl: participant.avatarUrl,
      cameraTrack: participantCameraEnabled ? E2E_CAMERA_TRACK : null,
      displayName: participant.displayName,
      isCameraEnabled: participantCameraEnabled,
      isLocal: participant.userId === currentUser.id,
      isMuted: participant.userId === currentUser.id ? isMuted : false,
      isSpeaking: false,
      userId: participant.userId,
      username: participant.username,
    };
  });
}

export function E2EVoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [participants, setParticipants] = useState<VoiceParticipantViewModel[]>([]);
  const [screenShares, setScreenShares] = useState<VoiceScreenShareViewModel[]>([]);
  const [activeScreenShareId, setActiveScreenShareIdState] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<VoiceCameraStatus>("disabled");
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isApplyingScreenShareQuality, setIsApplyingScreenShareQuality] = useState(false);
  const {
    activeChannelId,
    audioPreferences,
    isDeafened,
    isMuted,
    isScreenSharing,
    participantVolumes,
    screenShareError,
    screenShareQuality,
    serverId,
  } = useVoiceStore(
    useShallow((state) => ({
      activeChannelId: state.activeChannelId,
      audioPreferences: state.audioPreferences,
      isDeafened: state.isDeafened,
      isMuted: state.isMuted,
      isScreenSharing: state.isScreenSharing,
      participantVolumes: state.participantVolumes,
      screenShareError: state.screenShareError,
      screenShareQuality: state.screenShareQuality,
      serverId: state.serverId,
    })),
  );

  const setTransientErrorMessage = useCallback((message: string) => {
    setErrorMessage(message);
    window.setTimeout(() => {
      setErrorMessage((current) => (current === message ? null : current));
    }, TRANSIENT_VOICE_ERROR_DISMISS_MS);
  }, []);

  useEffect(() => {
    if (!screenShareError) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (useVoiceStore.getState().screenShareError === screenShareError) {
        useVoiceStore.getState().setScreenShareError(null);
      }
    }, TRANSIENT_VOICE_ERROR_DISMISS_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [screenShareError]);

  const getE2EHeartbeatPayload = useCallback(
    () => ({
      selfVideo: cameraStatus === "enabled",
      selfStream: useVoiceStore.getState().isScreenSharing,
    }),
    [cameraStatus],
  );
  const { startHeartbeat, stopHeartbeat } = useVoiceHeartbeat({
    getPayload: getE2EHeartbeatPayload,
    intervalMs: E2E_VOICE_HEARTBEAT_INTERVAL_MS,
    sendHeartbeat: sendVoiceHeartbeat,
  });

  const getParticipantVolume = useCallback(
    (userId: string) => participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME,
    [participantVolumes],
  );

  const syncParticipantsFromState = useCallback(
    (stateParticipants: VoiceChannelStateDTO["participants"]) => {
      setParticipants(
        mapE2EVoiceParticipants(
          currentUser,
          stateParticipants,
          cameraStatus === "enabled",
          useVoiceStore.getState().isMuted,
        ),
      );
    },
    [cameraStatus, currentUser],
  );

  const setVoiceStateCache = useCallback(
    (
      targetServerId: string,
      targetChannelId: string,
      stateParticipants: VoiceChannelStateDTO["participants"],
    ) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) => mapVoiceStateCache(current, targetChannelId, stateParticipants),
      );
    },
    [queryClient],
  );

  const emitScreenShareState = useCallback(
    (targetChannelId: string | null, targetServerId: string | null, isSharing: boolean) => {
      if (!targetChannelId || !targetServerId) {
        return;
      }

      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) =>
          mapVoiceScreenShareStateCache(current, targetChannelId, currentUser.id, isSharing),
      );

      getSocket().emit("voice:screenshare:update", {
        channelId: targetChannelId,
        isScreenSharing: isSharing,
        serverId: targetServerId,
      });
    },
    [currentUser.id, queryClient],
  );

  const stopScreenShare = useCallback(async () => {
    const store = useVoiceStore.getState();
    const targetChannelId = store.activeChannelId;
    const targetServerId = store.serverId;

    setScreenShares([]);
    setActiveScreenShareIdState(null);
    store.clearScreenShareState();
    emitScreenShareState(targetChannelId, targetServerId, false);
  }, [emitScreenShareState]);

  const stopCamera = useCallback(async () => {
    setCameraStatus("disabled");
    setCameraError(null);
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              cameraTrack: null,
              isCameraEnabled: false,
            }
          : participant,
      ),
    );
  }, []);

  const leaveChannel = useCallback(async () => {
    const store = useVoiceStore.getState();
    const targetChannelId = store.activeChannelId;
    const targetServerId = store.serverId;

    stopHeartbeat();
    await stopCamera();
    await stopScreenShare();
    setParticipants([]);
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage(null);

    if (store.sessionId) {
      await deleteVoiceState({ sessionId: store.sessionId }).catch(() => undefined);
    }

    if (targetServerId && targetChannelId) {
      setVoiceStateCache(targetServerId, targetChannelId, []);
    }

    store.leave();
  }, [setVoiceStateCache, stopCamera, stopHeartbeat, stopScreenShare]);

  const joinChannel = useCallback(
    async ({ channelId, serverId: nextServerId }: { channelId: string; serverId: string }) => {
      const store = useVoiceStore.getState();

      if (store.activeChannelId === channelId && store.serverId === nextServerId) {
        return;
      }

      if (store.activeChannelId || store.sessionId) {
        await leaveChannel();
      }

      setIsJoining(true);
      setErrorMessage(null);

      const sessionId = crypto.randomUUID();
      const hasMicrophoneAccess = !getE2EFlag(E2E_MICROPHONE_DENIED_KEY);

      try {
        const state = await upsertVoiceState({
          channelId,
          serverId: nextServerId,
          sessionId,
        });

        useVoiceStore.getState().join({
          channelId,
          serverId: nextServerId,
          sessionId,
        });
        useVoiceStore.getState().setMuted(!hasMicrophoneAccess);
        useVoiceStore.getState().setDeafened(false);
        setConnectionState(ConnectionState.Connected);
        setVoiceStateCache(nextServerId, channelId, state.participants);
        syncParticipantsFromState(state.participants);
        startHeartbeat(sessionId);

        if (!hasMicrophoneAccess) {
          setErrorMessage(t("voice.errors.microphoneDenied"));
        }
      } catch (error) {
        useVoiceStore.getState().leave();
        setParticipants([]);
        setConnectionState(ConnectionState.Disconnected);
        setErrorMessage(error instanceof Error ? error.message : t("voice.view.errorTitle"));
        throw error;
      } finally {
        setIsJoining(false);
      }
    },
    [leaveChannel, setVoiceStateCache, startHeartbeat, syncParticipantsFromState, t],
  );

  const toggleMute = useCallback(async () => {
    const nextMuted = !useVoiceStore.getState().isMuted;
    useVoiceStore.getState().setMuted(nextMuted);
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              audioLevel: nextMuted ? 0 : participant.audioLevel,
              isMuted: nextMuted,
              isSpeaking: nextMuted ? false : participant.isSpeaking,
            }
          : participant,
      ),
    );
  }, []);

  const toggleDeafen = useCallback(async () => {
    useVoiceStore.getState().setDeafened(!useVoiceStore.getState().isDeafened);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraStatus === "starting" || cameraStatus === "stopping") {
      return;
    }

    if (cameraStatus === "enabled") {
      setCameraStatus("stopping");
      await stopCamera();
      return;
    }

    setCameraStatus("starting");
    setCameraError(null);

    if (getE2EFlag(E2E_CAMERA_DENIED_KEY)) {
      const message = t("voice.errors.cameraDenied");
      setCameraStatus("permission-denied");
      setCameraError(message);
      return;
    }

    setCameraStatus("enabled");
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              cameraTrack: E2E_CAMERA_TRACK,
              isCameraEnabled: true,
            }
          : participant,
      ),
    );
  }, [cameraStatus, stopCamera, t]);

  const toggleScreenShare = useCallback(async () => {
    const store = useVoiceStore.getState();
    if (!store.activeChannelId || !store.serverId) {
      return;
    }

    if (store.isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (getE2EFlag(E2E_SCREEN_SHARE_DENIED_KEY)) {
      const message = t("screenShare.errors.permissionDenied");
      store.setScreenShareError(message);
      setTransientErrorMessage(message);
      return;
    }

    const shareId = `${currentUser.id}:e2e-screen-share`;
    const share: VoiceScreenShareViewModel = {
      avatarUrl: currentUser.avatarUrl ?? null,
      displayName: currentUser.displayName,
      id: shareId,
      isLocal: true,
      participantId: currentUser.id,
      track: null,
      trackSid: "e2e-screen-share",
      username: currentUser.username,
    };

    setScreenShares([share]);
    setActiveScreenShareIdState(shareId);
    store.setScreenShareState({
      activeSharerId: shareId,
      channelId: store.activeChannelId,
      conversationId: null,
      isSharing: true,
      mode: "voice",
    });
    setErrorMessage(null);
    emitScreenShareState(store.activeChannelId, store.serverId, true);
  }, [currentUser, emitScreenShareState, setTransientErrorMessage, stopScreenShare, t]);

  const setActiveScreenShareId = useCallback((id: string) => {
    setActiveScreenShareIdState(id);
    useVoiceStore.getState().setScreenShareState({
      activeSharerId: id,
      channelId: useVoiceStore.getState().activeChannelId,
      conversationId: null,
      isSharing: useVoiceStore.getState().isScreenSharing,
      mode: "voice",
    });
  }, []);

  const setScreenShareQuality = useCallback(async (qualityId: ScreenShareQualityId) => {
    setIsApplyingScreenShareQuality(true);
    try {
      useVoiceStore.getState().setScreenShareQuality(qualityId);
      setErrorMessage(null);
    } finally {
      setIsApplyingScreenShareQuality(false);
    }
  }, []);

  const prepareForVoiceJoin = useCallback(async () => {
    return !getE2EFlag(E2E_MICROPHONE_DENIED_KEY);
  }, []);

  useEffect(() => {
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              avatarUrl: currentUser.avatarUrl ?? null,
              displayName: currentUser.displayName,
              username: currentUser.username,
            }
          : participant,
      ),
    );
    setScreenShares((current) =>
      current.map((share) =>
        share.isLocal
          ? {
              ...share,
              avatarUrl: currentUser.avatarUrl ?? null,
              displayName: currentUser.displayName,
              username: currentUser.username,
            }
          : share,
      ),
    );
  }, [currentUser.avatarUrl, currentUser.displayName, currentUser.username]);

  useEffect(() => {
    const socket = getSocket();

    const handleVoiceStateUpdate = (data: {
      action: "join" | "leave";
      channelId: string;
      participants: VoiceChannelStateDTO["participants"];
    }) => {
      if (data.channelId !== useVoiceStore.getState().activeChannelId) {
        return;
      }

      syncParticipantsFromState(data.participants);
    };

    const handleVoiceScreenShareUpdate = (data: {
      channelId: string;
      isScreenSharing: boolean;
      userId: string;
    }) => {
      const store = useVoiceStore.getState();
      if (data.channelId !== store.activeChannelId || data.userId === currentUser.id) {
        return;
      }

      if (!data.isScreenSharing) {
        setScreenShares((current) =>
          current.filter((share) => share.participantId !== data.userId),
        );
        return;
      }

      const participant = participants.find((entry) => entry.userId === data.userId);
      if (!participant) {
        return;
      }

      const shareId = `${data.userId}:e2e-screen-share`;
      setScreenShares((current) => {
        if (current.some((share) => share.id === shareId)) {
          return current;
        }

        return [
          ...current,
          {
            avatarUrl: participant.avatarUrl,
            displayName: participant.displayName,
            id: shareId,
            isLocal: false,
            participantId: participant.userId,
            track: null,
            trackSid: "e2e-screen-share",
            username: participant.username,
          },
        ];
      });
      setActiveScreenShareIdState((current) => current ?? shareId);
    };

    socket.on("voice:state:update", handleVoiceStateUpdate);
    socket.on("voice:screenshare:update", handleVoiceScreenShareUpdate);
    return () => {
      socket.off("voice:state:update", handleVoiceStateUpdate);
      socket.off("voice:screenshare:update", handleVoiceScreenShareUpdate);
    };
  }, [currentUser.id, participants, syncParticipantsFromState]);

  useEffect(() => {
    const handlePageExit = () => {
      const store = useVoiceStore.getState();
      if (store.isScreenSharing && store.screenShareMode === "voice") {
        emitScreenShareState(store.activeChannelId, store.serverId, false);
      }

      if (store.sessionId) {
        void notifyVoiceExit(store.sessionId);
      }

      store.leave();
    };

    window.addEventListener("beforeunload", handlePageExit);
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handlePageExit);
    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handlePageExit);
      stopHeartbeat();
    };
  }, [emitScreenShareState, stopHeartbeat]);

  const voiceStateValue = useMemo<VoiceStateContextValue>(
    () => ({
      activeChannelId,
      audioPreferences,
      cameraError,
      cameraStatus,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isCameraEnabled: cameraStatus === "enabled",
      isApplyingAudioPreferences: false,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive: false,
      isRecoveringKrispNoiseCancellation: false,
      isMuted,
      isScreenSharing,
      krispAvailability: "requires_livekit_cloud",
      resetParticipantVolume: useVoiceStore.getState().resetParticipantVolume,
      room: null,
      screenShareError,
      screenShareQuality,
      serverId,
      activeScreenShareId,
      setAudioPreference: useVoiceStore.getState().setAudioPreference,
      setActiveScreenShareId,
      setParticipantVolume: useVoiceStore.getState().setParticipantVolume,
      setScreenShareQuality,
      retryKrispNoiseCancellation: async () => false,
      prepareForVoiceJoin,
      joinChannel,
      leaveChannel,
      stopCamera,
      stopScreenShare,
      toggleDeafen,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
    }),
    [
      activeChannelId,
      activeScreenShareId,
      audioPreferences,
      cameraError,
      cameraStatus,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isMuted,
      isScreenSharing,
      joinChannel,
      leaveChannel,
      prepareForVoiceJoin,
      screenShareError,
      screenShareQuality,
      serverId,
      setActiveScreenShareId,
      setScreenShareQuality,
      stopCamera,
      stopScreenShare,
      toggleCamera,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
    ],
  );

  const voiceParticipantsValue = useMemo<VoiceParticipantsContextValue>(
    () => ({
      participants,
      screenShares,
    }),
    [participants, screenShares],
  );

  return (
    <VoiceStateContext.Provider value={voiceStateValue}>
      <VoiceParticipantsContext.Provider value={voiceParticipantsValue}>
        {children}
        <VoiceInviteToasts />
      </VoiceParticipantsContext.Provider>
    </VoiceStateContext.Provider>
  );
}

