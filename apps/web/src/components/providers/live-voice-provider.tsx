"use client";

import {
  ConnectionState,
  type AudioProcessorOptions,
  type LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  Room,
  Track,
  type TrackProcessor,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import type { KrispNoiseFilterProcessor } from "@livekit/krisp-noise-filter";
import type * as KrispNoiseFilterModule from "@livekit/krisp-noise-filter";
import { useI18n } from "@/components/providers/locale-provider";
import {
  VoiceParticipantsContext,
  VoiceStateContext,
  type KrispAvailability,
  type VoiceCameraStatus,
  type VoiceParticipantsContextValue,
  type VoiceProviderProps,
  type VoiceStateContextValue,
} from "@/components/providers/voice-context";
import {
  notifyVoiceExit,
  TRANSIENT_VOICE_ERROR_DISMISS_MS,
} from "@/components/providers/voice-provider-shared";
import { VoiceAudioRenderer } from "@/components/voice/voice-audio-renderer";
import { VoiceInviteToasts } from "@/components/voice/voice-invite-toasts";
import {
  WHISPR_DESKTOP_BEFORE_CLOSE_EVENT,
  completeWhisprDesktopBeforeClose,
  getWhisprDesktopBeforeCloseRequestId,
  isWhisprDesktopRuntime,
} from "@/lib/desktop/runtime";
import { logError } from "@/lib/logger";
import { getSocket } from "@/lib/socket/client";
import { collectVoiceAudioHealthFromSender } from "@/lib/voice/audio-health";
import {
  isCameraDeviceUnavailable,
  isCameraPermissionDenied,
  isLikelyKrispSecurityPolicyError,
  isMicrophoneConstraintError,
  isMicrophoneDeviceUnavailable,
  isMicrophonePermissionDenied,
  isScreenSharePermissionDenied,
} from "@/lib/voice/error-classification";
import {
  buildAudioCaptureOptions,
  buildCameraCaptureOptions,
  getAudioCaptureRestartSignature,
  getMicrophonePermissionState,
  isCameraSupported,
  isLiveKitCloudUrl,
  isScreenShareSupported,
  supportsMediaConstraint,
} from "@/lib/voice/media-capabilities";
import {
  applyRemoteAudioState,
  applyScreenShareQualityToTrack,
  getLocalCameraTrack,
  getLocalMicrophoneTrack,
  getLocalScreenShareTrack,
  isLocalCameraTrackLive,
  isLocalMicrophoneTrackLive,
  isLocalScreenShareTrackLive,
  runNonFatalVoiceJoinStep,
  stopLocalTracks,
} from "@/lib/voice/livekit-track-helpers";
import { createVoicePageExitHandler } from "@/lib/voice/page-exit";
import {
  collectScreenShares,
  countActiveScreenShares,
  type VoiceScreenShareViewModel,
} from "@/lib/voice/participant-mapping";
import {
  collectVoiceParticipants,
  type VoiceParticipantViewModel,
} from "@/lib/voice/participant-view-model";
import {
  getVoicePerformanceErrorMetadata,
  getVoicePerformanceDurationMs,
  getVoicePerformanceNow,
  measureVoicePerformance,
  recordVoicePerformanceMetric,
} from "@/lib/voice/performance";
import {
  getAudioCaptureProcessingProfile,
  getBrowserNoiseFilterEnabled,
  getKrispNoiseFilterTier,
  isKrispNoiseFilterTier,
  resolveNoiseFilterTier,
  shouldUseEnhancedNoiseFilterCapture,
  shouldUseKrispNoiseFilter,
  type AudioCaptureProcessingProfile,
  type KrispProcessorQuality,
  type NoiseFilterTier,
} from "@/lib/voice/noise-filter";
import {
  getFallbackKrispQuality,
  getPreferredKrispQuality,
  shouldPrewarmKrispProcessor,
} from "@/lib/voice/krisp-quality";
import {
  deleteVoiceState,
  fetchLiveKitToken,
  sendVoiceHeartbeat,
  upsertVoiceState,
  voiceQueryKeys,
} from "@/lib/voice/client";
import {
  connectLiveKitRoomWithRetry,
  createReconnectTimeoutController,
  registerRoomParticipantSyncListeners,
  type ReconnectTimeoutController,
} from "@/lib/voice/provider-lifecycle";
import {
  mapVoiceScreenShareStateCache,
  mapVoiceStateCache,
  removeVoiceStateParticipantFromCache,
} from "@/lib/voice/state-cache";
import { VOICE_HEARTBEAT_INTERVAL_MS, type VoiceChannelStateDTO } from "@/lib/voice/types";
import { useVoiceAudioLevels, type RemoteVoiceAudioLevel } from "@/lib/voice/use-voice-audio-levels";
import { useVoiceHeartbeat } from "@/lib/voice/use-voice-heartbeat";
import {
  getScreenShareCaptureOptions,
  getScreenSharePublishOptions,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";
import {
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_PARTICIPANT_VOLUME,
  type VoiceAudioPreferences,
  useVoiceStore,
} from "@/store/voice-store";
const NEXT_PUBLIC_LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
const RECONNECT_TIMEOUT_MS = 30_000;
const MICROPHONE_HEALTH_CHECK_INTERVAL_MS = 2_500;
const VOICE_AUDIO_HEALTH_METRICS_INTERVAL_MS = 30_000;
const KRISP_PROCESSOR_NAME = "livekit-noise-filter";
const KRISP_BUFFER_DROP_MS = 300;
const KRISP_BUFFER_OVERFLOW_MS = 200;

let krispModulePromise: Promise<typeof KrispNoiseFilterModule> | null = null;

function loadKrispModule() {
  krispModulePromise ??= import("@livekit/krisp-noise-filter").catch((error) => {
    krispModulePromise = null;
    throw error;
  });

  return krispModulePromise;
}

export function LiveVoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isDesktopRuntime = useMemo(isWhisprDesktopRuntime, []);
  const preferredKrispQuality = useMemo(getPreferredKrispQuality, []);
  const fallbackKrispQuality = useMemo(
    () => getFallbackKrispQuality(preferredKrispQuality),
    [preferredKrispQuality],
  );
  const roomRef = useRef<Room | null>(null);
  const joinRequestRef = useRef<string | null>(null);
  const preparedMicrophoneAccessRef = useRef<boolean | null>(null);
  const appliedAudioPreferencesSignatureRef = useRef<string | null>(null);
  const microphoneRecoveryPromiseRef = useRef<{
    promise: Promise<boolean>;
    room: Room;
  } | null>(null);
  const microphoneRecoveryRunnerRef = useRef<((targetRoom: Room) => Promise<boolean>) | null>(
    null,
  );
  const microphoneIntentionalMuteRef = useRef(false);
  const remoteAudioLevelsRef = useRef(new Map<string, RemoteVoiceAudioLevel>());
  const reconnectTimeoutControllerRef = useRef<ReconnectTimeoutController | null>(null);
  reconnectTimeoutControllerRef.current ??= createReconnectTimeoutController<
    ReturnType<typeof setTimeout>
  >({
    clearTimeout,
    setTimeout,
  });
  const krispProcessorRef = useRef<KrispNoiseFilterProcessor | null>(null);
  const krispProcessorQualityRef = useRef<KrispProcessorQuality | null>(null);
  const lastEmittedScreenShareStateRef = useRef<boolean | null>(null);
  const connectionWarningMessageRef = useRef<string | null>(null);
  const cleanupVoiceResourcesRef = useRef<() => void>(() => undefined);
  const leaveCleanupPromiseRef = useRef<Promise<void> | null>(null);
  const microphoneSettingsFailedMessageRef = useRef(t("voice.errors.microphoneSettingsFailed"));
  const supportsLiveKitCloudNoiseCancellationRef = useRef(
    isLiveKitCloudUrl(NEXT_PUBLIC_LIVEKIT_URL),
  );
  const [room, setRoom] = useState<Room | null>(null);
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
  const [isApplyingAudioPreferences, setIsApplyingAudioPreferences] = useState(false);
  const [isApplyingScreenShareQuality, setIsApplyingScreenShareQuality] = useState(false);
  const [isKrispNoiseCancellationActive, setIsKrispNoiseCancellationActive] = useState(false);
  const [activeKrispQuality, setActiveKrispQuality] =
    useState<KrispProcessorQuality | null>(null);
  const [isVoiceIsolationSupported, setIsVoiceIsolationSupported] = useState(false);
  const [isRecoveringKrispNoiseCancellation, setIsRecoveringKrispNoiseCancellation] =
    useState(false);

  const setTransientErrorMessage = useCallback((message: string) => {
    setErrorMessage(message);
    window.setTimeout(() => {
      setErrorMessage((current) => (current === message ? null : current));
    }, TRANSIENT_VOICE_ERROR_DISMISS_MS);
  }, []);

  useEffect(() => {
    microphoneSettingsFailedMessageRef.current = t("voice.errors.microphoneSettingsFailed");
  }, [t]);
  const [krispAvailability, setKrispAvailability] = useState<KrispAvailability>(
    supportsLiveKitCloudNoiseCancellationRef.current ? "checking" : "requires_livekit_cloud",
  );

  const {
    activeChannelId,
    audioPreferences,
    cameraPreferences,
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
      cameraPreferences: state.cameraPreferences,
      isDeafened: state.isDeafened,
      isMuted: state.isMuted,
      isScreenSharing: state.isScreenSharing,
      participantVolumes: state.participantVolumes,
      screenShareError: state.screenShareError,
      screenShareQuality: state.screenShareQuality,
      serverId: state.serverId,
    })),
  );

  const resolveNoiseFilterTierForPreferences = useCallback(
    (
      preferences: VoiceAudioPreferences,
      overrides: {
        isKrispNoiseCancellationActive?: boolean;
        krispQuality?: KrispProcessorQuality | null;
      } = {},
    ) =>
      resolveNoiseFilterTier({
        browserNoiseFilterEnabled: getBrowserNoiseFilterEnabled(
          preferences,
          isVoiceIsolationSupported,
        ),
        isKrispNoiseCancellationActive:
          overrides.isKrispNoiseCancellationActive ?? isKrispNoiseCancellationActive,
        krispQuality:
          overrides.krispQuality === undefined ? activeKrispQuality : overrides.krispQuality,
      }),
    [activeKrispQuality, isKrispNoiseCancellationActive, isVoiceIsolationSupported],
  );

  const activeNoiseFilterTier = useMemo(
    () => resolveNoiseFilterTierForPreferences(audioPreferences),
    [audioPreferences, resolveNoiseFilterTierForPreferences],
  );

  const getAudioCaptureConfig = useCallback(
    (
      preferences: VoiceAudioPreferences,
      options: { forceNativeProcessing?: boolean } = {},
    ): {
      enhancedNoiseFilterActive: boolean;
      processingProfile: AudioCaptureProcessingProfile;
    } => {
      const liveKitCloudNoiseFilterAvailable =
        !options.forceNativeProcessing &&
        supportsLiveKitCloudNoiseCancellationRef.current &&
        krispAvailability === "available";
      const processingProfile = getAudioCaptureProcessingProfile(
        preferences,
        liveKitCloudNoiseFilterAvailable,
        isVoiceIsolationSupported,
      );

      return {
        enhancedNoiseFilterActive:
          processingProfile === "enhanced" &&
          shouldUseEnhancedNoiseFilterCapture(
            preferences,
            liveKitCloudNoiseFilterAvailable,
            isVoiceIsolationSupported,
          ),
        processingProfile,
      };
    },
    [isVoiceIsolationSupported, krispAvailability],
  );

  const recordNoiseFilterTierResolved = useCallback((tier: NoiseFilterTier) => {
    recordVoicePerformanceMetric({
      durationMs: 0,
      operation: "noise_filter_tier_resolved",
      result: "success",
      runtime: "client",
      tier,
    });
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

  useEffect(() => {
    if (!room || !isKrispNoiseFilterTier(activeNoiseFilterTier)) {
      return;
    }

    let cancelled = false;

    const recordAudioHealth = async () => {
      const localMicrophoneTrack = getLocalMicrophoneTrack(roomRef.current);

      if (!isLocalMicrophoneTrackLive(localMicrophoneTrack) || !localMicrophoneTrack.sender) {
        return;
      }

      try {
        const metric = await collectVoiceAudioHealthFromSender(localMicrophoneTrack.sender);
        if (cancelled || !metric) {
          return;
        }

        recordVoicePerformanceMetric({
          ...metric,
          durationMs: 0,
          operation: "krisp_audio_health",
          result: "success",
          runtime: "client",
          tier: activeNoiseFilterTier,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        recordVoicePerformanceMetric({
          ...getVoicePerformanceErrorMetadata(error),
          durationMs: 0,
          operation: "krisp_audio_health",
          result: "error",
          runtime: "client",
          tier: activeNoiseFilterTier,
        });
      }
    };

    const interval = window.setInterval(() => {
      void recordAudioHealth();
    }, VOICE_AUDIO_HEALTH_METRICS_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeNoiseFilterTier, room]);

  useEffect(() => {
    setIsVoiceIsolationSupported(supportsMediaConstraint("voiceIsolation"));
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    reconnectTimeoutControllerRef.current?.clear();
  }, []);

  const setConnectionWarning = useCallback((message: string) => {
    const previousWarning = connectionWarningMessageRef.current;
    connectionWarningMessageRef.current = message;
    setErrorMessage((current) => (!current || current === previousWarning ? message : current));
  }, []);

  const clearConnectionWarning = useCallback(() => {
    const previousWarning = connectionWarningMessageRef.current;
    connectionWarningMessageRef.current = null;
    if (!previousWarning) {
      return;
    }

    setErrorMessage((current) => (current === previousWarning ? null : current));
  }, []);

  const getVoiceAudioLevelState = useCallback(() => {
    const store = useVoiceStore.getState();
    return {
      activeChannelId: store.activeChannelId,
      serverId: store.serverId,
    };
  }, []);

  useVoiceAudioLevels({
    currentUserId: currentUser.id,
    getVoiceState: getVoiceAudioLevelState,
    remoteAudioLevelsRef,
    room,
    setParticipants,
  });

  const getParticipantVolume = useCallback(
    (userId: string) => participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME,
    [participantVolumes],
  );

  const requestMicrophonePermission = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    const permissionState = await getMicrophonePermissionState();
    if (permissionState === "denied") {
      return false;
    }

    return true;
  }, []);

  const prepareForVoiceJoin = useCallback(async () => {
    try {
      const granted = await requestMicrophonePermission();
      preparedMicrophoneAccessRef.current = granted;
      return granted;
    } catch (error) {
      if (isMicrophonePermissionDenied(error)) {
        preparedMicrophoneAccessRef.current = false;
        return false;
      }

      preparedMicrophoneAccessRef.current = null;
      throw error;
    }
  }, [requestMicrophonePermission]);

  const syncParticipants = useCallback(
    (targetRoom: Room | null = roomRef.current) => {
      if (!targetRoom) {
        setParticipants([]);
        return;
      }

      const nextParticipants = collectVoiceParticipants(targetRoom, currentUser);

      setParticipants(nextParticipants);
      setCameraStatus((current) => {
        if (current === "starting" || current === "stopping") {
          return current;
        }

        if (isLocalCameraTrackLive(getLocalCameraTrack(targetRoom))) {
          return "enabled";
        }

        return current === "permission-denied" ||
          current === "device-unavailable" ||
          current === "error"
          ? current
          : "disabled";
      });
    },
    [currentUser],
  );

  const emitVoiceScreenShareState = useCallback(
    (
      targetChannelId: string | null,
      targetServerId: string | null,
      isSharing: boolean,
      options: { force?: boolean } = {},
    ) => {
      if (!targetChannelId || !targetServerId) {
        return;
      }

      if (!options.force && lastEmittedScreenShareStateRef.current === isSharing) {
        return;
      }

      lastEmittedScreenShareStateRef.current = isSharing;
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) =>
          mapVoiceScreenShareStateCache(current, targetChannelId, currentUser.id, isSharing),
      );

      const socket = getSocket();
      socket.emit("voice:screenshare:update", {
        channelId: targetChannelId,
        isScreenSharing: isSharing,
        serverId: targetServerId,
      });
    },
    [currentUser.id, queryClient],
  );

  const syncScreenShares = useCallback(
    (targetRoom: Room | null = roomRef.current) => {
      if (!targetRoom) {
        setScreenShares([]);
        setActiveScreenShareIdState(null);
        useVoiceStore.getState().clearScreenShareState();
        emitVoiceScreenShareState(
          useVoiceStore.getState().activeChannelId,
          useVoiceStore.getState().serverId,
          false,
        );
        return;
      }

      const nextScreenShares = collectScreenShares(targetRoom, currentUser);
      setScreenShares(nextScreenShares);
      setActiveScreenShareIdState((current) => {
        if (current && nextScreenShares.some((share) => share.id === current)) {
          return current;
        }

        return nextScreenShares[0]?.id ?? null;
      });

      const localShare = nextScreenShares.find((share) => share.isLocal) ?? null;
      if (localShare) {
        useVoiceStore.getState().setScreenShareState({
          activeSharerId: localShare.id,
          channelId: useVoiceStore.getState().activeChannelId,
          conversationId: null,
          isSharing: true,
          mode: "voice",
        });
        emitVoiceScreenShareState(
          useVoiceStore.getState().activeChannelId,
          useVoiceStore.getState().serverId,
          true,
        );
        return;
      }

      const store = useVoiceStore.getState();
      if (store.screenShareMode === "voice") {
        store.clearScreenShareState();
      }
      emitVoiceScreenShareState(store.activeChannelId, store.serverId, false);
    },
    [currentUser, emitVoiceScreenShareState],
  );

  useEffect(() => {
    const activeRoom = room;
    if (!activeRoom) {
      return;
    }

    const metadata = JSON.stringify({
      avatarUrl: currentUser.avatarUrl ?? null,
      displayName: currentUser.displayName,
      username: currentUser.username,
    });
    const name = currentUser.displayName || currentUser.username;

    if (activeRoom.localParticipant.metadata !== metadata) {
      void activeRoom.localParticipant.setMetadata(metadata).catch((error) => {
        logError("[voice] Local participant metadata update failed", error);
      });
    }

    if (activeRoom.localParticipant.name !== name) {
      void activeRoom.localParticipant.setName(name).catch((error) => {
        logError("[voice] Local participant name update failed", error);
      });
    }

    syncParticipants(activeRoom);
    syncScreenShares(activeRoom);
  }, [
    currentUser.avatarUrl,
    currentUser.displayName,
    currentUser.username,
    room,
    syncParticipants,
    syncScreenShares,
  ]);

  const updateVoiceStatesCache = useCallback(
    (
      targetServerId: string,
      targetChannelId: string,
      nextParticipants: Array<{
        avatarUrl: string | null;
        displayName: string | null;
        isScreenSharing?: boolean;
        userId: string;
        username: string;
      }>,
    ) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) => mapVoiceStateCache(current, targetChannelId, nextParticipants),
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

  const getLiveHeartbeatPayload = useCallback(() => {
    const activeRoom = roomRef.current;
    const store = useVoiceStore.getState();

    return {
      selfVideo: isLocalCameraTrackLive(getLocalCameraTrack(activeRoom)),
      selfStream: store.isScreenSharing && store.screenShareMode === "voice",
    };
  }, []);
  const emitActiveScreenShareHeartbeat = useCallback(() => {
    const store = useVoiceStore.getState();
    if (store.isScreenSharing && store.screenShareMode === "voice") {
      emitVoiceScreenShareState(store.activeChannelId, store.serverId, true, {
        force: true,
      });
    }
  }, [emitVoiceScreenShareState]);
  const { startHeartbeat, stopHeartbeat } = useVoiceHeartbeat({
    getPayload: getLiveHeartbeatPayload,
    intervalMs: VOICE_HEARTBEAT_INTERVAL_MS,
    onTick: emitActiveScreenShareHeartbeat,
    sendHeartbeat: sendVoiceHeartbeat,
  });

  const ensureKrispSupport = useCallback(async () => {
    if (!supportsLiveKitCloudNoiseCancellationRef.current) {
      setKrispAvailability("requires_livekit_cloud");
      return null;
    }

    try {
      const krispModule = await measureVoicePerformance(
        {
          operation: "krisp_module_load",
          runtime: "client",
        },
        loadKrispModule,
      );

      if (!krispModule.isKrispNoiseFilterSupported()) {
        setKrispAvailability("unsupported_browser");
        return null;
      }

      setKrispAvailability("available");
      return krispModule;
    } catch (error) {
      setKrispAvailability(
        isLikelyKrispSecurityPolicyError(error) ? "blocked_by_security_policy" : "unavailable",
      );
      return null;
    }
  }, []);

  const getOrCreateKrispProcessor = useCallback(async () => {
    const krispModule = await ensureKrispSupport();
    if (!krispModule) {
      return null;
    }

    if (!krispProcessorRef.current) {
      krispProcessorRef.current = krispModule.KrispNoiseFilter({
        bufferDropMs: KRISP_BUFFER_DROP_MS,
        bufferOverflowMs: KRISP_BUFFER_OVERFLOW_MS,
        quality: preferredKrispQuality,
      });
      krispProcessorQualityRef.current = preferredKrispQuality;
    }

    return krispProcessorRef.current;
  }, [ensureKrispSupport, preferredKrispQuality]);

  const resetKrispProcessor = useCallback(async () => {
    if (krispProcessorRef.current) {
      await krispProcessorRef.current.destroy().catch(() => undefined);
      krispProcessorRef.current = null;
    }

    krispProcessorQualityRef.current = null;
    setActiveKrispQuality(null);
    setIsKrispNoiseCancellationActive(false);
  }, []);

  const createFallbackKrispProcessor = useCallback(async () => {
    const krispModule = await ensureKrispSupport();
    if (!krispModule) {
      return null;
    }

    await resetKrispProcessor();
    if (!fallbackKrispQuality) {
      return null;
    }

    krispProcessorRef.current = krispModule.KrispNoiseFilter({
      bufferDropMs: KRISP_BUFFER_DROP_MS,
      bufferOverflowMs: KRISP_BUFFER_OVERFLOW_MS,
      quality: fallbackKrispQuality,
    });
    krispProcessorQualityRef.current = fallbackKrispQuality;

    return krispProcessorRef.current;
  }, [ensureKrispSupport, fallbackKrispQuality, resetKrispProcessor]);

  const detachKrispNoiseCancellation = useCallback(
    async (track: LocalAudioTrack | null = getLocalMicrophoneTrack(roomRef.current)) => {
      const processor = krispProcessorRef.current;

      if (processor) {
        await processor.setEnabled(false).catch(() => undefined);
      }

      if (track?.getProcessor()?.name === KRISP_PROCESSOR_NAME) {
        await track.stopProcessor().catch((error) => {
          logError("[voice] Krisp processor cleanup failed", error);
        });
      }

      krispProcessorRef.current = null;
      krispProcessorQualityRef.current = null;
      setActiveKrispQuality(null);
      setIsKrispNoiseCancellationActive(false);
    },
    [],
  );

  const syncKrispNoiseCancellation = useCallback(
    async (track: LocalAudioTrack, enabled: boolean) => {
      if (!enabled) {
        await detachKrispNoiseCancellation(track);
        return false;
      }

      const enableProcessor = async (
        processor: KrispNoiseFilterProcessor | null,
        quality: KrispProcessorQuality,
      ) => {
        const tier = getKrispNoiseFilterTier(quality);
        if (!processor) {
          setIsKrispNoiseCancellationActive(false);
          setActiveKrispQuality(null);
          recordVoicePerformanceMetric({
            durationMs: 0,
            errorCode: "KRISP_PROCESSOR_UNAVAILABLE",
            operation: "krisp_processor_attach",
            result: "error",
            runtime: "client",
            tier,
          });
          return false;
        }

        const isActive = await measureVoicePerformance(
          {
            operation: "krisp_processor_attach",
            runtime: "client",
            tier,
          },
          async () => {
            const currentProcessor = track.getProcessor();
            if (
              currentProcessor?.name === KRISP_PROCESSOR_NAME &&
              currentProcessor !== processor
            ) {
              await track.stopProcessor().catch(() => undefined);
            }

            if (track.getProcessor()?.name !== KRISP_PROCESSOR_NAME) {
              await track.setProcessor(
                processor as unknown as TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>,
              );
            }

            const nextEnabled = await processor.setEnabled(true);
            return nextEnabled ?? processor.isEnabled();
          },
        );
        setIsKrispNoiseCancellationActive(isActive === true);
        setActiveKrispQuality(isActive === true ? quality : null);
        setKrispAvailability("available");
        return isActive === true;
      };

      try {
        const processor = await getOrCreateKrispProcessor();
        return await enableProcessor(processor, preferredKrispQuality);
      } catch (error) {
        if (isLikelyKrispSecurityPolicyError(error)) {
          setKrispAvailability("blocked_by_security_policy");
        }
        logError("[voice] Preferred Krisp quality failed, retrying stable quality", error);
      }

      try {
        const fallbackProcessor = await createFallbackKrispProcessor();
        return await enableProcessor(fallbackProcessor, fallbackKrispQuality ?? preferredKrispQuality);
      } catch (error) {
        // Krisp is an enhancement; keep the published microphone alive and fall back to WebRTC.
        logError("[voice] Krisp noise cancellation failed", error);
        await detachKrispNoiseCancellation(track);
        setKrispAvailability(
          isLikelyKrispSecurityPolicyError(error) ? "blocked_by_security_policy" : "unavailable",
        );
        recordVoicePerformanceMetric({
          ...getVoicePerformanceErrorMetadata(error),
          durationMs: 0,
          operation: "krisp_processor_attach",
          result: "error",
          runtime: "client",
          tier: getKrispNoiseFilterTier(fallbackKrispQuality ?? preferredKrispQuality),
        });
        setIsKrispNoiseCancellationActive(false);
        return false;
      }
    },
    [
      createFallbackKrispProcessor,
      detachKrispNoiseCancellation,
      fallbackKrispQuality,
      getOrCreateKrispProcessor,
      preferredKrispQuality,
    ],
  );

  const syncNoiseFilterForTrack = useCallback(
    async (
      track: LocalAudioTrack,
      preferences: VoiceAudioPreferences,
    ): Promise<{
      isKrispActive: boolean;
      processingProfile: AudioCaptureProcessingProfile;
    }> => {
      const shouldEnableKrisp = shouldUseKrispNoiseFilter(
        preferences,
        supportsLiveKitCloudNoiseCancellationRef.current,
      );
      const isKrispActive = await syncKrispNoiseCancellation(track, shouldEnableKrisp);
      const captureConfig = getAudioCaptureConfig(preferences);

      if (!isKrispActive && captureConfig.enhancedNoiseFilterActive) {
        const nativeCaptureConfig = getAudioCaptureConfig(preferences, {
          forceNativeProcessing: true,
        });
        await track.restartTrack(
          buildAudioCaptureOptions(preferences, {
            enhancedNoiseFilterActive: nativeCaptureConfig.enhancedNoiseFilterActive,
          }),
        );

        return {
          isKrispActive: false,
          processingProfile: nativeCaptureConfig.processingProfile,
        };
      }

      return {
        isKrispActive,
        processingProfile: captureConfig.processingProfile,
      };
    },
    [getAudioCaptureConfig, syncKrispNoiseCancellation],
  );

  const enableLocalMicrophone = useCallback(
    async (targetRoom: Room, preferences: VoiceAudioPreferences) => {
      try {
        const captureConfig = getAudioCaptureConfig(preferences);
        await targetRoom.localParticipant.setMicrophoneEnabled(
          true,
          buildAudioCaptureOptions(preferences, {
            enhancedNoiseFilterActive: captureConfig.enhancedNoiseFilterActive,
          }),
        );

        return {
          preferences,
          processingProfile: captureConfig.processingProfile,
          track: getLocalMicrophoneTrack(targetRoom),
        };
      } catch (error) {
        const shouldRetryWithDefaultDevice =
          preferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID &&
          isMicrophoneDeviceUnavailable(error);

        const shouldRetryWithStableProcessing =
          !shouldRetryWithDefaultDevice &&
          preferences.voiceIsolation &&
          isMicrophoneConstraintError(error);

        if (!shouldRetryWithDefaultDevice && !shouldRetryWithStableProcessing) {
          throw error;
        }

        logError(
          shouldRetryWithDefaultDevice
            ? "[voice] Selected microphone unavailable, retrying system default"
            : "[voice] Advanced microphone processing unavailable, retrying stable profile",
          error,
        );
        const fallbackPreferences = {
          ...preferences,
          inputDeviceId: shouldRetryWithDefaultDevice
            ? DEFAULT_AUDIO_DEVICE_ID
            : preferences.inputDeviceId,
          voiceIsolation: shouldRetryWithStableProcessing ? false : preferences.voiceIsolation,
        };

        if (shouldRetryWithDefaultDevice) {
          useVoiceStore.getState().setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
        }

        if (shouldRetryWithStableProcessing) {
          useVoiceStore.getState().setAudioPreference("voiceIsolation", false);
        }

        const fallbackCaptureConfig = getAudioCaptureConfig(fallbackPreferences);
        await targetRoom.localParticipant.setMicrophoneEnabled(
          true,
          buildAudioCaptureOptions(fallbackPreferences, {
            enhancedNoiseFilterActive: fallbackCaptureConfig.enhancedNoiseFilterActive,
          }),
        );

        return {
          preferences: fallbackPreferences,
          processingProfile: fallbackCaptureConfig.processingProfile,
          track: getLocalMicrophoneTrack(targetRoom),
        };
      }
    },
    [getAudioCaptureConfig],
  );

  const applyAudioPreferencesToRoom = useCallback(
    async (targetRoom: Room | null = roomRef.current) => {
      if (!targetRoom) {
        setIsKrispNoiseCancellationActive(false);
        return;
      }

      if (useVoiceStore.getState().isMuted) {
        appliedAudioPreferencesSignatureRef.current = null;
        setIsKrispNoiseCancellationActive(false);
        return;
      }

      const localMicrophoneTrack = getLocalMicrophoneTrack(targetRoom);
      if (!isLocalMicrophoneTrackLive(localMicrophoneTrack)) {
        setIsKrispNoiseCancellationActive(false);
        await microphoneRecoveryRunnerRef.current?.(targetRoom);
        return;
      }

      let activeCaptureConfig = getAudioCaptureConfig(audioPreferences);
      const nextSignature = getAudioCaptureRestartSignature(
        audioPreferences,
        activeCaptureConfig.processingProfile,
      );
      const shouldRestartCapture = appliedAudioPreferencesSignatureRef.current !== nextSignature;

      setIsApplyingAudioPreferences(true);

      try {
        if (shouldRestartCapture) {
          try {
            await localMicrophoneTrack.restartTrack(
              buildAudioCaptureOptions(audioPreferences, {
                enhancedNoiseFilterActive: activeCaptureConfig.enhancedNoiseFilterActive,
              }),
            );
            appliedAudioPreferencesSignatureRef.current = nextSignature;
          } catch (error) {
            const shouldRetryWithDefaultDevice =
              audioPreferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID &&
              isMicrophoneDeviceUnavailable(error);

            const shouldRetryWithStableProcessing =
              !shouldRetryWithDefaultDevice &&
              audioPreferences.voiceIsolation &&
              isMicrophoneConstraintError(error);

            if (!shouldRetryWithDefaultDevice && !shouldRetryWithStableProcessing) {
              throw error;
            }

            logError(
              shouldRetryWithDefaultDevice
                ? "[voice] Microphone restart failed, retrying system default"
                : "[voice] Advanced microphone restart failed, retrying stable profile",
              error,
            );
            const fallbackPreferences = {
              ...audioPreferences,
              inputDeviceId: shouldRetryWithDefaultDevice
                ? DEFAULT_AUDIO_DEVICE_ID
                : audioPreferences.inputDeviceId,
              voiceIsolation: shouldRetryWithStableProcessing
                ? false
                : audioPreferences.voiceIsolation,
            };

            if (shouldRetryWithDefaultDevice) {
              useVoiceStore.getState().setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
            }

            if (shouldRetryWithStableProcessing) {
              useVoiceStore.getState().setAudioPreference("voiceIsolation", false);
            }

            const fallbackCaptureConfig = getAudioCaptureConfig(fallbackPreferences);
            await localMicrophoneTrack.restartTrack(
              buildAudioCaptureOptions(fallbackPreferences, {
                enhancedNoiseFilterActive: fallbackCaptureConfig.enhancedNoiseFilterActive,
              }),
            );
            appliedAudioPreferencesSignatureRef.current =
              getAudioCaptureRestartSignature(
                fallbackPreferences,
                fallbackCaptureConfig.processingProfile,
              );
            activeCaptureConfig = fallbackCaptureConfig;
          }
        }

        const syncedNoiseFilter = await syncNoiseFilterForTrack(
          localMicrophoneTrack,
          audioPreferences,
        );
        activeCaptureConfig = {
          ...activeCaptureConfig,
          processingProfile: syncedNoiseFilter.processingProfile,
        };
        appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
          audioPreferences,
          activeCaptureConfig.processingProfile,
        );
        syncParticipants(targetRoom);
      } finally {
        setIsApplyingAudioPreferences(false);
      }
    },
    [audioPreferences, getAudioCaptureConfig, syncNoiseFilterForTrack, syncParticipants],
  );

  const ensureLocalMicrophonePublished = useCallback(
    async (targetRoom: Room) => {
      if (useVoiceStore.getState().isMuted || microphoneIntentionalMuteRef.current) {
        return false;
      }

      if (roomRef.current !== targetRoom || targetRoom.state === ConnectionState.Disconnected) {
        return false;
      }

      if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(targetRoom))) {
        return true;
      }

      if (microphoneRecoveryPromiseRef.current?.room === targetRoom) {
        return microphoneRecoveryPromiseRef.current.promise;
      }

      const recovery = (async () => {
        const microphoneDeniedMessage = isDesktopRuntime
          ? t("voice.errors.microphoneDeniedDesktop")
          : t("voice.errors.microphoneDenied");
        const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");

        try {
          const hasMicrophoneAccess = await requestMicrophonePermission();
          if (!hasMicrophoneAccess) {
            useVoiceStore.getState().setMuted(true);
            setIsKrispNoiseCancellationActive(false);
            setErrorMessage(microphoneDeniedMessage);
            syncParticipants(targetRoom);
            return false;
          }

          if (roomRef.current !== targetRoom || targetRoom.state === ConnectionState.Disconnected) {
            return false;
          }

          const {
            preferences,
            processingProfile,
            track: localMicrophoneTrack,
          } = await enableLocalMicrophone(targetRoom, useVoiceStore.getState().audioPreferences);

          if (roomRef.current !== targetRoom) {
            await stopLocalTracks(targetRoom).catch(() => undefined);
            return false;
          }

          let nextProcessingProfile = processingProfile;
          if (localMicrophoneTrack) {
            const syncedNoiseFilter = await syncNoiseFilterForTrack(
              localMicrophoneTrack,
              preferences,
            );
            nextProcessingProfile = syncedNoiseFilter.processingProfile;
          }

          appliedAudioPreferencesSignatureRef.current =
            getAudioCaptureRestartSignature(preferences, nextProcessingProfile);
          useVoiceStore.getState().setMuted(false);
          setErrorMessage(null);
          syncParticipants(targetRoom);
          return true;
        } catch (error) {
          if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(targetRoom))) {
            logError(
              "[voice] Microphone recovery reported an error after track was published",
              error,
            );
            useVoiceStore.getState().setMuted(false);
            setErrorMessage(null);
            syncParticipants(targetRoom);
            return true;
          }

          setIsKrispNoiseCancellationActive(false);
          if (isMicrophonePermissionDenied(error)) {
            useVoiceStore.getState().setMuted(true);
            setErrorMessage(microphoneDeniedMessage);
          } else {
            setErrorMessage(microphoneEnableFailedMessage);
          }
          syncParticipants(targetRoom);
          return false;
        }
      })();

      microphoneRecoveryPromiseRef.current = {
        promise: recovery,
        room: targetRoom,
      };

      try {
        return await recovery;
      } finally {
        if (microphoneRecoveryPromiseRef.current?.promise === recovery) {
          microphoneRecoveryPromiseRef.current = null;
        }
      }
    },
    [
      enableLocalMicrophone,
      isDesktopRuntime,
      requestMicrophonePermission,
      syncNoiseFilterForTrack,
      syncParticipants,
      t,
    ],
  );

  useEffect(() => {
    microphoneRecoveryRunnerRef.current = ensureLocalMicrophonePublished;
    return () => {
      if (microphoneRecoveryRunnerRef.current === ensureLocalMicrophonePublished) {
        microphoneRecoveryRunnerRef.current = null;
      }
    };
  }, [ensureLocalMicrophonePublished]);

  const retryKrispNoiseCancellation = useCallback(async () => {
    setIsRecoveringKrispNoiseCancellation(true);
    setKrispAvailability("checking");

    try {
      await resetKrispProcessor();
      useVoiceStore.getState().setAudioPreference("krispNoiseCancellation", true);

      const activeRoom = roomRef.current;
      let localMicrophoneTrack = getLocalMicrophoneTrack(activeRoom);

      if (
        activeRoom &&
        !useVoiceStore.getState().isMuted &&
        !isLocalMicrophoneTrackLive(localMicrophoneTrack)
      ) {
        const recovered = await ensureLocalMicrophonePublished(activeRoom);
        localMicrophoneTrack = recovered ? getLocalMicrophoneTrack(activeRoom) : null;
      }

      if (
        !activeRoom ||
        !isLocalMicrophoneTrackLive(localMicrophoneTrack) ||
        useVoiceStore.getState().isMuted
      ) {
        const krispModule = await ensureKrispSupport();
        return krispModule !== null;
      }

      const syncedNoiseFilter = await syncNoiseFilterForTrack(
        localMicrophoneTrack,
        useVoiceStore.getState().audioPreferences,
      );
      appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
        useVoiceStore.getState().audioPreferences,
        syncedNoiseFilter.processingProfile,
      );
      syncParticipants(activeRoom);
      return syncedNoiseFilter.isKrispActive;
    } finally {
      setIsRecoveringKrispNoiseCancellation(false);
    }
  }, [
    ensureKrispSupport,
    ensureLocalMicrophonePublished,
    resetKrispProcessor,
    syncNoiseFilterForTrack,
    syncParticipants,
  ]);

  const preloadVoiceProcessing = useCallback(async () => {
    if (
      !shouldUseKrispNoiseFilter(
        useVoiceStore.getState().audioPreferences,
        supportsLiveKitCloudNoiseCancellationRef.current,
      )
    ) {
      if (!supportsLiveKitCloudNoiseCancellationRef.current) {
        setKrispAvailability("requires_livekit_cloud");
        return false;
      }
      return true;
    }

    const krispModule = await ensureKrispSupport();
    if (!krispModule) {
      return false;
    }

    if (shouldPrewarmKrispProcessor()) {
      await getOrCreateKrispProcessor();
    }

    return true;
  }, [ensureKrispSupport, getOrCreateKrispProcessor]);

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

  const stopScreenShare = useCallback(
    async (targetRoom?: Room | null) => {
      const activeRoom = targetRoom ?? roomRef.current;
      if (!activeRoom) {
        useVoiceStore.getState().clearScreenShareState();
        setScreenShares([]);
        setActiveScreenShareIdState(null);
        return;
      }

      const localScreenTracks = activeRoom.localParticipant
        .getTrackPublications()
        .filter((publication) => publication.source === Track.Source.ScreenShare)
        .map((publication) => publication.track)
        .filter((track): track is LocalTrack => track instanceof LocalTrack);

      const unpublishedByLiveKit = await activeRoom.localParticipant
        .setScreenShareEnabled(false)
        .then(() => true)
        .catch(() => false);

      if (!unpublishedByLiveKit) {
        await Promise.all(
          localScreenTracks.map((track) =>
            activeRoom.localParticipant.unpublishTrack(track, true).catch(() => undefined),
          ),
        );
      }

      for (const track of localScreenTracks) {
        track.detach();
      }

      useVoiceStore.getState().clearScreenShareState();
      syncScreenShares(activeRoom);
    },
    [syncScreenShares],
  );

  const setScreenShareQuality = useCallback(
    async (qualityId: ScreenShareQualityId) => {
      useVoiceStore.getState().setScreenShareQuality(qualityId);

      const activeRoom = roomRef.current;
      const localScreenShareTrack = getLocalScreenShareTrack(activeRoom);
      if (
        !activeRoom ||
        activeRoom.state === ConnectionState.Disconnected ||
        !localScreenShareTrack ||
        !isLocalScreenShareTrackLive(localScreenShareTrack)
      ) {
        return;
      }

      setIsApplyingScreenShareQuality(true);
      try {
        await applyScreenShareQualityToTrack(localScreenShareTrack, qualityId);
        setErrorMessage(null);
        if (roomRef.current === activeRoom) {
          syncScreenShares(activeRoom);
        }
      } catch {
        const message = t("screenShare.errors.qualityFailed");
        useVoiceStore.getState().setScreenShareError(message);
        setTransientErrorMessage(message);
      } finally {
        setIsApplyingScreenShareQuality(false);
      }
    },
    [setTransientErrorMessage, syncScreenShares, t],
  );

  const stopCamera = useCallback(
    async (targetRoom?: Room | null, options: { clearError?: boolean } = {}) => {
      const activeRoom = targetRoom ?? roomRef.current;
      setCameraStatus("stopping");

      if (!activeRoom) {
        setCameraStatus("disabled");
        if (options.clearError !== false) {
          setCameraError(null);
        }
        return;
      }

      const localCameraTracks = activeRoom.localParticipant
        .getTrackPublications()
        .filter((publication) => publication.source === Track.Source.Camera)
        .map((publication) => publication.track)
        .filter((track): track is LocalVideoTrack => track instanceof LocalVideoTrack);

      const unpublishedByLiveKit = await activeRoom.localParticipant
        .setCameraEnabled(false)
        .then(() => true)
        .catch(() => false);

      if (!unpublishedByLiveKit) {
        await Promise.all(
          localCameraTracks.map((track) =>
            activeRoom.localParticipant.unpublishTrack(track, true).catch(() => undefined),
          ),
        );
      }

      for (const track of localCameraTracks) {
        track.stop();
        track.detach();
      }

      setCameraStatus("disabled");
      if (options.clearError !== false) {
        setCameraError(null);
      }
      syncParticipants(activeRoom);
    },
    [syncParticipants],
  );

  const toggleCamera = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom || cameraStatus === "starting" || cameraStatus === "stopping") {
      return;
    }

    if (isLocalCameraTrackLive(getLocalCameraTrack(activeRoom))) {
      const sessionId = useVoiceStore.getState().sessionId;
      await stopCamera(activeRoom);
      if (sessionId) {
        void sendVoiceHeartbeat(sessionId, { selfVideo: false }).catch(() => undefined);
      }
      return;
    }

    if (!isCameraSupported()) {
      const message = t("voice.errors.cameraNotSupported");
      setCameraStatus("error");
      setCameraError(message);
      return;
    }

    setCameraStatus("starting");
    setCameraError(null);

    try {
      const publication = await activeRoom.localParticipant.setCameraEnabled(
        true,
        buildCameraCaptureOptions(cameraPreferences),
        { source: Track.Source.Camera },
      );
      const localCameraTrack =
        publication?.track instanceof LocalVideoTrack
          ? publication.track
          : getLocalCameraTrack(activeRoom);

      if (localCameraTrack) {
        localCameraTrack.mediaStreamTrack.addEventListener(
          "ended",
          () => {
            void stopCamera(activeRoom).catch(() => undefined);
          },
          { once: true },
        );
      }

      setCameraStatus("enabled");
      setCameraError(null);
      syncParticipants(activeRoom);
      const sessionId = useVoiceStore.getState().sessionId;
      if (sessionId) {
        void sendVoiceHeartbeat(sessionId, { selfVideo: true }).catch(() => undefined);
      }
    } catch (error) {
      await stopCamera(activeRoom, { clearError: false }).catch(() => undefined);

      const status: VoiceCameraStatus = isCameraPermissionDenied(error)
        ? "permission-denied"
        : isCameraDeviceUnavailable(error)
          ? "device-unavailable"
          : "error";
      const message =
        status === "permission-denied"
          ? isDesktopRuntime
            ? t("voice.errors.cameraDeniedDesktop")
            : t("voice.errors.cameraDenied")
          : status === "device-unavailable"
            ? t("voice.errors.cameraUnavailable")
            : t("voice.errors.cameraStartFailed");

      setCameraStatus(status);
      setCameraError(message);
      syncParticipants(activeRoom);
    }
  }, [cameraPreferences, cameraStatus, isDesktopRuntime, stopCamera, syncParticipants, t]);

  const toggleScreenShare = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    if (useVoiceStore.getState().isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (!isScreenShareSupported()) {
      const message = isDesktopRuntime
        ? t("screenShare.errors.notSupportedDesktop")
        : t("screenShare.errors.notSupported");
      useVoiceStore.getState().setScreenShareError(message);
      setTransientErrorMessage(message);
      return;
    }

    if (countActiveScreenShares(activeRoom) >= 2) {
      const message = t("screenShare.errors.maxReached");
      useVoiceStore.getState().setScreenShareError(message);
      setTransientErrorMessage(message);
      return;
    }

    try {
      const currentQuality = useVoiceStore.getState().screenShareQuality;
      const publication = await activeRoom.localParticipant.setScreenShareEnabled(
        true,
        getScreenShareCaptureOptions(currentQuality),
        getScreenSharePublishOptions(currentQuality),
      );
      const localScreenTrack = publication?.track;

      if (localScreenTrack instanceof LocalVideoTrack) {
        localScreenTrack.mediaStreamTrack.addEventListener(
          "ended",
          () => {
            void stopScreenShare();
          },
          { once: true },
        );
      }

      setErrorMessage(null);
      syncScreenShares(activeRoom);
    } catch (error) {
      const message = isScreenSharePermissionDenied(error)
        ? isDesktopRuntime
          ? t("screenShare.errors.permissionDeniedDesktop")
          : t("screenShare.errors.permissionDenied")
        : error instanceof Error
          ? error.message
          : t("screenShare.errors.startFailed");

      useVoiceStore.getState().setScreenShareError(message);
      setTransientErrorMessage(message);
      await stopScreenShare(activeRoom).catch(() => undefined);
    }
  }, [isDesktopRuntime, setTransientErrorMessage, stopScreenShare, syncScreenShares, t]);

  const leaveChannel = useCallback(async () => {
    stopHeartbeat();
    clearReconnectTimeout();
    joinRequestRef.current = null;

    const activeSession = useVoiceStore.getState().sessionId;
    const activeServer = useVoiceStore.getState().serverId;
    const activeChannel = useVoiceStore.getState().activeChannelId;
    const activeRoom = roomRef.current;

    if (!activeSession && !activeRoom && leaveCleanupPromiseRef.current) {
      return leaveCleanupPromiseRef.current;
    }

    if (activeServer && activeChannel) {
      getSocket().emit("voice:leave", {
        channelId: activeChannel,
        serverId: activeServer,
      });
    }
    remoteAudioLevelsRef.current.clear();

    roomRef.current = null;
    appliedAudioPreferencesSignatureRef.current = null;
    microphoneRecoveryPromiseRef.current = null;
    microphoneIntentionalMuteRef.current = false;
    lastEmittedScreenShareStateRef.current = null;
    setRoom(null);
    setParticipants([]);
    setScreenShares([]);
    setActiveScreenShareIdState(null);
    setCameraStatus("disabled");
    setCameraError(null);
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage(null);

    useVoiceStore.getState().leave();

    if (activeServer && activeChannel) {
      removeVoiceStateParticipant(activeServer, activeChannel, currentUser.id);
    }

    if (activeRoom) {
      activeRoom.removeAllListeners();
    }

    const leaveCleanupStartedAt = getVoicePerformanceNow();
    const cleanupPromise = (async () => {
      if (activeRoom) {
        await stopScreenShare(activeRoom).catch((error) => {
          logError("[voice] Screen share cleanup failed after leave", error);
        });
        await stopCamera(activeRoom).catch((error) => {
          logError("[voice] Camera cleanup failed after leave", error);
        });
        await stopLocalTracks(activeRoom).catch((error) => {
          logError("[voice] Local track cleanup failed after leave", error);
        });
        await activeRoom.disconnect(true).catch((error) => {
          logError("[voice] Room disconnect failed after leave", error);
        });
      }

      if (activeSession) {
        await measureVoicePerformance(
          {
            operation: "voice_state_delete",
            runtime: "client",
          },
          () => deleteVoiceState({ sessionId: activeSession }),
        ).catch((error) => {
          logError("[voice] Voice state cleanup failed after leave", error);
        });
      }

      await resetKrispProcessor().catch((error) => {
        logError("[voice] Krisp cleanup failed after leave", error);
      });
      recordVoicePerformanceMetric({
        durationMs: getVoicePerformanceDurationMs(leaveCleanupStartedAt),
        operation: "voice_leave_cleanup_total",
        result: "success",
        runtime: "client",
      });
    })().catch((error) => {
      recordVoicePerformanceMetric({
        durationMs: getVoicePerformanceDurationMs(leaveCleanupStartedAt),
        operation: "voice_leave_cleanup_total",
        result: "error",
        runtime: "client",
      });
      logError("[voice] Leave cleanup failed after leave", error);
    });
    leaveCleanupPromiseRef.current = cleanupPromise;
    void cleanupPromise.finally(() => {
      if (leaveCleanupPromiseRef.current === cleanupPromise) {
        leaveCleanupPromiseRef.current = null;
      }
    });

    return cleanupPromise;
  }, [
    clearReconnectTimeout,
    currentUser.id,
    removeVoiceStateParticipant,
    resetKrispProcessor,
    stopHeartbeat,
    stopCamera,
    stopScreenShare,
  ]);

  const joinChannel = useCallback(
    async ({ channelId, serverId: nextServerId }: { channelId: string; serverId: string }) => {
      if (leaveCleanupPromiseRef.current) {
        await leaveCleanupPromiseRef.current;
      }

      const currentState = useVoiceStore.getState();
      const nextJoinKey = `${nextServerId}:${channelId}`;
      const microphoneDeniedMessage = isDesktopRuntime
        ? t("voice.errors.microphoneDeniedDesktop")
        : t("voice.errors.microphoneDenied");
      const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");
      const shouldStartMuted = currentState.isMuted;
      const shouldStartDeafened = currentState.isDeafened;

      const activeRoom = roomRef.current;
      const isAlreadyJoiningTarget = joinRequestRef.current === nextJoinKey;
      const isAlreadyInTarget =
        currentState.activeChannelId === channelId &&
        currentState.serverId === nextServerId &&
        activeRoom &&
        activeRoom.state !== ConnectionState.Disconnected;
      if (isAlreadyJoiningTarget || isAlreadyInTarget) {
        return;
      }

      const hasExistingVoiceSession =
        Boolean(joinRequestRef.current) ||
        Boolean(activeRoom) ||
        Boolean(currentState.activeChannelId) ||
        Boolean(currentState.sessionId);
      if (hasExistingVoiceSession) {
        await leaveChannel();
      }

      joinRequestRef.current = nextJoinKey;

      let hasMicrophoneAccess = shouldStartMuted;
      const preparedMicrophoneAccess = preparedMicrophoneAccessRef.current;
      preparedMicrophoneAccessRef.current = null;

      if (shouldStartMuted) {
        hasMicrophoneAccess = true;
      } else if (preparedMicrophoneAccess !== null) {
        hasMicrophoneAccess = preparedMicrophoneAccess;
      } else {
        try {
          hasMicrophoneAccess = await requestMicrophonePermission();
        } catch (error) {
          if (isMicrophonePermissionDenied(error)) {
            hasMicrophoneAccess = false;
          } else {
            if (joinRequestRef.current === nextJoinKey) {
              joinRequestRef.current = null;
            }
            throw error;
          }
        }
      }

      if (joinRequestRef.current !== nextJoinKey) {
        return;
      }

      const joinStartedAt = getVoicePerformanceNow();
      let joinResult: "error" | "success" = "error";
      setIsJoining(true);
      setErrorMessage(null);
      setCameraError(null);
      setCameraStatus("disabled");

      const sessionId = crypto.randomUUID();
      let voiceStateCreated = false;
      const initialCaptureConfig = getAudioCaptureConfig(currentState.audioPreferences);
      const nextRoom = new Room({
        audioCaptureDefaults: buildAudioCaptureOptions(currentState.audioPreferences, {
          enhancedNoiseFilterActive: initialCaptureConfig.enhancedNoiseFilterActive,
        }),
      });
      roomRef.current = nextRoom;
      setRoom(nextRoom);

      const syncRoomParticipants = () => {
        try {
          applyRemoteAudioState(
            nextRoom,
            useVoiceStore.getState().isDeafened,
            useVoiceStore.getState().participantVolumes,
            DEFAULT_PARTICIPANT_VOLUME,
          );
          syncParticipants(nextRoom);
          syncScreenShares(nextRoom);
        } catch (error) {
          logError("[voice] Room participant sync failed", error);
        }
      };

      registerRoomParticipantSyncListeners(nextRoom, syncRoomParticipants);
      nextRoom.on("connectionStateChanged", (state) => {
        setConnectionState(state);
        syncRoomParticipants();

        if (
          state === ConnectionState.Reconnecting ||
          state === ConnectionState.SignalReconnecting
        ) {
          clearReconnectTimeout();
          setConnectionWarning(t("voice.errors.connectionUnstable"));
          reconnectTimeoutControllerRef.current?.schedule(() => {
            setConnectionWarning(t("voice.errors.connectionStillReconnecting"));
          }, RECONNECT_TIMEOUT_MS);
          return;
        }

        clearReconnectTimeout();
        if (state === ConnectionState.Connected) {
          clearConnectionWarning();
        }
      });
      nextRoom.on("reconnected", () => {
        clearReconnectTimeout();
        clearConnectionWarning();
        void upsertVoiceState({
          channelId,
          serverId: nextServerId,
          sessionId,
        })
          .then((state) => {
            updateVoiceStatesCache(nextServerId, channelId, state.participants);
          })
          .catch(() => {
            setErrorMessage("Voice state could not be restored.");
          });
        void ensureLocalMicrophonePublished(nextRoom)
          .then((recovered) => {
            if (!recovered) {
              return undefined;
            }

            return applyAudioPreferencesToRoom(nextRoom);
          })
          .catch((error) => {
            if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(nextRoom))) {
              logError("[voice] Post-reconnect microphone sync skipped", error);
              return;
            }
            setErrorMessage(microphoneEnableFailedMessage);
          });
        syncRoomParticipants();
      });
      nextRoom.on("disconnected", () => {
        setConnectionState(ConnectionState.Disconnected);
        if (roomRef.current === nextRoom && useVoiceStore.getState().sessionId) {
          setConnectionWarning(t("voice.errors.connectionFailed"));
        }
      });

      try {
        const tokenResponse = await measureVoicePerformance(
          {
            operation: "livekit_token_fetch",
            runtime: "client",
          },
          () => fetchLiveKitToken({ channelId }),
        );
        supportsLiveKitCloudNoiseCancellationRef.current = isLiveKitCloudUrl(tokenResponse.url);

        if (!supportsLiveKitCloudNoiseCancellationRef.current) {
          setKrispAvailability("requires_livekit_cloud");
        } else if (krispAvailability === "requires_livekit_cloud") {
          setKrispAvailability("checking");
        }

        await measureVoicePerformance(
          {
            operation: "livekit_room_connect",
            runtime: "client",
          },
          () => connectLiveKitRoomWithRetry(nextRoom, tokenResponse.url, tokenResponse.token),
        );
        setConnectionState(nextRoom.state);

        const state = await measureVoicePerformance(
          {
            operation: "voice_state_post",
            runtime: "client",
          },
          () =>
            upsertVoiceState({
              channelId,
              serverId: nextServerId,
              sessionId,
            }),
        );
        voiceStateCreated = true;

        useVoiceStore.getState().join({
          channelId,
          serverId: nextServerId,
          sessionId,
        });
        remoteAudioLevelsRef.current.clear();
        runNonFatalVoiceJoinStep("socket voice join emit", () => {
          getSocket().emit("voice:join", {
            channelId,
            serverId: nextServerId,
          });
        });
        useVoiceStore.getState().setMuted(shouldStartMuted || !hasMicrophoneAccess);
        useVoiceStore.getState().setDeafened(shouldStartDeafened);

        runNonFatalVoiceJoinStep("voice state cache update", () => {
          updateVoiceStatesCache(nextServerId, channelId, state.participants);
        });
        runNonFatalVoiceJoinStep("heartbeat start", () => {
          startHeartbeat(sessionId);
        });
        void nextRoom.startAudio().catch(() => undefined);
        syncRoomParticipants();
        joinResult = "success";

        if (!hasMicrophoneAccess) {
          setIsKrispNoiseCancellationActive(false);
          setActiveKrispQuality(null);
          recordNoiseFilterTierResolved("off");
          setErrorMessage(microphoneDeniedMessage);
          syncRoomParticipants();
          return;
        }

        if (shouldStartMuted) {
          setIsKrispNoiseCancellationActive(false);
          setActiveKrispQuality(null);
          recordNoiseFilterTierResolved("off");
          setErrorMessage(null);
          syncRoomParticipants();
          return;
        }

        void enableLocalMicrophone(nextRoom, useVoiceStore.getState().audioPreferences)
          .then(async ({ preferences, processingProfile, track: localMicrophoneTrack }) => {
            if (roomRef.current !== nextRoom) {
              await stopLocalTracks(nextRoom).catch(() => undefined);
              return;
            }

            let nextProcessingProfile = processingProfile;
            let resolvedTier: NoiseFilterTier = "off";
            if (localMicrophoneTrack) {
              const syncedNoiseFilter = await syncNoiseFilterForTrack(
                localMicrophoneTrack,
                preferences,
              );
              const isKrispActive = syncedNoiseFilter.isKrispActive;
              nextProcessingProfile = syncedNoiseFilter.processingProfile;
              resolvedTier = resolveNoiseFilterTierForPreferences(preferences, {
                isKrispNoiseCancellationActive: isKrispActive,
                krispQuality: isKrispActive ? krispProcessorQualityRef.current : null,
              });
            }
            recordNoiseFilterTierResolved(resolvedTier);
            appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
              preferences,
              nextProcessingProfile,
            );
            setErrorMessage(null);
            useVoiceStore.getState().setMuted(false);
            syncRoomParticipants();
          })
          .catch((error) => {
            if (roomRef.current !== nextRoom) {
              return;
            }

            if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(nextRoom))) {
              logError(
                "[voice] Microphone enable reported an error after track was published",
                error,
              );
              setErrorMessage(null);
              syncRoomParticipants();
              return;
            }

            setIsKrispNoiseCancellationActive(false);
            setActiveKrispQuality(null);
            recordNoiseFilterTierResolved("off");
            useVoiceStore.getState().setMuted(true);
            setErrorMessage(
              isMicrophonePermissionDenied(error)
                ? microphoneDeniedMessage
                : microphoneEnableFailedMessage,
            );
            syncRoomParticipants();
          });
      } catch (error) {
        const isCurrentJoinAttempt =
          joinRequestRef.current === nextJoinKey || roomRef.current === nextRoom;
        logError("[voice] Channel join failed", error);
        stopHeartbeat();
        clearReconnectTimeout();
        if (roomRef.current === nextRoom) {
          roomRef.current = null;
          setRoom((currentRoom) => (currentRoom === nextRoom ? null : currentRoom));
          setParticipants([]);
          setCameraError(null);
          setCameraStatus("disabled");
          setConnectionState(ConnectionState.Disconnected);
        }
        appliedAudioPreferencesSignatureRef.current = null;
        nextRoom.removeAllListeners();
        await stopLocalTracks(nextRoom).catch(() => undefined);
        await nextRoom.disconnect(true).catch(() => undefined);
        await resetKrispProcessor();
        if (voiceStateCreated) {
          await deleteVoiceState({ sessionId }).catch((deleteError) => {
            logError("[voice] Failed to roll back voice state after join failure", deleteError);
          });
        }
        if (useVoiceStore.getState().sessionId === sessionId) {
          useVoiceStore.getState().leave();
        }
        if (isCurrentJoinAttempt) {
          setErrorMessage(
            isMicrophonePermissionDenied(error)
              ? microphoneDeniedMessage
              : isMicrophoneDeviceUnavailable(error)
                ? microphoneEnableFailedMessage
                : t("voice.errors.connectionFailed"),
          );
          throw error;
        }
      } finally {
        recordVoicePerformanceMetric({
          durationMs: getVoicePerformanceDurationMs(joinStartedAt),
          operation: "voice_join_total",
          result: joinResult,
          runtime: "client",
        });
        if (joinRequestRef.current === nextJoinKey) {
          joinRequestRef.current = null;
        }
        setIsJoining(false);
      }
    },
    [
      applyAudioPreferencesToRoom,
      clearConnectionWarning,
      clearReconnectTimeout,
      enableLocalMicrophone,
      ensureLocalMicrophonePublished,
      getAudioCaptureConfig,
      isDesktopRuntime,
      krispAvailability,
      leaveChannel,
      recordNoiseFilterTierResolved,
      resetKrispProcessor,
      requestMicrophonePermission,
      resolveNoiseFilterTierForPreferences,
      startHeartbeat,
      stopHeartbeat,
      setConnectionWarning,
      syncNoiseFilterForTrack,
      syncParticipants,
      syncScreenShares,
      t,
      updateVoiceStatesCache,
    ],
  );

  const toggleMute = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      useVoiceStore.getState().toggleMute();
      return;
    }

    const nextMuted = !useVoiceStore.getState().isMuted;
    const microphoneDeniedMessage = isDesktopRuntime
      ? t("voice.errors.microphoneDeniedDesktop")
      : t("voice.errors.microphoneDenied");
    const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");

    if (nextMuted) {
      try {
        microphoneIntentionalMuteRef.current = true;
        await activeRoom.localParticipant.setMicrophoneEnabled(false);
      } catch {
        microphoneIntentionalMuteRef.current = false;
        setErrorMessage(microphoneEnableFailedMessage);
        return;
      }
      appliedAudioPreferencesSignatureRef.current = null;
      setIsKrispNoiseCancellationActive(false);
    } else {
      const nextAudioPreferences = useVoiceStore.getState().audioPreferences;

      try {
        await requestMicrophonePermission();
      } catch (error) {
        if (isMicrophonePermissionDenied(error)) {
          setErrorMessage(microphoneDeniedMessage);
          useVoiceStore.getState().setMuted(true);
          syncParticipants(activeRoom);
          return;
        }

        setErrorMessage(microphoneEnableFailedMessage);
        return;
      }

      try {
        const {
          preferences,
          processingProfile,
          track: localMicrophoneTrack,
        } = await enableLocalMicrophone(activeRoom, nextAudioPreferences);
        let nextProcessingProfile = processingProfile;
        if (localMicrophoneTrack) {
          const syncedNoiseFilter = await syncNoiseFilterForTrack(
            localMicrophoneTrack,
            preferences,
          );
          nextProcessingProfile = syncedNoiseFilter.processingProfile;
        }
        appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
          preferences,
          nextProcessingProfile,
        );
        setErrorMessage(null);
      } catch (error) {
        if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(activeRoom))) {
          logError("[voice] Microphone unmute reported an error after track was published", error);
          useVoiceStore.getState().setMuted(false);
          setErrorMessage(null);
          syncParticipants(activeRoom);
          return;
        }

        setIsKrispNoiseCancellationActive(false);
        useVoiceStore.getState().setMuted(true);
        setErrorMessage(
          isMicrophonePermissionDenied(error)
            ? microphoneDeniedMessage
            : microphoneEnableFailedMessage,
        );
        syncParticipants(activeRoom);
        return;
      }
    }

    useVoiceStore.getState().setMuted(nextMuted);
    if (nextMuted) {
      microphoneIntentionalMuteRef.current = false;
    }
    syncParticipants(activeRoom);
  }, [
    isDesktopRuntime,
    enableLocalMicrophone,
    requestMicrophonePermission,
    syncNoiseFilterForTrack,
    syncParticipants,
    t,
  ]);

  const toggleDeafen = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      useVoiceStore.getState().toggleDeafen();
      return;
    }

    const nextDeafened = !useVoiceStore.getState().isDeafened;
    useVoiceStore.getState().setDeafened(nextDeafened);
    applyRemoteAudioState(
      activeRoom,
      nextDeafened,
      useVoiceStore.getState().participantVolumes,
      DEFAULT_PARTICIPANT_VOLUME,
    );
    syncParticipants(activeRoom);
  }, [syncParticipants]);

  useEffect(() => {
    if (!supportsLiveKitCloudNoiseCancellationRef.current) {
      setKrispAvailability("requires_livekit_cloud");
      return;
    }

    let cancelled = false;
    let idleCallbackId: number | null = null;
    let timeoutId: number | null = null;

    const preload = () => {
      void preloadVoiceProcessing().then((loaded) => {
        if (cancelled) {
          return;
        }

        if (!loaded && krispAvailability === "checking") {
          setKrispAvailability("unavailable");
        }
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(preload, { timeout: 3_000 });
    } else {
      timeoutId = window.setTimeout(preload, 1_200);
    }

    return () => {
      cancelled = true;
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [krispAvailability, preloadVoiceProcessing]);

  useEffect(() => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    applyRemoteAudioState(activeRoom, isDeafened, participantVolumes, DEFAULT_PARTICIPANT_VOLUME);
  }, [isDeafened, participantVolumes]);

  useEffect(() => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    void applyAudioPreferencesToRoom(activeRoom).catch((error) => {
      if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(activeRoom))) {
        logError("[voice] Audio preference sync failed while microphone remained live", error);
        return;
      }

      setErrorMessage(microphoneSettingsFailedMessageRef.current);
    });
  }, [applyAudioPreferencesToRoom]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const targetRoom = room;
    const recoverMissingMicrophone = () => {
      if (
        roomRef.current !== targetRoom ||
        targetRoom.state === ConnectionState.Disconnected ||
        useVoiceStore.getState().isMuted ||
        microphoneIntentionalMuteRef.current ||
        isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(targetRoom))
      ) {
        return;
      }

      void ensureLocalMicrophonePublished(targetRoom)
        .then((recovered) => {
          if (!recovered || roomRef.current !== targetRoom) {
            return undefined;
          }

          return applyAudioPreferencesToRoom(targetRoom);
        })
        .catch((error) => {
          if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(targetRoom))) {
            logError("[voice] Microphone health recovery reported after track restored", error);
            return;
          }

          setErrorMessage(microphoneSettingsFailedMessageRef.current);
        });
    };

    const scheduleRecovery = () => {
      window.setTimeout(recoverMissingMicrophone, 250);
    };

    const startupCheck = window.setTimeout(recoverMissingMicrophone, 600);
    const interval = window.setInterval(
      recoverMissingMicrophone,
      MICROPHONE_HEALTH_CHECK_INTERVAL_MS,
    );

    targetRoom.on("localTrackUnpublished", scheduleRecovery);
    targetRoom.on("trackMuted", scheduleRecovery);

    return () => {
      window.clearTimeout(startupCheck);
      window.clearInterval(interval);
      targetRoom.off("localTrackUnpublished", scheduleRecovery);
      targetRoom.off("trackMuted", scheduleRecovery);
    };
  }, [applyAudioPreferencesToRoom, ensureLocalMicrophonePublished, room]);

  const cleanupVoiceResources = useCallback(() => {
    stopHeartbeat();
    clearReconnectTimeout();

    const activeRoom = roomRef.current;
    const voiceState = useVoiceStore.getState();
    if (voiceState.serverId && voiceState.activeChannelId) {
      getSocket().emit("voice:leave", {
        channelId: voiceState.activeChannelId,
        serverId: voiceState.serverId,
      });
    }
    remoteAudioLevelsRef.current.clear();
    microphoneRecoveryPromiseRef.current = null;
    microphoneIntentionalMuteRef.current = false;
    if (activeRoom) {
      activeRoom.removeAllListeners();
      void stopScreenShare(activeRoom).catch(() => undefined);
      void stopCamera(activeRoom).catch(() => undefined);
      void stopLocalTracks(activeRoom).catch(() => undefined);
      void activeRoom.disconnect(true).catch(() => undefined);
    }

    void resetKrispProcessor();
  }, [clearReconnectTimeout, resetKrispProcessor, stopCamera, stopHeartbeat, stopScreenShare]);

  useEffect(() => {
    cleanupVoiceResourcesRef.current = cleanupVoiceResources;
  }, [cleanupVoiceResources]);

  useEffect(() => {
    return () => {
      cleanupVoiceResourcesRef.current();
    };
  }, []);

  useEffect(() => {
    const handlePageExit = createVoicePageExitHandler({
      clearReconnectTimeout,
      emitVoiceScreenShareState,
      getRoom: () => roomRef.current,
      getState: () => useVoiceStore.getState(),
      notifyVoiceExit,
      stopCamera,
      stopHeartbeat,
      stopLocalTracks,
      stopScreenShare,
    });
    const handleBrowserPageExit = () => {
      void handlePageExit();
    };
    const handleDesktopBeforeClose = (event: Event) => {
      const requestId = getWhisprDesktopBeforeCloseRequestId(event);
      if (requestId === null) {
        void handlePageExit();
        return;
      }

      event.preventDefault();
      void handlePageExit().finally(() => {
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
    };
  }, [
    clearReconnectTimeout,
    emitVoiceScreenShareState,
    stopCamera,
    stopHeartbeat,
    stopScreenShare,
  ]);

  const voiceStateValue = useMemo<VoiceStateContextValue>(
    () => ({
      activeChannelId,
      activeNoiseFilterTier,
      audioPreferences,
      cameraError,
      cameraStatus,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isCameraEnabled: cameraStatus === "enabled",
      isApplyingAudioPreferences,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive,
      isRecoveringKrispNoiseCancellation,
      isMuted,
      isScreenSharing,
      krispAvailability,
      resetParticipantVolume: useVoiceStore.getState().resetParticipantVolume,
      room,
      screenShareError,
      screenShareQuality,
      serverId,
      activeScreenShareId,
      setAudioPreference: useVoiceStore.getState().setAudioPreference,
      setActiveScreenShareId,
      setParticipantVolume: useVoiceStore.getState().setParticipantVolume,
      setScreenShareQuality,
      retryKrispNoiseCancellation,
      preloadVoiceProcessing,
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
      activeNoiseFilterTier,
      audioPreferences,
      cameraError,
      cameraStatus,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingAudioPreferences,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive,
      isRecoveringKrispNoiseCancellation,
      isMuted,
      isScreenSharing,
      joinChannel,
      krispAvailability,
      leaveChannel,
      preloadVoiceProcessing,
      prepareForVoiceJoin,
      room,
      retryKrispNoiseCancellation,
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
        <VoiceAudioRenderer outputDeviceId={audioPreferences.outputDeviceId} room={room} />
      </VoiceParticipantsContext.Provider>
    </VoiceStateContext.Provider>
  );
}
