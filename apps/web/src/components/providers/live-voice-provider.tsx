"use client";

import { useGoLiveCandidate } from "@/hooks/use-go-live-candidate";
import { resolveGoLiveStream, shouldStopClosedGameShare } from "@/lib/voice/go-live";
import { captureGoLiveTracks } from "@/lib/voice/go-live-capture";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

import {
  createScreenShareModeChangeEvent,
  publishScreenShareHealthEvents,
} from "@/lib/telemetry/screen-share-health-events";

import { useScreenShare4kFlag } from "@/hooks/use-screen-share-4k-flag";
import {
  browserScreenShareEncodingProbe,
  resolveScreenShareCodec,
  isScreenShare4kAllowed,
  type ScreenShareCodecChoice,
} from "@/lib/voice/screen-share-codec";
import {
  getScreenSharePreset,
  resolveCapturedScreenShareResolution,
} from "@/lib/voice/screen-share";
import {
  applyScreenShareModeToTrack,
  applyScreenShareFrameRateToTrack,
  applyScreenShareResolutionToTrack,
} from "@/lib/voice/livekit-track-helpers";
import { useScreenShareHealthSampler } from "@/hooks/use-screen-share-health";
import {
  ConnectionState,
  type AudioProcessorOptions,
  type LocalAudioTrack,
  LocalVideoTrack,
  Room,
  Track,
  type TrackProcessor,
} from "livekit-client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ScreenShareSession } from "@/lib/voice/screen-share-session";
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
import { recordDesktopPerformanceMetric } from "@/lib/desktop/performance";
import { clearDesktopTransientAuthSession } from "@/lib/desktop/session";
import { logError, logWarning } from "@/lib/logger";
import { getSocket } from "@/lib/socket/client";
import { collectVoiceAudioHealthFromSender } from "@/lib/voice/audio-health";
import { resolveAudioDeviceFallback } from "@/lib/voice/audio-device-fallback";
import {
  getMicrophoneConstraintName,
  isCameraDeviceUnavailable,
  isCameraPermissionDenied,
  isLikelyKrispSecurityPolicyError,
  isMicrophoneDeviceUnavailable,
  isMicrophonePermissionDenied,
} from "@/lib/voice/error-classification";
import { resolveMicrophoneCaptureRetry } from "@/lib/voice/microphone-capture-retry";
import { canAttemptMicrophoneCapture } from "@/lib/voice/microphone-permission";
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
  getLocalCameraTrack,
  getLocalMicrophoneTrack,
  getLocalScreenShareTrack,
  isLocalCameraTrackLive,
  isLocalMicrophoneTrackLive,
  isLocalScreenShareTrackLive,
  runNonFatalVoiceJoinStep,
  stopLocalTracks,
  suppressLocalScreenShareAudioPlayback,
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
} from "@/lib/voice/provider-lifecycle";
import {
  mapVoiceScreenShareStateCache,
  mapVoiceStateCache,
  removeVoiceStateParticipantFromCache,
} from "@/lib/voice/state-cache";
import {
  VOICE_HEARTBEAT_INTERVAL_MS,
  type VoiceChannelStateDTO,
  type VoiceStateParticipantDTO,
} from "@/lib/voice/types";
import {
  useVoiceAudioLevels,
  type RemoteVoiceAudioLevel,
} from "@/lib/voice/use-voice-audio-levels";
import { useVoiceHeartbeat } from "@/lib/voice/use-voice-heartbeat";
import {
  getScreenShareCaptureOptions,
  getScreenSharePublishOptions,
  isScreenShareAudioSupported,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";
import {
  applyVoiceAudioBitrate,
  getCameraPublishOptions,
  getCameraRoomDefaults,
} from "@/lib/voice/video-quality";
import { getVoiceRoomSubscriptionOptions } from "@/lib/voice/video-subscription";
import {
  resumeRemoteVideoFromBackground,
  suspendRemoteVideoForBackground,
} from "@/lib/voice/remote-video-background";
import {
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_PARTICIPANT_VOLUME,
  type VoiceAudioPreferences,
  useVoiceStore,
} from "@/store/voice-store";
const NEXT_PUBLIC_LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
const RECONNECT_TIMEOUT_MS = 30_000;
const MICROPHONE_HEALTH_CHECK_INTERVAL_MS = 2_500;
const MICROPHONE_AUTO_RECOVERY_MAX_ATTEMPTS = 3;
const VOICE_AUDIO_HEALTH_METRICS_INTERVAL_MS = 30_000;
const KRISP_PROCESSOR_NAME = "livekit-noise-filter";
const KRISP_BUFFER_DROP_MS = 300;
const KRISP_BUFFER_OVERFLOW_MS = 200;

type PushToTalkPhase = "idle" | "holding" | "release-cushion";

type PushToTalkState = {
  phase: PushToTalkPhase;
  restoreMuted: boolean;
  startedAt: number | null;
};

const IDLE_PUSH_TO_TALK_STATE: PushToTalkState = {
  phase: "idle",
  restoreMuted: true,
  startedAt: null,
};

const subscribeToRuntimeCapability = () => () => {};

let krispModulePromise: Promise<typeof KrispNoiseFilterModule> | null = null;

function loadKrispModule() {
  krispModulePromise ??= import("@livekit/krisp-noise-filter").catch((error) => {
    krispModulePromise = null;
    throw error;
  });

  return krispModulePromise;
}

function requirePublishedMicrophoneTrack(targetRoom: Room) {
  const track = getLocalMicrophoneTrack(targetRoom);

  // LiveKit resolves setMicrophoneEnabled without a track when it deduplicates a concurrent
  // publish attempt that timed out. Treating that as success is what left the room reporting an
  // unmuted microphone while nothing was published.
  if (!isLocalMicrophoneTrackLive(track)) {
    throw new Error("Microphone track was not published");
  }

  return track;
}

export function LiveVoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const goLiveHintSeenRef = useRef(false);
  const queryClient = useQueryClient();
  const isDesktopRuntime = isWhisprDesktopRuntime();
  const preferredKrispQuality = getPreferredKrispQuality();
  const fallbackKrispQuality = getFallbackKrispQuality(preferredKrispQuality);
  const roomRef = useRef<Room | null>(null);
  const screenShare4kEnabled = useScreenShare4kFlag();
  const screenCodecChoices = useRef(new WeakMap<Room, Promise<ScreenShareCodecChoice>>());
  const screenQualityQueue = useRef(Promise.resolve());
  const screenAxes = useVoiceStore(
    useShallow((state) => ({
      resolution: state.screenShareResolution,
      frameRate: state.screenShareFrameRate,
      mode: state.screenShareContentMode,
    })),
  );
  useEffect(() => {
    let cancelled = false;
    if (screenShare4kEnabled) {
      void resolveScreenShareCodec(
        { mode: "motion", width: 3840, height: 2160, frameRate: 60, bitrateKbps: 24000 },
        browserScreenShareEncodingProbe(),
      ).then((choice) => {
        if (!cancelled)
          useVoiceStore
            .getState()
            .setScreenShare4kAllowed(
              isScreenShare4kAllowed(
                screenShare4kEnabled,
                { width: screen.width, height: screen.height, dpr: devicePixelRatio },
                choice.hardware,
              ),
            );
      });
    }
    return () => {
      cancelled = true;
      useVoiceStore.getState().setScreenShare4kAllowed(false);
    };
  }, [screenShare4kEnabled]);
  const cameraRestartQueue = useRef<Promise<void>>(Promise.resolve());
  /** Remote video this client paused while the tab was hidden, and only that. */
  const backgroundSuspendedRemoteVideoSidsRef = useRef<Set<string>>(new Set());
  const joinRequestRef = useRef<string | null>(null);
  const preparedMicrophoneAccessRef = useRef<boolean | null>(null);
  const appliedAudioPreferencesSignatureRef = useRef<string | null>(null);
  const microphoneRecoveryPromiseRef = useRef<{
    promise: Promise<boolean>;
    room: Room;
  } | null>(null);
  const microphoneRecoveryRunnerRef = useRef<((targetRoom: Room) => Promise<boolean>) | null>(null);
  const microphoneIntentionalMuteRef = useRef(false);
  const microphonePublishInFlightRef = useRef(0);
  const microphoneAutoRecoveryAttemptsRef = useRef(0);
  const remoteAudioLevelsRef = useRef(new Map<string, RemoteVoiceAudioLevel>());
  const [reconnectTimeoutController] = useState(() =>
    createReconnectTimeoutController<ReturnType<typeof setTimeout>>({
      clearTimeout,
      setTimeout,
    }),
  );
  const krispProcessorRef = useRef<KrispNoiseFilterProcessor | null>(null);
  const krispProcessorQualityRef = useRef<KrispProcessorQuality | null>(null);
  const lastEmittedScreenShareStateRef = useRef<boolean | null>(null);
  const connectionWarningMessageRef = useRef<string | null>(null);
  const cleanupVoiceResourcesRef = useRef<() => void>(() => undefined);
  const leaveCleanupPromiseRef = useRef<Promise<void> | null>(null);
  const microphoneSettingsFailedMessageRef = useRef(t("voice.errors.microphoneSettingsFailed"));
  const pushToTalkReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushToTalkStateRef = useRef<PushToTalkState>(IDLE_PUSH_TO_TALK_STATE);
  const initialKrispAvailability = isLiveKitCloudUrl(NEXT_PUBLIC_LIVEKIT_URL);
  const supportsLiveKitCloudNoiseCancellationRef = useRef(initialKrispAvailability);
  const [room, setRoom] = useState<Room | null>(null);
  const goLive = useGoLiveCandidate(Boolean(room));
  useEffect(() => {
    if (goLive.candidate?.kind !== "opt-in-required" || goLiveHintSeenRef.current) return;
    goLiveHintSeenRef.current = true;
    try {
      if (window.localStorage.getItem("whispr:go-live:hint-seen") === "true") return;
      window.localStorage.setItem("whispr:go-live:hint-seen", "true");
    } catch {
      /* Storage may be unavailable; keep this session's hint bounded. */
    }
    toast.show({
      message: t("voice.goLive.cta.disabledOptIn"),
      action: {
        label: t("settings.row.w8.title"),
        onAct: () => router.push("/settings/desktop/app?highlight=w8"),
      },
    });
  }, [goLive.candidate, router, t, toast]);
  const [participants, setParticipants] = useState<VoiceParticipantViewModel[]>([]);
  const [activeVoiceRoster, setActiveVoiceRoster] = useState<VoiceStateParticipantDTO[]>([]);
  const [screenShares, setScreenShares] = useState<VoiceScreenShareViewModel[]>([]);
  const [screenShareSession] = useState(() => new ScreenShareSession());
  const screenShareStatus = useSyncExternalStore(
    screenShareSession.subscribe,
    screenShareSession.getSnapshot,
    screenShareSession.getSnapshot,
  );
  useEffect(() => () => screenShareSession.cancel(), [screenShareSession]);
  const [activeScreenShareId, setActiveScreenShareIdState] = useState<string | null>(null);
  useScreenShareHealthSampler(screenShares, activeScreenShareId, room);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<VoiceCameraStatus>("disabled");
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handleAudioOutputError = useCallback(() => {
    setErrorMessage(t("voice.errors.outputDeviceFailed"));
  }, [t]);
  const [isJoining, setIsJoining] = useState(false);
  const [isApplyingAudioPreferences, setIsApplyingAudioPreferences] = useState(false);
  const [isApplyingScreenShareQuality, setIsApplyingScreenShareQuality] = useState(false);
  const [isKrispNoiseCancellationActive, setIsKrispNoiseCancellationActive] = useState(false);
  const [activeKrispQuality, setActiveKrispQuality] = useState<KrispProcessorQuality | null>(null);
  const isVoiceIsolationSupported = useSyncExternalStore(
    subscribeToRuntimeCapability,
    () => supportsMediaConstraint("voiceIsolation"),
    () => false,
  );
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
    initialKrispAvailability ? "checking" : "requires_livekit_cloud",
  );

  const {
    activeChannelId,
    activeConversationId,
    audioPreferences,
    cameraPreferences,
    desktopGlobalShortcutsEnabled,
    isDeafened,
    isMuted,
    isScreenSharing,
    participantVolumes,
    pushToTalkHangoverMs,
    screenShareAudioEnabled,
    screenShareError,
    screenShareQuality,
    screenShareVolume,
    masterOutputVolume,
    serverId,
    sessionMode,
    voiceInputMode,
  } = useVoiceStore(
    useShallow((state) => ({
      activeChannelId: state.activeChannelId,
      activeConversationId: state.activeConversationId,
      audioPreferences: state.audioPreferences,
      cameraPreferences: state.cameraPreferences,
      desktopGlobalShortcutsEnabled: state.desktopGlobalShortcutsEnabled,
      isDeafened: state.isDeafened,
      isMuted: state.isMuted,
      isScreenSharing: state.isScreenSharing,
      participantVolumes: state.participantVolumes,
      pushToTalkHangoverMs: state.pushToTalkHangoverMs,
      screenShareAudioEnabled: state.screenShareAudioEnabled,
      screenShareError: state.screenShareError,
      screenShareVolume: state.screenShareVolume,
      masterOutputVolume: state.masterOutputVolume,
      screenShareQuality: state.screenShareQuality,
      serverId: state.serverId,
      sessionMode: state.sessionMode,
      voiceInputMode: state.voiceInputMode,
    })),
  );
  const pushToTalkEnabled =
    isDesktopRuntime && desktopGlobalShortcutsEnabled && voiceInputMode === "push-to-talk";

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

  const clearReconnectTimeout = useCallback(() => {
    reconnectTimeoutController.clear();
  }, [reconnectTimeoutController]);

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

    return canAttemptMicrophoneCapture(await getMicrophonePermissionState());
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

  /**
   * Keeps a hidden tab from pulling remote video in a direct call, where
   * adaptive stream — and with it livekit's own `pauseVideoInBackground` — is
   * off. Safe to call from the participant-sync hot path: a visible tab exits
   * on the first property read, and a track that subscribes while the tab is
   * hidden is caught on the same pass instead of streaming until the user
   * comes back.
   */
  const enforceHiddenTabRemoteVideo = useCallback(() => {
    if (typeof document === "undefined" || document.visibilityState !== "hidden") {
      return;
    }

    if (useVoiceStore.getState().sessionMode !== "direct") {
      return;
    }

    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    for (const trackSid of suspendRemoteVideoForBackground(activeRoom)) {
      backgroundSuspendedRemoteVideoSidsRef.current.add(trackSid);
    }
  }, []);

  /** Hands back exactly what the hidden-tab rule suspended, and nothing else. */
  const releaseHiddenTabRemoteVideo = useCallback(() => {
    const suspendedTrackSids = backgroundSuspendedRemoteVideoSidsRef.current;
    const activeRoom = roomRef.current;

    if (activeRoom) {
      resumeRemoteVideoFromBackground(activeRoom, suspendedTrackSids);
    }

    suspendedTrackSids.clear();
  }, []);

  const syncParticipants = useCallback(
    (targetRoom: Room | null = roomRef.current) => {
      if (!targetRoom) {
        setParticipants([]);
        return;
      }

      const nextParticipants = collectVoiceParticipants(targetRoom, currentUser, activeVoiceRoster);

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
    [activeVoiceRoster, currentUser],
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
        ...(isSharing && useVoiceStore.getState().screenShareStreamInfo
          ? { stream: useVoiceStore.getState().screenShareStreamInfo! }
          : {}),
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

      const nextScreenShares = collectScreenShares(targetRoom, currentUser, activeVoiceRoster);
      for (const share of nextScreenShares) {
        if (share.isLocal) share.stream = useVoiceStore.getState().screenShareStreamInfo;
      }
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
    [activeVoiceRoster, currentUser, emitVoiceScreenShareState],
  );

  useEffect(() => {
    if (!room) {
      return;
    }

    syncParticipants(room);
    syncScreenShares(room);
  }, [room, syncParticipants, syncScreenShares]);

  const updateVoiceStatesCache = useCallback(
    (
      targetServerId: string,
      targetChannelId: string,
      nextParticipants: Array<{
        avatarUrl: string | null;
        displayName: string | null;
        isDeafened: boolean;
        isScreenSharing?: boolean;
        userId: string;
        username: string;
      }>,
    ) => {
      const voiceStore = useVoiceStore.getState();
      if (
        voiceStore.serverId === targetServerId &&
        voiceStore.activeChannelId === targetChannelId
      ) {
        setActiveVoiceRoster(nextParticipants);
      }

      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(targetServerId),
        (current) => mapVoiceStateCache(current, targetChannelId, nextParticipants),
      );
    },
    [queryClient],
  );

  useEffect(() => {
    const socket = getSocket();
    const handleVoiceStateUpdate = (data: {
      channelId: string;
      participants: VoiceStateParticipantDTO[];
      serverId: string;
    }) => {
      updateVoiceStatesCache(data.serverId, data.channelId, data.participants);
    };

    socket.on("voice:state:update", handleVoiceStateUpdate);
    return () => {
      socket.off("voice:state:update", handleVoiceStateUpdate);
    };
  }, [updateVoiceStatesCache]);

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
      selfDeaf: store.isDeafened,
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
            if (currentProcessor?.name === KRISP_PROCESSOR_NAME && currentProcessor !== processor) {
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
        return await enableProcessor(
          fallbackProcessor,
          fallbackKrispQuality ?? preferredKrispQuality,
        );
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
      microphonePublishInFlightRef.current += 1;

      try {
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
            track: requirePublishedMicrophoneTrack(targetRoom),
          };
        } catch (error) {
          const retry = resolveMicrophoneCaptureRetry(preferences, error);
          if (!retry) {
            throw error;
          }

          logWarning(
            retry.reason === "default-device"
              ? "[voice] Selected microphone unavailable, retrying system default"
              : "[voice] Advanced microphone processing unavailable, retrying stable profile",
            { error, constraint: getMicrophoneConstraintName(error) },
          );

          const fallbackCaptureConfig = getAudioCaptureConfig(retry.preferences);
          await targetRoom.localParticipant.setMicrophoneEnabled(
            true,
            buildAudioCaptureOptions(retry.preferences, {
              enhancedNoiseFilterActive: fallbackCaptureConfig.enhancedNoiseFilterActive,
            }),
          );

          const track = requirePublishedMicrophoneTrack(targetRoom);
          if (
            retry.persistDeviceFallback &&
            useVoiceStore.getState().audioPreferences.inputDeviceId === preferences.inputDeviceId
          ) {
            useVoiceStore.getState().setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
          }
          if (
            retry.persistProcessingFallback &&
            useVoiceStore.getState().audioPreferences.voiceIsolation === preferences.voiceIsolation
          ) {
            useVoiceStore.getState().setAudioPreference("voiceIsolation", false);
          }

          return {
            preferences: retry.preferences,
            processingProfile: fallbackCaptureConfig.processingProfile,
            track,
          };
        }
      } finally {
        microphonePublishInFlightRef.current -= 1;
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

      let activePreferences = audioPreferences;
      let activeCaptureConfig = getAudioCaptureConfig(activePreferences);
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
            const retry = resolveMicrophoneCaptureRetry(audioPreferences, error);
            if (!retry) {
              throw error;
            }

            logWarning(
              retry.reason === "default-device"
                ? "[voice] Microphone restart failed, retrying system default"
                : "[voice] Advanced microphone restart failed, retrying stable profile",
              { error, constraint: getMicrophoneConstraintName(error) },
            );

            const fallbackCaptureConfig = getAudioCaptureConfig(retry.preferences);
            await localMicrophoneTrack.restartTrack(
              buildAudioCaptureOptions(retry.preferences, {
                enhancedNoiseFilterActive: fallbackCaptureConfig.enhancedNoiseFilterActive,
              }),
            );
            if (
              retry.persistDeviceFallback &&
              useVoiceStore.getState().audioPreferences.inputDeviceId ===
                audioPreferences.inputDeviceId
            ) {
              useVoiceStore.getState().setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
            }
            if (
              retry.persistProcessingFallback &&
              useVoiceStore.getState().audioPreferences.voiceIsolation ===
                audioPreferences.voiceIsolation
            ) {
              useVoiceStore.getState().setAudioPreference("voiceIsolation", false);
            }

            appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
              retry.preferences,
              fallbackCaptureConfig.processingProfile,
            );
            activePreferences = retry.preferences;
            activeCaptureConfig = fallbackCaptureConfig;
          }
        }

        const syncedNoiseFilter = await syncNoiseFilterForTrack(
          localMicrophoneTrack,
          activePreferences,
        );
        activeCaptureConfig = {
          ...activeCaptureConfig,
          processingProfile: syncedNoiseFilter.processingProfile,
        };
        appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
          activePreferences,
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

      // Publishing before the signal connection is up throws a non-permission LiveKit error, which
      // surfaces as the generic "microphone could not be enabled" banner.
      if (roomRef.current !== targetRoom || targetRoom.state !== ConnectionState.Connected) {
        return false;
      }

      if (isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(targetRoom))) {
        microphoneAutoRecoveryAttemptsRef.current = 0;
        return true;
      }

      // A publish is already in flight (its permission prompt may still be open); starting a second
      // one only makes LiveKit spin on its 10s pending-publication wait.
      if (microphonePublishInFlightRef.current > 0) {
        return false;
      }

      if (microphoneAutoRecoveryAttemptsRef.current >= MICROPHONE_AUTO_RECOVERY_MAX_ATTEMPTS) {
        return false;
      }

      if (microphoneRecoveryPromiseRef.current?.room === targetRoom) {
        return microphoneRecoveryPromiseRef.current.promise;
      }

      microphoneAutoRecoveryAttemptsRef.current += 1;

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

          if (roomRef.current !== targetRoom || targetRoom.state !== ConnectionState.Connected) {
            return false;
          }

          const { preferences, track: localMicrophoneTrack } = await enableLocalMicrophone(
            targetRoom,
            useVoiceStore.getState().audioPreferences,
          );

          if (roomRef.current !== targetRoom) {
            await stopLocalTracks(targetRoom).catch(() => undefined);
            return false;
          }

          const syncedNoiseFilter = await syncNoiseFilterForTrack(
            localMicrophoneTrack,
            preferences,
          );

          appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
            preferences,
            syncedNoiseFilter.processingProfile,
          );
          microphoneAutoRecoveryAttemptsRef.current = 0;
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
            microphoneAutoRecoveryAttemptsRef.current = 0;
            useVoiceStore.getState().setMuted(false);
            setErrorMessage(null);
            syncParticipants(targetRoom);
            return true;
          }

          logError("[voice] Microphone recovery failed", {
            error,
            constraint: getMicrophoneConstraintName(error),
          });
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

  const reconcileAudioDeviceFallbacks = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputDevices = devices
      .filter((device) => device.kind === "audioinput" && device.deviceId)
      .map((device) => ({ deviceId: device.deviceId, kind: device.kind }));
    const outputDevices = devices
      .filter((device) => device.kind === "audiooutput" && device.deviceId)
      .map((device) => ({ deviceId: device.deviceId, kind: device.kind }));
    const voiceStore = useVoiceStore.getState();
    const inputFallback = resolveAudioDeviceFallback({
      devices: inputDevices,
      preferredDeviceId: voiceStore.audioPreferences.inputDeviceId,
    });
    const outputFallback = resolveAudioDeviceFallback({
      devices: outputDevices,
      preferredDeviceId: voiceStore.audioPreferences.outputDeviceId,
    });

    if (inputFallback.changed) {
      useVoiceStore.getState().setAudioPreference("inputDeviceId", inputFallback.deviceId);
      appliedAudioPreferencesSignatureRef.current = null;
    }

    if (outputFallback.changed) {
      useVoiceStore.getState().setAudioPreference("outputDeviceId", outputFallback.deviceId);
    }

    if (inputFallback.changed || outputFallback.changed) {
      recordDesktopPerformanceMetric({
        operation: "desktop_audio_device_fallback",
        result: "success",
      });
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      void reconcileAudioDeviceFallbacks().catch((error) => {
        logWarning("[voice] Audio device hotplug reconciliation failed", error);
        recordDesktopPerformanceMetric({
          operation: "desktop_audio_device_fallback",
          result: "failure",
        });
      });
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, [reconcileAudioDeviceFallbacks]);

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
        screenShareSession.cancel();
        useVoiceStore.getState().clearScreenShareState();
        setScreenShares([]);
        setActiveScreenShareIdState(null);
        return;
      }

      try {
        await measureVoicePerformance(
          { operation: "screen_share_stop_cleanup", runtime: "client" },
          () => screenShareSession.stop(activeRoom),
        );
      } catch (error) {
        logWarning("[voice] Screen share unpublish failed; local capture stopped", error);
      }
      if (roomRef.current === activeRoom) {
        useVoiceStore.getState().clearScreenShareState();
        syncScreenShares(activeRoom);
      }
    },
    [screenShareSession, syncScreenShares],
  );

  const setScreenShareQuality = useCallback(async (qualityId: ScreenShareQualityId) => {
    useVoiceStore.getState().setScreenShareQuality(qualityId);
  }, []);

  const previousScreenShareMode = useRef(screenAxes.mode);
  useEffect(() => {
    if (
      shouldStopClosedGameShare(useVoiceStore.getState().screenShareStreamInfo, goLive.missingCount)
    ) {
      void stopScreenShare();
      toast.show({ message: t("voice.goLive.gameClosed") });
    }
  }, [goLive.missingCount, stopScreenShare, toast, t]);
  useEffect(() => {
    // LiveKit can override contentHint for SVC; compare user intent, not the SDK hint.
    const modeChanged = previousScreenShareMode.current !== screenAxes.mode;
    previousScreenShareMode.current = screenAxes.mode;
    const activeRoom = roomRef.current;
    const track = getLocalScreenShareTrack(activeRoom);
    if (!activeRoom || !track || !isLocalScreenShareTrackLive(track)) return;
    let cancelled = false;
    screenQualityQueue.current = screenQualityQueue.current.then(async () => {
      if (cancelled || roomRef.current !== activeRoom || !isLocalScreenShareTrackLive(track))
        return;
      setIsApplyingScreenShareQuality(true);
      const startedAt = performance.now();
      let result: "success" | "error" = "error";
      try {
        const height = track.mediaStreamTrack.getSettings().height;
        const effective = resolveCapturedScreenShareResolution(screenAxes.resolution, height);
        const mode =
          useVoiceStore.getState().screenShareStreamInfo?.kind === "game"
            ? "motion"
            : screenAxes.mode;
        const preset = getScreenSharePreset(effective, screenAxes.frameRate, mode);
        await measureVoicePerformance(
          { operation: "screen_share_mode_switch", runtime: "client" },
          async () => {
            await applyScreenShareModeToTrack(track, mode);
            // Raising capture resolution requires selecting the source again.
            if (height && preset.height <= height)
              await applyScreenShareResolutionToTrack(track, preset);
            await applyScreenShareFrameRateToTrack(track, screenAxes.frameRate, preset);
          },
        );
        if (!cancelled) useVoiceStore.getState().setScreenShareError(null);
        result = "success";
      } catch (error) {
        logWarning("[voice] Live screen share quality update failed", error);
        if (!cancelled) {
          const message = t("screenShare.errors.qualityFailed");
          useVoiceStore.getState().setScreenShareError(message);
          setTransientErrorMessage(message);
        }
      } finally {
        if (modeChanged)
          publishScreenShareHealthEvents([
            createScreenShareModeChangeEvent({
              mode: screenAxes.mode,
              durationMs: performance.now() - startedAt,
              result,
            }),
          ]);
        setIsApplyingScreenShareQuality(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [screenAxes, setTransientErrorMessage, t]);

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
        { ...getCameraPublishOptions(cameraPreferences.quality), source: Track.Source.Camera },
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

  const onCameraRestartResult = useEffectEvent((targetRoom: Room | null, failed: boolean) => {
    setCameraError(failed ? t("voice.errors.cameraStartFailed") : null);
    syncParticipants(targetRoom);
  });

  // Serialize capture changes only; roster refreshes must not reopen the camera.
  useEffect(() => {
    const targetRoom = roomRef.current;
    const track = getLocalCameraTrack(targetRoom);
    if (!track || !isLocalCameraTrackLive(track)) return;
    let cancelled = false;
    cameraRestartQueue.current = cameraRestartQueue.current.then(async () => {
      if (cancelled || roomRef.current !== targetRoom || !isLocalCameraTrackLive(track)) return;
      try {
        await track.restartTrack(
          buildCameraCaptureOptions(useVoiceStore.getState().cameraPreferences),
        );
        if (!cancelled && roomRef.current === targetRoom) {
          onCameraRestartResult(targetRoom, false);
        }
      } catch {
        if (!cancelled && roomRef.current === targetRoom) {
          onCameraRestartResult(targetRoom, true);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cameraPreferences.deviceId, cameraPreferences.quality, cameraPreferences.frameRate]);

  const requestScreenShare = useCallback(
    async (replace: boolean) => {
      const activeRoom = roomRef.current;
      if (
        !activeRoom ||
        activeRoom.state !== ConnectionState.Connected ||
        screenShareSession.getSnapshot() !== "idle"
      ) {
        return;
      }
      const store = useVoiceStore.getState();
      if (replace && (!store.isScreenSharing || !store.screenShareAllowSourceSwitch)) {
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

      if (!replace && countActiveScreenShares(activeRoom) >= 2) {
        const message = t("screenShare.errors.maxReached");
        useVoiceStore.getState().setScreenShareError(message);
        setTransientErrorMessage(message);
        return;
      }

      store.setScreenShareError(null);
      try {
        if (
          store.screenShareResolution === "h2160" &&
          (!screenShare4kEnabled || !store.screenShare4kAllowed)
        ) {
          const message = t("screenShare.errors.hardwareRequired4k");
          store.setScreenShareError(message);
          setTransientErrorMessage(message);
          return;
        }
        const axes = {
          resolution: store.screenShareResolution,
          frameRate: store.screenShareFrameRate,
          mode:
            goLive.candidate?.kind === "game" && !replace
              ? ("motion" as const)
              : store.screenShareContentMode,
        };
        // A browser without the feature is asked for video only, so the share can
        // never fail over a preference the browser cannot honour.
        const shareSystemAudio =
          useVoiceStore.getState().screenShareAudioEnabled && isScreenShareAudioSupported();
        const captureStartedAt = getVoicePerformanceNow();
        if (goLive.candidate?.kind === "game" && !replace)
          toast.show({ message: t("voice.goLive.pickerHint"), durationMs: 2_000 });
        let capturedStream = resolveGoLiveStream(undefined, null);
        const started = await screenShareSession.start(activeRoom, {
          onCaptured: () =>
            recordVoicePerformanceMetric({
              operation: "screen_share_start",
              runtime: "client",
              result: "success",
              durationMs: getVoicePerformanceDurationMs(captureStartedAt),
            }),
          capture:
            goLive.candidate?.kind === "game" && !replace
              ? () =>
                  captureGoLiveTracks({
                    ...getScreenSharePreset(axes.resolution, axes.frameRate, axes.mode),
                    frameRate: axes.frameRate,
                    shareSystemAudio,
                  })
              : getScreenShareCaptureOptions({
                  ...axes,
                  shareSystemAudio,
                  excludeSelfWindow: store.screenShareExcludeSelfWindow,
                  allowSourceSwitch: store.screenShareAllowSourceSwitch,
                }),
          publish: async (tracks) => {
            const surface = tracks
              .find((track) => track.source === Track.Source.ScreenShare)
              ?.mediaStreamTrack.getSettings().displaySurface;
            capturedStream = resolveGoLiveStream(surface, replace ? null : goLive.candidate);
            const height = tracks
              .find((track) => track.source === Track.Source.ScreenShare)
              ?.mediaStreamTrack.getSettings().height;
            const preset = getScreenSharePreset(
              resolveCapturedScreenShareResolution(axes.resolution, height),
              axes.frameRate,
              axes.mode,
            );
            let choice = screenCodecChoices.current.get(activeRoom);
            if (!choice) {
              choice = resolveScreenShareCodec(
                {
                  mode: axes.mode,
                  width: preset.width,
                  height: preset.height,
                  frameRate: axes.frameRate,
                  bitrateKbps: preset.encoding.maxBitrate / 1000,
                },
                browserScreenShareEncodingProbe(),
              );
              screenCodecChoices.current.set(activeRoom, choice);
            }
            return getScreenSharePublishOptions({
              preset,
              codecChoice: await choice,
              mode: axes.mode,
            });
          },
          replace,
          isCurrent: () =>
            roomRef.current === activeRoom && activeRoom.state === ConnectionState.Connected,
          canPublish: () =>
            replace
              ? useVoiceStore.getState().screenShareAllowSourceSwitch &&
                isLocalScreenShareTrackLive(getLocalScreenShareTrack(activeRoom))
              : countActiveScreenShares(activeRoom) < 2,
          onEnded: () => {
            void stopScreenShare(activeRoom);
          },
        });
        if (roomRef.current !== activeRoom) return;

        if (started) {
          useVoiceStore.getState().setScreenShareStreamInfo(capturedStream);
          const currentStore = useVoiceStore.getState();
          emitVoiceScreenShareState(currentStore.activeChannelId, currentStore.serverId, true, {
            force: true,
          });
        }

        if (started && shareSystemAudio) {
          suppressLocalScreenShareAudioPlayback(activeRoom);
        }

        setErrorMessage(null);
        syncScreenShares(activeRoom);
      } catch (error) {
        if (roomRef.current !== activeRoom) return;
        logWarning("[voice] Screen share operation failed", error);
        syncScreenShares(activeRoom);
        const message = t(
          replace ? "screenShare.errors.switchFailed" : "screenShare.errors.startFailed",
        );
        useVoiceStore.getState().setScreenShareError(message);
        setTransientErrorMessage(message);
      }
    },
    [
      isDesktopRuntime,
      goLive.candidate,
      emitVoiceScreenShareState,
      toast,
      screenShare4kEnabled,
      screenShareSession,
      setTransientErrorMessage,
      stopScreenShare,
      syncScreenShares,
      t,
    ],
  );

  const toggleScreenShare = useCallback(async () => {
    if (useVoiceStore.getState().isScreenSharing || screenShareSession.getSnapshot() !== "idle") {
      await stopScreenShare();
    } else {
      await requestScreenShare(false);
    }
  }, [requestScreenShare, screenShareSession, stopScreenShare]);
  const switchScreenShareSource = useCallback(() => requestScreenShare(true), [requestScreenShare]);

  const leaveChannel = useCallback(async () => {
    stopHeartbeat();
    clearReconnectTimeout();
    joinRequestRef.current = null;

    const activeSession = useVoiceStore.getState().sessionId;
    const activeServer = useVoiceStore.getState().serverId;
    const activeChannel = useVoiceStore.getState().activeChannelId;
    // Direct calls never create a server-side voice state, so there is nothing to delete.
    const hasServerVoiceState = useVoiceStore.getState().sessionMode === "channel";
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
    microphoneAutoRecoveryAttemptsRef.current = 0;
    lastEmittedScreenShareStateRef.current = null;
    setRoom(null);
    setParticipants([]);
    setActiveVoiceRoster([]);
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

      if (activeSession && hasServerVoiceState) {
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

  const joinVoiceSession = useCallback(
    async ({
      channelId,
      conversationId = null,
      serverId: nextServerId,
    }: {
      channelId: string | null;
      conversationId?: string | null;
      serverId: string | null;
    }) => {
      const isDirectCall = !channelId;
      if (leaveCleanupPromiseRef.current) {
        await leaveCleanupPromiseRef.current;
      }

      const currentState = useVoiceStore.getState();
      const nextJoinKey = isDirectCall ? `dm:${conversationId}` : `${nextServerId}:${channelId}`;
      const microphoneDeniedMessage = isDesktopRuntime
        ? t("voice.errors.microphoneDeniedDesktop")
        : t("voice.errors.microphoneDenied");
      const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");
      const shouldStartMuted = currentState.isMuted;
      const shouldStartDeafened = currentState.isDeafened;

      const activeRoom = roomRef.current;
      const isAlreadyJoiningTarget = joinRequestRef.current === nextJoinKey;
      const isAlreadyInTarget =
        (isDirectCall
          ? currentState.activeConversationId === conversationId
          : currentState.activeChannelId === channelId && currentState.serverId === nextServerId) &&
        activeRoom &&
        activeRoom.state !== ConnectionState.Disconnected;
      if (isAlreadyJoiningTarget || isAlreadyInTarget) {
        return;
      }

      const hasExistingVoiceSession =
        Boolean(joinRequestRef.current) ||
        Boolean(activeRoom) ||
        Boolean(currentState.activeChannelId) ||
        Boolean(currentState.activeConversationId) ||
        Boolean(currentState.sessionId);
      if (hasExistingVoiceSession) {
        await leaveChannel();
      }

      joinRequestRef.current = nextJoinKey;
      microphoneAutoRecoveryAttemptsRef.current = 0;

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
      let failedRoom: Room | null = null;

      try {
        const tokenResponse = await measureVoicePerformance(
          {
            operation: "livekit_token_fetch",
            runtime: "client",
          },
          () =>
            fetchLiveKitToken(
              channelId ? { channelId } : { conversationId: conversationId as string },
            ),
        );
        useVoiceStore.getState().setVideoQualityMode(tokenResponse.mediaPolicy.videoQualityMode);
        const initialCaptureConfig = getAudioCaptureConfig(currentState.audioPreferences);
        const cameraRoomDefaults = getCameraRoomDefaults();
        const nextRoom = new Room({
          // A DM call shows one fullscreen remote video, so adaptive stream only
          // costs sharpness there; a channel room keeps it.
          ...getVoiceRoomSubscriptionOptions({ sessionMode: isDirectCall ? "direct" : "channel" }),
          audioCaptureDefaults: buildAudioCaptureOptions(currentState.audioPreferences, {
            enhancedNoiseFilterActive: initialCaptureConfig.enhancedNoiseFilterActive,
          }),
          publishDefaults: applyVoiceAudioBitrate(
            cameraRoomDefaults.publishDefaults,
            tokenResponse.mediaPolicy.audioBitrate,
          ),
          videoCaptureDefaults: buildCameraCaptureOptions(currentState.cameraPreferences),
        });
        failedRoom = nextRoom;
        roomRef.current = nextRoom;
        setRoom(nextRoom);

        const syncRoomParticipants = () => {
          try {
            applyRemoteAudioState(
              nextRoom,
              useVoiceStore.getState().isDeafened,
              useVoiceStore.getState().participantVolumes,
              DEFAULT_PARTICIPANT_VOLUME,
              useVoiceStore.getState().screenShareVolume,
              useVoiceStore.getState().masterOutputVolume,
            );
            syncParticipants(nextRoom);
            syncScreenShares(nextRoom);
            // A track that subscribes while the tab is hidden would otherwise
            // stream at full rate until the user comes back to it.
            enforceHiddenTabRemoteVideo();
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
            reconnectTimeoutController.schedule(() => {
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
          if (channelId && nextServerId) {
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
          }
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

        // Voice presence, heartbeats and the voice-state cache are channel concepts; a DM
        // call is a bare LiveKit session and skips all of them.
        const state =
          channelId && nextServerId
            ? await measureVoicePerformance(
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
              )
            : null;
        voiceStateCreated = Boolean(state);

        useVoiceStore.getState().join({
          channelId,
          conversationId,
          serverId: nextServerId,
          sessionId,
          sessionMode: isDirectCall ? "direct" : "channel",
        });
        remoteAudioLevelsRef.current.clear();
        if (channelId && nextServerId) {
          runNonFatalVoiceJoinStep("socket voice join emit", () => {
            getSocket().emit("voice:join", {
              channelId,
              serverId: nextServerId,
            });
          });
        }
        useVoiceStore.getState().setMuted(shouldStartMuted || !hasMicrophoneAccess);
        useVoiceStore.getState().setDeafened(shouldStartDeafened);

        if (state && channelId && nextServerId) {
          runNonFatalVoiceJoinStep("voice state cache update", () => {
            updateVoiceStatesCache(nextServerId, channelId, state.participants);
          });
          runNonFatalVoiceJoinStep("heartbeat start", () => {
            startHeartbeat(sessionId);
          });
        }
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
          .then(async ({ preferences, track: localMicrophoneTrack }) => {
            if (roomRef.current !== nextRoom) {
              await stopLocalTracks(nextRoom).catch(() => undefined);
              return;
            }

            const syncedNoiseFilter = await syncNoiseFilterForTrack(
              localMicrophoneTrack,
              preferences,
            );
            const isKrispActive = syncedNoiseFilter.isKrispActive;
            const resolvedTier: NoiseFilterTier = resolveNoiseFilterTierForPreferences(
              preferences,
              {
                isKrispNoiseCancellationActive: isKrispActive,
                krispQuality: isKrispActive ? krispProcessorQualityRef.current : null,
              },
            );

            recordNoiseFilterTierResolved(resolvedTier);
            appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
              preferences,
              syncedNoiseFilter.processingProfile,
            );
            microphoneAutoRecoveryAttemptsRef.current = 0;
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
              microphoneAutoRecoveryAttemptsRef.current = 0;
              setErrorMessage(null);
              syncRoomParticipants();
              return;
            }

            setIsKrispNoiseCancellationActive(false);
            setActiveKrispQuality(null);
            recordNoiseFilterTierResolved("off");
            // Only a denial should mute the participant. Muting on a transient capture failure also
            // switches off the health-check recovery, which is what left the control dead.
            if (isMicrophonePermissionDenied(error)) {
              useVoiceStore.getState().setMuted(true);
            }
            setErrorMessage(
              isMicrophonePermissionDenied(error)
                ? microphoneDeniedMessage
                : microphoneEnableFailedMessage,
            );
            syncRoomParticipants();
          });
      } catch (error) {
        const nextRoom = failedRoom;
        const isCurrentJoinAttempt =
          joinRequestRef.current === nextJoinKey ||
          (nextRoom !== null && roomRef.current === nextRoom);
        logError(
          isDirectCall ? "[voice] Direct call join failed" : "[voice] Channel join failed",
          error,
        );
        stopHeartbeat();
        clearReconnectTimeout();
        if (roomRef.current === nextRoom) {
          roomRef.current = null;
          setRoom((currentRoom) => (currentRoom === nextRoom ? null : currentRoom));
          setParticipants([]);
          setActiveVoiceRoster([]);
          setCameraError(null);
          setCameraStatus("disabled");
          setConnectionState(ConnectionState.Disconnected);
        }
        appliedAudioPreferencesSignatureRef.current = null;
        if (nextRoom) {
          nextRoom.removeAllListeners();
          await stopLocalTracks(nextRoom).catch(() => undefined);
          await nextRoom.disconnect(true).catch(() => undefined);
        }
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
          useVoiceStore.getState().setVideoQualityMode("AUTO");
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
      enforceHiddenTabRemoteVideo,
      ensureLocalMicrophonePublished,
      getAudioCaptureConfig,
      isDesktopRuntime,
      krispAvailability,
      leaveChannel,
      recordNoiseFilterTierResolved,
      reconnectTimeoutController,
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

  const joinChannel = useCallback(
    ({ channelId, serverId: nextServerId }: { channelId: string; serverId: string }) =>
      joinVoiceSession({ channelId, serverId: nextServerId }),
    [joinVoiceSession],
  );

  const joinDirectCall = useCallback(
    ({ conversationId }: { conversationId: string }) =>
      joinVoiceSession({ channelId: null, conversationId, serverId: null }),
    [joinVoiceSession],
  );

  const toggleMute = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      const nextMuted = !useVoiceStore.getState().isMuted;
      useVoiceStore.getState().toggleMute();
      if (pushToTalkStateRef.current.phase === "holding") {
        pushToTalkStateRef.current.restoreMuted = nextMuted;
      }
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
      let hasMicrophoneAccess = false;

      try {
        hasMicrophoneAccess = await requestMicrophonePermission();
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

      if (!hasMicrophoneAccess) {
        setErrorMessage(microphoneDeniedMessage);
        useVoiceStore.getState().setMuted(true);
        syncParticipants(activeRoom);
        return;
      }

      // An explicit unmute is a fresh intent, so the automatic recovery budget starts over.
      microphoneAutoRecoveryAttemptsRef.current = 0;

      try {
        const { preferences, track: localMicrophoneTrack } = await enableLocalMicrophone(
          activeRoom,
          nextAudioPreferences,
        );
        const syncedNoiseFilter = await syncNoiseFilterForTrack(localMicrophoneTrack, preferences);
        appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
          preferences,
          syncedNoiseFilter.processingProfile,
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
        if (isMicrophonePermissionDenied(error)) {
          useVoiceStore.getState().setMuted(true);
          setErrorMessage(microphoneDeniedMessage);
          syncParticipants(activeRoom);
          return;
        }

        // Keep the unmute intent so the health check can retry the capture; forcing muted here is
        // what made the control look dead after the first failure.
        useVoiceStore.getState().setMuted(false);
        setErrorMessage(microphoneEnableFailedMessage);
        syncParticipants(activeRoom);
        return;
      }
    }

    useVoiceStore.getState().setMuted(nextMuted);
    if (pushToTalkStateRef.current.phase === "holding") {
      pushToTalkStateRef.current.restoreMuted = nextMuted;
    }
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

  const startPushToTalk = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!isDesktopRuntime || voiceInputMode !== "push-to-talk" || !activeRoom) {
      return;
    }

    const previousPushToTalkState = pushToTalkStateRef.current;
    if (pushToTalkReleaseTimeoutRef.current) {
      clearTimeout(pushToTalkReleaseTimeoutRef.current);
      pushToTalkReleaseTimeoutRef.current = null;
    }

    if (previousPushToTalkState.phase === "holding") {
      return;
    }

    const store = useVoiceStore.getState();
    if (store.isDeafened) {
      setTransientErrorMessage(t("voice.errors.pushToTalkDeafened"));
      return;
    }

    const startedAt = performance.now();
    const wasMuted = store.isMuted;
    const restoreMuted =
      previousPushToTalkState.phase === "release-cushion"
        ? previousPushToTalkState.restoreMuted
        : wasMuted;
    pushToTalkStateRef.current = {
      phase: "holding",
      restoreMuted,
      startedAt,
    };

    if (!wasMuted && isLocalMicrophoneTrackLive(getLocalMicrophoneTrack(activeRoom))) {
      recordDesktopPerformanceMetric({
        durationMs: performance.now() - startedAt,
        operation: "desktop_push_to_talk_latency",
        result: "success",
      });
      return;
    }

    const microphoneDeniedMessage = isDesktopRuntime
      ? t("voice.errors.microphoneDeniedDesktop")
      : t("voice.errors.microphoneDenied");
    const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");

    try {
      await requestMicrophonePermission();
      const {
        preferences,
        processingProfile,
        track: localMicrophoneTrack,
      } = await enableLocalMicrophone(activeRoom, useVoiceStore.getState().audioPreferences);
      let nextProcessingProfile = processingProfile;
      if (localMicrophoneTrack) {
        const syncedNoiseFilter = await syncNoiseFilterForTrack(localMicrophoneTrack, preferences);
        nextProcessingProfile = syncedNoiseFilter.processingProfile;
      }
      appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(
        preferences,
        nextProcessingProfile,
      );
      microphoneIntentionalMuteRef.current = false;
      useVoiceStore.getState().setMuted(false);
      setErrorMessage(null);
      syncParticipants(activeRoom);
      recordDesktopPerformanceMetric({
        durationMs: performance.now() - startedAt,
        operation: "desktop_push_to_talk_latency",
        result: "success",
      });
    } catch (error) {
      pushToTalkStateRef.current = IDLE_PUSH_TO_TALK_STATE;
      if (wasMuted) {
        useVoiceStore.getState().setMuted(true);
      }
      setIsKrispNoiseCancellationActive(false);
      setErrorMessage(
        isMicrophonePermissionDenied(error)
          ? microphoneDeniedMessage
          : microphoneEnableFailedMessage,
      );
      syncParticipants(activeRoom);
      recordDesktopPerformanceMetric({
        durationMs: performance.now() - startedAt,
        operation: "desktop_push_to_talk_latency",
        result: "failure",
      });
    }
  }, [
    enableLocalMicrophone,
    isDesktopRuntime,
    requestMicrophonePermission,
    setTransientErrorMessage,
    syncNoiseFilterForTrack,
    syncParticipants,
    t,
    voiceInputMode,
  ]);

  const stopPushToTalk = useCallback(async () => {
    if (pushToTalkStateRef.current.phase !== "holding") {
      return;
    }

    const shouldRestoreMuted = pushToTalkStateRef.current.restoreMuted;
    pushToTalkStateRef.current = {
      ...pushToTalkStateRef.current,
      phase: "release-cushion",
    };

    if (pushToTalkReleaseTimeoutRef.current) {
      clearTimeout(pushToTalkReleaseTimeoutRef.current);
      pushToTalkReleaseTimeoutRef.current = null;
    }

    if (!shouldRestoreMuted) {
      pushToTalkStateRef.current = IDLE_PUSH_TO_TALK_STATE;
      return;
    }

    pushToTalkReleaseTimeoutRef.current = setTimeout(() => {
      pushToTalkReleaseTimeoutRef.current = null;
      if (
        pushToTalkStateRef.current.phase !== "release-cushion" ||
        useVoiceStore.getState().isMuted
      ) {
        pushToTalkStateRef.current = IDLE_PUSH_TO_TALK_STATE;
        return;
      }

      const activeRoom = roomRef.current;
      const finishRelease = () => {
        appliedAudioPreferencesSignatureRef.current = null;
        setIsKrispNoiseCancellationActive(false);
        useVoiceStore.getState().setMuted(true);
        microphoneIntentionalMuteRef.current = false;
        pushToTalkStateRef.current = IDLE_PUSH_TO_TALK_STATE;
        if (activeRoom) {
          syncParticipants(activeRoom);
        }
      };

      if (!activeRoom) {
        finishRelease();
        return;
      }

      microphoneIntentionalMuteRef.current = true;
      void activeRoom.localParticipant
        .setMicrophoneEnabled(false)
        .catch((error) => {
          logError("[voice] Push-to-talk release failed to close microphone", error);
        })
        .finally(finishRelease);
    }, pushToTalkHangoverMs);
  }, [pushToTalkHangoverMs, syncParticipants]);

  const toggleDeafen = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      useVoiceStore.getState().toggleDeafen();
      return;
    }

    const nextDeafened = !useVoiceStore.getState().isDeafened;
    useVoiceStore.getState().setDeafened(nextDeafened);
    const sessionId = useVoiceStore.getState().sessionId;
    if (sessionId && useVoiceStore.getState().activeChannelId) {
      void sendVoiceHeartbeat(sessionId, { selfDeaf: nextDeafened }).catch(() => undefined);
    }
    applyRemoteAudioState(
      activeRoom,
      nextDeafened,
      useVoiceStore.getState().participantVolumes,
      DEFAULT_PARTICIPANT_VOLUME,
      useVoiceStore.getState().screenShareVolume,
      useVoiceStore.getState().masterOutputVolume,
    );
    syncParticipants(activeRoom);
  }, [syncParticipants]);

  useEffect(() => {
    if (
      voiceInputMode !== "push-to-talk" ||
      !pushToTalkEnabled ||
      !room ||
      pushToTalkStateRef.current.phase !== "idle" ||
      pushToTalkReleaseTimeoutRef.current
    ) {
      return;
    }

    microphoneIntentionalMuteRef.current = true;
    void room.localParticipant
      .setMicrophoneEnabled(false)
      .then(() => {
        appliedAudioPreferencesSignatureRef.current = null;
        setIsKrispNoiseCancellationActive(false);
        useVoiceStore.getState().setMuted(true);
        syncParticipants(room);
      })
      .catch(() => {
        microphoneIntentionalMuteRef.current = false;
      });
  }, [pushToTalkEnabled, room, syncParticipants, voiceInputMode]);

  useEffect(
    () => () => {
      if (pushToTalkReleaseTimeoutRef.current) {
        clearTimeout(pushToTalkReleaseTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (pushToTalkStateRef.current.phase === "idle" || !isDeafened) {
      return;
    }

    if (pushToTalkReleaseTimeoutRef.current) {
      clearTimeout(pushToTalkReleaseTimeoutRef.current);
      pushToTalkReleaseTimeoutRef.current = null;
    }

    pushToTalkStateRef.current = IDLE_PUSH_TO_TALK_STATE;
    if (useVoiceStore.getState().isMuted) {
      return;
    }

    const activeRoom = roomRef.current;
    const finishDeafenGuard = () => {
      appliedAudioPreferencesSignatureRef.current = null;
      setIsKrispNoiseCancellationActive(false);
      microphoneIntentionalMuteRef.current = false;
      useVoiceStore.getState().setMuted(true);
      if (activeRoom) {
        syncParticipants(activeRoom);
      }
    };

    if (!activeRoom) {
      finishDeafenGuard();
      return;
    }

    microphoneIntentionalMuteRef.current = true;
    void activeRoom.localParticipant
      .setMicrophoneEnabled(false)
      .catch((error) => {
        logError("[voice] Push-to-talk deafen guard failed to close microphone", error);
      })
      .finally(finishDeafenGuard);
  }, [isDeafened, syncParticipants]);

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

    applyRemoteAudioState(
      activeRoom,
      isDeafened,
      participantVolumes,
      DEFAULT_PARTICIPANT_VOLUME,
      screenShareVolume,
      masterOutputVolume,
    );
  }, [isDeafened, participantVolumes, screenShareVolume, masterOutputVolume]);

  // Direct calls run without adaptive stream, which also drops livekit's own
  // `pauseVideoInBackground`. Without this a hidden tab keeps pulling the other
  // side's camera at full bitrate; channel rooms keep adaptive stream and need
  // no second rule.
  useEffect(() => {
    if (typeof document === "undefined" || sessionMode !== "direct") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        enforceHiddenTabRemoteVideo();
        return;
      }

      releaseHiddenTabRemoteVideo();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    // A call joined in an already-hidden tab never fires the event, so the rule
    // has to sweep once on the way in. livekit's own rule does the same by
    // reading `visibilityState` when it installs its listener.
    enforceHiddenTabRemoteVideo();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Leaving the call (or switching to a channel room) must never leave a
      // publication parked in the disabled state this rule put it in.
      releaseHiddenTabRemoteVideo();
    };
  }, [enforceHiddenTabRemoteVideo, releaseHiddenTabRemoteVideo, sessionMode]);

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
        // Only republish on a live signal connection, and never while a publish (whose permission
        // prompt may still be open) is in flight.
        targetRoom.state !== ConnectionState.Connected ||
        microphonePublishInFlightRef.current > 0 ||
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
    microphoneAutoRecoveryAttemptsRef.current = 0;
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
      const cleanupStartedAt = performance.now();
      const hadVoiceSession = Boolean(useVoiceStore.getState().sessionId || roomRef.current);
      void Promise.allSettled([handlePageExit(), clearDesktopTransientAuthSession()])
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
      activeConversationId,
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
      screenShareAudioEnabled,
      screenShareError,
      screenShareStatus,
      goLiveLabel: goLive.candidate?.kind === "game" ? goLive.candidate.label : null,
      switchScreenShareSource,
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
      retryKrispNoiseCancellation,
      preloadVoiceProcessing,
      prepareForVoiceJoin,
      joinChannel,
      joinDirectCall,
      leaveChannel,
      sessionMode,
      stopCamera,
      stopScreenShare,
      toggleDeafen,
      toggleCamera,
      toggleMute,
      toggleScreenShare,
    }),
    [
      activeChannelId,
      activeConversationId,
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
      joinDirectCall,
      krispAvailability,
      leaveChannel,
      preloadVoiceProcessing,
      prepareForVoiceJoin,
      room,
      retryKrispNoiseCancellation,
      screenShareAudioEnabled,
      screenShareError,
      screenShareStatus,
      goLive.candidate,
      switchScreenShareSource,
      screenShareQuality,
      screenShareVolume,
      serverId,
      sessionMode,
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
        {room && (
          <VoiceAudioRenderer
            outputDeviceId={audioPreferences.outputDeviceId}
            room={room}
            onOutputError={handleAudioOutputError}
          />
        )}
      </VoiceParticipantsContext.Provider>
    </VoiceStateContext.Provider>
  );
}
