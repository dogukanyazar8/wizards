"use client";

import { ConnectionState, type LocalVideoTrack } from "livekit-client";
import { GAME_CATALOG } from "@wizards/types";
import { resolveGoLiveStream, shouldStopClosedGameShare } from "@/lib/voice/go-live";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  WHISPR_DESKTOP_BEFORE_CLOSE_EVENT,
  completeWhisprDesktopBeforeClose,
  getWhisprDesktopBeforeCloseRequestId,
} from "@/lib/desktop/runtime";
import { recordDesktopPerformanceMetric } from "@/lib/desktop/performance";
import { clearDesktopTransientAuthSession } from "@/lib/desktop/session";
import { getSocket } from "@/lib/socket/client";
import {
  deleteVoiceState,
  sendVoiceHeartbeat,
  upsertVoiceState,
  voiceQueryKeys,
} from "@/lib/voice/client";
import { type ScreenShareQualityId } from "@/lib/voice/screen-share";
import {
  mapVoiceScreenShareStateCache,
  mapVoiceStateCache,
  removeVoiceStateParticipantFromCache,
} from "@/lib/voice/state-cache";
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
  isDeafened: boolean,
  isMuted: boolean,
): VoiceParticipantViewModel[] {
  return participants.map((participant) => {
    const participantCameraEnabled =
      participant.userId === currentUser.id ? isCameraEnabled : false;

    return {
      audioLevel: 0,
      avatarUrl: participant.avatarUrl,
      // The fake room publishes no real track, so there is no publication whose
      // subscribed layer could be tuned.
      cameraPublication: null,
      cameraTrack: participantCameraEnabled ? E2E_CAMERA_TRACK : null,
      displayName: participant.displayName,
      isCameraEnabled: participantCameraEnabled,
      isDeafened: participant.userId === currentUser.id ? isDeafened : false,
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
  const pushToTalkReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushToTalkHoldingRef = useRef(false);
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
    activeConversationId,
    audioPreferences,
    isDeafened,
    isMuted,
    isScreenSharing,
    participantVolumes,
    screenShareAudioEnabled,
    screenShareError,
    screenShareVolume,
    screenShareQuality,
    serverId,
    sessionMode,
  } = useVoiceStore(
    useShallow((state) => ({
      activeChannelId: state.activeChannelId,
      activeConversationId: state.activeConversationId,
      audioPreferences: state.audioPreferences,
      isDeafened: state.isDeafened,
      isMuted: state.isMuted,
      isScreenSharing: state.isScreenSharing,
      participantVolumes: state.participantVolumes,
      screenShareAudioEnabled: state.screenShareAudioEnabled,
      screenShareError: state.screenShareError,
      screenShareVolume: state.screenShareVolume,
      screenShareQuality: state.screenShareQuality,
      serverId: state.serverId,
      sessionMode: state.sessionMode,
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
          useVoiceStore.getState().isDeafened,
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

  const removeVoiceStateParticipant = useCallback(
    (targetServerId: string, targetChannelId: string, userId: string) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) => removeVoiceStateParticipantFromCache(current, targetChannelId, userId),
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
        ...(isSharing && useVoiceStore.getState().screenShareStreamInfo
          ? { stream: useVoiceStore.getState().screenShareStreamInfo! }
          : {}),
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
      removeVoiceStateParticipant(targetServerId, targetChannelId, currentUser.id);
    }

    store.leave();
  }, [currentUser.id, removeVoiceStateParticipant, stopCamera, stopHeartbeat, stopScreenShare]);

  const joinDirectCall = useCallback(
    async ({ conversationId }: { conversationId: string }) => {
      const store = useVoiceStore.getState();

      if (store.activeConversationId === conversationId) {
        return;
      }

      if (store.activeChannelId || store.activeConversationId || store.sessionId) {
        await leaveChannel();
      }

      store.join({
        channelId: null,
        conversationId,
        serverId: null,
        sessionId: crypto.randomUUID(),
        sessionMode: "direct",
      });
      setConnectionState(ConnectionState.Connected);
    },
    [leaveChannel],
  );

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

  const startPushToTalk = useCallback(async () => {
    const store = useVoiceStore.getState();
    if (store.voiceInputMode !== "push-to-talk" || !store.activeChannelId) {
      return;
    }

    if (pushToTalkReleaseTimeoutRef.current) {
      clearTimeout(pushToTalkReleaseTimeoutRef.current);
      pushToTalkReleaseTimeoutRef.current = null;
    }

    if (pushToTalkHoldingRef.current) {
      return;
    }

    if (store.isDeafened) {
      setTransientErrorMessage(t("voice.errors.pushToTalkDeafened"));
      return;
    }

    pushToTalkHoldingRef.current = true;
    if (!store.isMuted) {
      return;
    }

    await toggleMute();
  }, [setTransientErrorMessage, t, toggleMute]);

  const stopPushToTalk = useCallback(async () => {
    const store = useVoiceStore.getState();
    if (store.voiceInputMode !== "push-to-talk" || !pushToTalkHoldingRef.current) {
      return;
    }

    pushToTalkHoldingRef.current = false;
    if (pushToTalkReleaseTimeoutRef.current) {
      clearTimeout(pushToTalkReleaseTimeoutRef.current);
      pushToTalkReleaseTimeoutRef.current = null;
    }

    pushToTalkReleaseTimeoutRef.current = setTimeout(() => {
      pushToTalkReleaseTimeoutRef.current = null;
      if (!pushToTalkHoldingRef.current && !useVoiceStore.getState().isMuted) {
        void toggleMute();
      }
    }, store.pushToTalkHangoverMs);
  }, [toggleMute]);

  const toggleDeafen = useCallback(async () => {
    const nextDeafened = !useVoiceStore.getState().isDeafened;
    useVoiceStore.getState().setDeafened(nextDeafened);
    if (nextDeafened) {
      pushToTalkHoldingRef.current = false;
      if (pushToTalkReleaseTimeoutRef.current) {
        clearTimeout(pushToTalkReleaseTimeoutRef.current);
        pushToTalkReleaseTimeoutRef.current = null;
      }
      useVoiceStore.getState().setMuted(true);
    }
    setParticipants((current) =>
      current.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              audioLevel: nextDeafened ? 0 : participant.audioLevel,
              isDeafened: nextDeafened,
              isMuted: nextDeafened ? true : participant.isMuted,
              isSpeaking: nextDeafened ? false : participant.isSpeaking,
            }
          : participant,
      ),
    );
  }, []);

  useEffect(
    () => () => {
      if (pushToTalkReleaseTimeoutRef.current) {
        clearTimeout(pushToTalkReleaseTimeoutRef.current);
      }
    },
    [],
  );

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
    const game = GAME_CATALOG.find(
      (entry) => entry.id === window.localStorage.getItem("whispr:e2e:detected-game"),
    );
    const stream = resolveGoLiveStream(
      "window",
      game ? { kind: "game", gameId: game.id, label: game.name } : null,
    );
    store.setScreenShareStreamInfo(stream);
    const share: VoiceScreenShareViewModel = {
      stream,
      avatarUrl: currentUser.avatarUrl ?? null,
      displayName: currentUser.displayName,
      id: shareId,
      isLocal: true,
      participantId: currentUser.id,
      publication: null,
      track: E2E_CAMERA_TRACK,
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

  useEffect(() => {
    if (!isScreenSharing) return;
    let missingCount = 0;
    const timer = setInterval(() => {
      missingCount = window.localStorage.getItem("whispr:e2e:detected-game") ? 0 : missingCount + 1;
      if (shouldStopClosedGameShare(useVoiceStore.getState().screenShareStreamInfo, missingCount)) {
        void stopScreenShare();
      }
    }, 2_000);
    return () => clearInterval(timer);
  }, [isScreenSharing, stopScreenShare]);

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

  const switchScreenShareSource = useCallback(async () => {
    const store = useVoiceStore.getState();
    if (!store.isScreenSharing || !store.screenShareAllowSourceSwitch) return;
    if (getE2EFlag(E2E_SCREEN_SHARE_DENIED_KEY)) return;
    setScreenShares((current) =>
      current.map((share) =>
        share.isLocal
          ? {
              ...share,
              trackSid: `${share.trackSid}:switched`,
            }
          : share,
      ),
    );
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

  const participantViews = useMemo(
    () =>
      participants.map((participant) =>
        participant.isLocal
          ? {
              ...participant,
              avatarUrl: currentUser.avatarUrl ?? null,
              displayName: currentUser.displayName,
              username: currentUser.username,
            }
          : participant,
      ),
    [currentUser.avatarUrl, currentUser.displayName, currentUser.username, participants],
  );
  const screenShareViews = useMemo(
    () =>
      screenShares.map((share) =>
        share.isLocal
          ? {
              ...share,
              avatarUrl: currentUser.avatarUrl ?? null,
              displayName: currentUser.displayName,
              username: currentUser.username,
            }
          : share,
      ),
    [currentUser.avatarUrl, currentUser.displayName, currentUser.username, screenShares],
  );

  useEffect(() => {
    const socket = getSocket();

    const handleVoiceStateUpdate = (data: {
      action: "join" | "leave" | "update";
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

      const participant = participantViews.find((entry) => entry.userId === data.userId);
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
            publication: null,
            track: E2E_CAMERA_TRACK,
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
  }, [currentUser.id, participantViews, syncParticipantsFromState]);

  useEffect(() => {
    const runPageExitCleanup = async () => {
      const store = useVoiceStore.getState();
      if (store.isScreenSharing && store.screenShareMode === "voice") {
        emitScreenShareState(store.activeChannelId, store.serverId, false);
      }

      if (store.sessionId) {
        await notifyVoiceExit(store.sessionId).catch(() => undefined);
      }

      store.leave();
    };
    const handleBrowserPageExit = () => {
      void runPageExitCleanup();
    };
    const handleDesktopBeforeClose = (event: Event) => {
      const requestId = getWhisprDesktopBeforeCloseRequestId(event);
      if (requestId === null) {
        void runPageExitCleanup();
        return;
      }

      event.preventDefault();
      const cleanupStartedAt = performance.now();
      const hadVoiceSession = Boolean(useVoiceStore.getState().sessionId);
      void Promise.allSettled([runPageExitCleanup(), clearDesktopTransientAuthSession()])
        .then((results) => {
          const result = results.every((item) => item.status === "fulfilled")
            ? "success"
            : "failure";

          if (hadVoiceSession) {
            recordDesktopPerformanceMetric({
              durationMs: performance.now() - cleanupStartedAt,
              operation: "desktop_voice_leave_timing",
              result,
            });
          }

          recordDesktopPerformanceMetric({
            durationMs: performance.now() - cleanupStartedAt,
            operation: "desktop_close_cleanup",
            result,
          });
        })
        .finally(() => {
          void completeWhisprDesktopBeforeClose(requestId);
        });
    };

    window.addEventListener("beforeunload", handleBrowserPageExit);
    window.addEventListener("pagehide", handleBrowserPageExit);
    window.addEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handleDesktopBeforeClose);
    return () => {
      window.removeEventListener("beforeunload", handleBrowserPageExit);
      window.removeEventListener("pagehide", handleBrowserPageExit);
      window.removeEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handleDesktopBeforeClose);
      stopHeartbeat();
    };
  }, [emitScreenShareState, stopHeartbeat]);

  const voiceStateValue = useMemo<VoiceStateContextValue>(
    () => ({
      goLiveLabel:
        typeof window === "undefined"
          ? null
          : (GAME_CATALOG.find(
              (game) => game.id === window.localStorage.getItem("whispr:e2e:detected-game"),
            )?.name ?? null),
      activeChannelId,
      activeConversationId,
      activeNoiseFilterTier: "browser_native",
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
      screenShareAudioEnabled,
      screenShareError,
      screenShareQuality,
      screenShareVolume,
      serverId,
      activeScreenShareId,
      startPushToTalk,
      stopPushToTalk,
      setAudioPreference: useVoiceStore.getState().setAudioPreference,
      setActiveScreenShareId,
      setParticipantVolume: useVoiceStore.getState().setParticipantVolume,
      setScreenShareAudioEnabled: useVoiceStore.getState().setScreenShareAudioEnabled,
      setScreenShareVolume: useVoiceStore.getState().setScreenShareVolume,
      setScreenShareQuality,
      retryKrispNoiseCancellation: async () => false,
      preloadVoiceProcessing: async () => true,
      prepareForVoiceJoin,
      joinChannel,
      joinDirectCall,
      sessionMode,
      leaveChannel,
      stopCamera,
      stopScreenShare,
      toggleDeafen,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
      screenShareStatus: "idle",
      switchScreenShareSource,
    }),
    [
      activeChannelId,
      activeConversationId,
      joinDirectCall,
      sessionMode,
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
      screenShareAudioEnabled,
      screenShareError,
      screenShareQuality,
      screenShareVolume,
      serverId,
      setActiveScreenShareId,
      setScreenShareQuality,
      startPushToTalk,
      stopPushToTalk,
      stopCamera,
      stopScreenShare,
      toggleCamera,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
      switchScreenShareSource,
    ],
  );

  const voiceParticipantsValue = useMemo<VoiceParticipantsContextValue>(
    () => ({
      participants: participantViews,
      screenShares: screenShareViews,
    }),
    [participantViews, screenShareViews],
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
