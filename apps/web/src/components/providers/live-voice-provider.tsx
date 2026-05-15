"use client";

import {
  ConnectionState,
  type AudioProcessorOptions,
  LocalAudioTrack,
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
import { useI18n } from "@/components/providers/locale-provider";
import {
  VoiceParticipantsContext,
  VoiceStateContext,
  type KrispAvailability,
  type VoiceCameraStatus,
  type VoiceParticipantViewModel,
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
import { WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import { logError } from "@/lib/logger";
import { getSocket } from "@/lib/socket/client";
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
} from "@/lib/voice/media-capabilities";
import {
  collectScreenShares,
  countActiveScreenShares,
  getParticipantCameraState,
  getParticipantProfile,
  type VoiceScreenShareViewModel,
} from "@/lib/voice/participant-mapping";
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
  getParticipantAudioActivity,
  registerRoomParticipantSyncListeners,
  type ReconnectTimeoutController,
} from "@/lib/voice/provider-lifecycle";
import { mapVoiceScreenShareStateCache, mapVoiceStateCache } from "@/lib/voice/state-cache";
import { VOICE_HEARTBEAT_INTERVAL_MS, type VoiceChannelStateDTO } from "@/lib/voice/types";
import { useVoiceAudioLevels, type RemoteVoiceAudioLevel } from "@/lib/voice/use-voice-audio-levels";
import { useVoiceHeartbeat } from "@/lib/voice/use-voice-heartbeat";
import {
  applyScreenShareEncodingToSender,
  getScreenShareCaptureOptions,
  getScreenSharePublishOptions,
  getScreenShareQualityPreset,
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
const KRISP_PROCESSOR_NAME = "livekit-noise-filter";
const PREFERRED_KRISP_QUALITY = "high";
const FALLBACK_KRISP_QUALITY = "medium";
const KRISP_BUFFER_DROP_MS = 300;
const KRISP_BUFFER_OVERFLOW_MS = 200;

function resolveParticipantVolume(
  userId: string,
  isDeafened: boolean,
  participantVolumes: Record<string, number>,
) {
  if (isDeafened) {
    return 0;
  }

  return (participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME) / 100;
}

function getLocalMicrophoneTrack(targetRoom: Room | null) {
  const microphonePublication =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track ?? null;

  return microphonePublication instanceof LocalAudioTrack ? microphonePublication : null;
}

function isLocalMicrophoneTrackLive(track: LocalAudioTrack | null): track is LocalAudioTrack {
  return track?.mediaStreamTrack.readyState === "live";
}

function getLocalCameraTrack(targetRoom: Room | null) {
  const cameraPublication =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.Camera)?.track ?? null;

  return cameraPublication instanceof LocalVideoTrack ? cameraPublication : null;
}

function isLocalCameraTrackLive(track: LocalVideoTrack | null) {
  return track?.mediaStreamTrack.readyState === "live";
}

function getLocalScreenShareTrack(targetRoom: Room | null) {
  const screenShareTrack =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null;

  return screenShareTrack instanceof LocalVideoTrack ? screenShareTrack : null;
}

function isLocalScreenShareTrackLive(track: LocalVideoTrack | null) {
  return track?.mediaStreamTrack.readyState === "live";
}

async function applyScreenShareQualityToTrack(
  track: LocalVideoTrack,
  qualityId: ScreenShareQualityId,
) {
  const preset = getScreenShareQualityPreset(qualityId);

  if (track.sender) {
    await applyScreenShareEncodingToSender(track.sender, preset.encoding);
  }
}

async function stopLocalTracks(room: Room) {
  const publications = room.localParticipant.getTrackPublications();
  const localTracks = publications
    .map((publication) => publication.track)
    .filter((track): track is LocalTrack => track instanceof LocalTrack);

  await Promise.all(
    localTracks.map((track) =>
      track instanceof LocalAudioTrack && track.getProcessor()
        ? track.stopProcessor().catch(() => undefined)
        : Promise.resolve(),
    ),
  );

  await Promise.all(
    localTracks.map((track) =>
      room.localParticipant.unpublishTrack(track, false).catch(() => undefined),
    ),
  );

  for (const track of localTracks) {
    track.stop();
    track.detach();
  }
}

function applyRemoteAudioState(
  room: Room,
  isDeafened: boolean,
  participantVolumes: Record<string, number>,
) {
  for (const participant of room.remoteParticipants.values()) {
    participant.setVolume(
      resolveParticipantVolume(participant.identity, isDeafened, participantVolumes),
      Track.Source.Microphone,
    );
  }
}

export function LiveVoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isDesktopRuntime = useMemo(isWhisprDesktopRuntime, []);
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
  const lastEmittedScreenShareStateRef = useRef<boolean | null>(null);
  const connectionWarningMessageRef = useRef<string | null>(null);
  const cleanupVoiceResourcesRef = useRef<() => void>(() => undefined);
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

      const nextParticipants = [
        targetRoom.localParticipant,
        ...targetRoom.remoteParticipants.values(),
      ].map((participant) => {
        const profile = getParticipantProfile(participant, currentUser);
        const audioActivity = getParticipantAudioActivity(participant);
        const cameraState = getParticipantCameraState(participant);

        return {
          ...profile,
          ...audioActivity,
          ...cameraState,
          isLocal: participant.identity === currentUser.id,
        } satisfies VoiceParticipantViewModel;
      });

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
      const krispModule = await import("@livekit/krisp-noise-filter");

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
        quality: PREFERRED_KRISP_QUALITY,
      });
    }

    return krispProcessorRef.current;
  }, [ensureKrispSupport]);

  const resetKrispProcessor = useCallback(async () => {
    if (krispProcessorRef.current) {
      await krispProcessorRef.current.destroy().catch(() => undefined);
      krispProcessorRef.current = null;
    }

    setIsKrispNoiseCancellationActive(false);
  }, []);

  const createFallbackKrispProcessor = useCallback(async () => {
    const krispModule = await ensureKrispSupport();
    if (!krispModule) {
      return null;
    }

    await resetKrispProcessor();
    krispProcessorRef.current = krispModule.KrispNoiseFilter({
      bufferDropMs: KRISP_BUFFER_DROP_MS,
      bufferOverflowMs: KRISP_BUFFER_OVERFLOW_MS,
      quality: FALLBACK_KRISP_QUALITY,
    });

    return krispProcessorRef.current;
  }, [ensureKrispSupport, resetKrispProcessor]);

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

      const enableProcessor = async (processor: KrispNoiseFilterProcessor | null) => {
        if (!processor) {
          setIsKrispNoiseCancellationActive(false);
          return false;
        }

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
        const isActive = nextEnabled ?? processor.isEnabled();
        setIsKrispNoiseCancellationActive(isActive === true);
        setKrispAvailability("available");
        return isActive === true;
      };

      try {
        const processor = await getOrCreateKrispProcessor();
        return await enableProcessor(processor);
      } catch (error) {
        if (isLikelyKrispSecurityPolicyError(error)) {
          setKrispAvailability("blocked_by_security_policy");
        }
        logError("[voice] High quality Krisp failed, retrying stable quality", error);
      }

      try {
        const fallbackProcessor = await createFallbackKrispProcessor();
        return await enableProcessor(fallbackProcessor);
      } catch (error) {
        // Krisp is an enhancement; keep the published microphone alive and fall back to WebRTC.
        logError("[voice] Krisp noise cancellation failed", error);
        await detachKrispNoiseCancellation(track);
        setKrispAvailability(
          isLikelyKrispSecurityPolicyError(error) ? "blocked_by_security_policy" : "unavailable",
        );
        setIsKrispNoiseCancellationActive(false);
        return false;
      }
    },
    [createFallbackKrispProcessor, detachKrispNoiseCancellation, getOrCreateKrispProcessor],
  );

  const enableLocalMicrophone = useCallback(
    async (targetRoom: Room, preferences: VoiceAudioPreferences) => {
      try {
        await targetRoom.localParticipant.setMicrophoneEnabled(
          true,
          buildAudioCaptureOptions(preferences),
        );

        return {
          preferences,
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

        await targetRoom.localParticipant.setMicrophoneEnabled(
          true,
          buildAudioCaptureOptions(fallbackPreferences),
        );

        return {
          preferences: fallbackPreferences,
          track: getLocalMicrophoneTrack(targetRoom),
        };
      }
    },
    [],
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

      const nextSignature = getAudioCaptureRestartSignature(audioPreferences);
      const shouldRestartCapture = appliedAudioPreferencesSignatureRef.current !== nextSignature;

      setIsApplyingAudioPreferences(true);

      try {
        if (shouldRestartCapture) {
          try {
            await localMicrophoneTrack.restartTrack(buildAudioCaptureOptions(audioPreferences));
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

            await localMicrophoneTrack.restartTrack(buildAudioCaptureOptions(fallbackPreferences));
            appliedAudioPreferencesSignatureRef.current =
              getAudioCaptureRestartSignature(fallbackPreferences);
          }
        }

        await syncKrispNoiseCancellation(
          localMicrophoneTrack,
          audioPreferences.krispNoiseCancellation,
        );
        syncParticipants(targetRoom);
      } finally {
        setIsApplyingAudioPreferences(false);
      }
    },
    [audioPreferences, syncKrispNoiseCancellation, syncParticipants],
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

          const { preferences, track: localMicrophoneTrack } = await enableLocalMicrophone(
            targetRoom,
            useVoiceStore.getState().audioPreferences,
          );

          if (roomRef.current !== targetRoom) {
            await stopLocalTracks(targetRoom).catch(() => undefined);
            return false;
          }

          if (localMicrophoneTrack) {
            await syncKrispNoiseCancellation(
              localMicrophoneTrack,
              preferences.krispNoiseCancellation,
            );
          }

          appliedAudioPreferencesSignatureRef.current =
            getAudioCaptureRestartSignature(preferences);
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
      syncKrispNoiseCancellation,
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

      const isActive = await syncKrispNoiseCancellation(localMicrophoneTrack, true);
      syncParticipants(activeRoom);
      return isActive;
    } finally {
      setIsRecoveringKrispNoiseCancellation(false);
    }
  }, [
    ensureKrispSupport,
    ensureLocalMicrophonePublished,
    resetKrispProcessor,
    syncKrispNoiseCancellation,
    syncParticipants,
  ]);

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

    if (activeRoom) {
      activeRoom.removeAllListeners();
      await stopScreenShare(activeRoom).catch(() => undefined);
      await stopCamera(activeRoom).catch(() => undefined);
      await stopLocalTracks(activeRoom).catch(() => undefined);
      await activeRoom.disconnect(true).catch(() => undefined);
      setParticipants([]);
      setScreenShares([]);
      setActiveScreenShareIdState(null);
      setCameraStatus("disabled");
      useVoiceStore.getState().clearScreenShareState();
    }

    if (activeSession) {
      await deleteVoiceState({ sessionId: activeSession }).catch(() => undefined);
    }

    await resetKrispProcessor();

    if (activeServer && activeChannel) {
      updateVoiceStatesCache(activeServer, activeChannel, []);
    }

    useVoiceStore.getState().leave();
  }, [
    clearReconnectTimeout,
    resetKrispProcessor,
    stopHeartbeat,
    stopCamera,
    stopScreenShare,
    updateVoiceStatesCache,
  ]);

  const joinChannel = useCallback(
    async ({ channelId, serverId: nextServerId }: { channelId: string; serverId: string }) => {
      const currentState = useVoiceStore.getState();
      const nextJoinKey = `${nextServerId}:${channelId}`;
      const microphoneDeniedMessage = isDesktopRuntime
        ? t("voice.errors.microphoneDeniedDesktop")
        : t("voice.errors.microphoneDenied");
      const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");
      const shouldStartMuted = currentState.isMuted;
      const shouldStartDeafened = currentState.isDeafened;

      if (
        currentState.activeChannelId === channelId &&
        currentState.serverId === nextServerId &&
        roomRef.current &&
        roomRef.current.state !== ConnectionState.Disconnected
      ) {
        return;
      }

      if (joinRequestRef.current === nextJoinKey) {
        return;
      }

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
            throw error;
          }
        }
      }

      if (
        joinRequestRef.current ||
        roomRef.current ||
        currentState.activeChannelId ||
        currentState.sessionId
      ) {
        await leaveChannel();
      }

      joinRequestRef.current = nextJoinKey;
      setIsJoining(true);
      setErrorMessage(null);
      setCameraError(null);
      setCameraStatus("disabled");

      const sessionId = crypto.randomUUID();
      const nextRoom = new Room({
        audioCaptureDefaults: buildAudioCaptureOptions(currentState.audioPreferences),
      });
      roomRef.current = nextRoom;
      setRoom(nextRoom);

      const syncRoomParticipants = () => {
        applyRemoteAudioState(
          nextRoom,
          useVoiceStore.getState().isDeafened,
          useVoiceStore.getState().participantVolumes,
        );
        syncParticipants(nextRoom);
        syncScreenShares(nextRoom);
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
        const tokenResponse = await fetchLiveKitToken({ channelId });
        supportsLiveKitCloudNoiseCancellationRef.current = isLiveKitCloudUrl(tokenResponse.url);

        if (!supportsLiveKitCloudNoiseCancellationRef.current) {
          setKrispAvailability("requires_livekit_cloud");
        } else if (krispAvailability === "requires_livekit_cloud") {
          setKrispAvailability("checking");
        }

        await connectLiveKitRoomWithRetry(nextRoom, tokenResponse.url, tokenResponse.token);
        setConnectionState(nextRoom.state);

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
        remoteAudioLevelsRef.current.clear();
        getSocket().emit("voice:join", {
          channelId,
          serverId: nextServerId,
        });
        useVoiceStore.getState().setMuted(shouldStartMuted || !hasMicrophoneAccess);
        useVoiceStore.getState().setDeafened(shouldStartDeafened);

        updateVoiceStatesCache(nextServerId, channelId, state.participants);
        startHeartbeat(sessionId);
        void nextRoom.startAudio().catch(() => undefined);
        applyRemoteAudioState(
          nextRoom,
          shouldStartDeafened,
          useVoiceStore.getState().participantVolumes,
        );
        syncRoomParticipants();

        if (!hasMicrophoneAccess) {
          setIsKrispNoiseCancellationActive(false);
          setErrorMessage(microphoneDeniedMessage);
          syncParticipants(nextRoom);
          return;
        }

        if (shouldStartMuted) {
          setIsKrispNoiseCancellationActive(false);
          setErrorMessage(null);
          syncParticipants(nextRoom);
          return;
        }

        void enableLocalMicrophone(nextRoom, useVoiceStore.getState().audioPreferences)
          .then(async ({ preferences, track: localMicrophoneTrack }) => {
            if (roomRef.current !== nextRoom) {
              await stopLocalTracks(nextRoom).catch(() => undefined);
              return;
            }

            if (localMicrophoneTrack) {
              await syncKrispNoiseCancellation(
                localMicrophoneTrack,
                preferences.krispNoiseCancellation,
              );
            }
            appliedAudioPreferencesSignatureRef.current =
              getAudioCaptureRestartSignature(preferences);
            setErrorMessage(null);
            useVoiceStore.getState().setMuted(false);
            syncParticipants(nextRoom);
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
              syncParticipants(nextRoom);
              return;
            }

            setIsKrispNoiseCancellationActive(false);
            useVoiceStore.getState().setMuted(true);
            setErrorMessage(
              isMicrophonePermissionDenied(error)
                ? microphoneDeniedMessage
                : microphoneEnableFailedMessage,
            );
            syncParticipants(nextRoom);
          });
      } catch (error) {
        roomRef.current = null;
        setRoom(null);
        setParticipants([]);
        setCameraError(null);
        setCameraStatus("disabled");
        setConnectionState(ConnectionState.Disconnected);
        appliedAudioPreferencesSignatureRef.current = null;
        nextRoom.removeAllListeners();
        await stopLocalTracks(nextRoom).catch(() => undefined);
        await nextRoom.disconnect(true).catch(() => undefined);
        await resetKrispProcessor();
        useVoiceStore.getState().leave();
        setErrorMessage(
          isMicrophonePermissionDenied(error)
            ? microphoneDeniedMessage
            : isMicrophoneDeviceUnavailable(error)
              ? microphoneEnableFailedMessage
              : t("voice.errors.connectionFailed"),
        );
        throw error;
      } finally {
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
      isDesktopRuntime,
      krispAvailability,
      leaveChannel,
      resetKrispProcessor,
      requestMicrophonePermission,
      startHeartbeat,
      setConnectionWarning,
      syncKrispNoiseCancellation,
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
        const { preferences, track: localMicrophoneTrack } = await enableLocalMicrophone(
          activeRoom,
          nextAudioPreferences,
        );
        if (localMicrophoneTrack) {
          await syncKrispNoiseCancellation(
            localMicrophoneTrack,
            preferences.krispNoiseCancellation,
          );
        }
        appliedAudioPreferencesSignatureRef.current = getAudioCaptureRestartSignature(preferences);
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
    syncKrispNoiseCancellation,
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
    applyRemoteAudioState(activeRoom, nextDeafened, useVoiceStore.getState().participantVolumes);
    syncParticipants(activeRoom);
  }, [syncParticipants]);

  useEffect(() => {
    if (!supportsLiveKitCloudNoiseCancellationRef.current) {
      setKrispAvailability("requires_livekit_cloud");
      return;
    }

    let cancelled = false;

    void ensureKrispSupport().then((module) => {
      if (cancelled) {
        return;
      }

      if (!module && krispAvailability === "checking") {
        setKrispAvailability("unavailable");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ensureKrispSupport, krispAvailability]);

  useEffect(() => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    applyRemoteAudioState(activeRoom, isDeafened, participantVolumes);
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
    const handlePageExit = () => {
      stopHeartbeat();
      clearReconnectTimeout();

      const activeRoom = roomRef.current;
      const store = useVoiceStore.getState();

      if (store.isScreenSharing && store.screenShareMode === "voice") {
        emitVoiceScreenShareState(store.activeChannelId, store.serverId, false, {
          force: true,
        });
      }

      if (activeRoom) {
        void stopScreenShare(activeRoom).catch(() => undefined);
        void stopCamera(activeRoom).catch(() => undefined);
        void stopLocalTracks(activeRoom).catch(() => undefined);
        void activeRoom.disconnect(true).catch(() => undefined);
      }

      const activeSession = useVoiceStore.getState().sessionId;
      if (activeSession) {
        void notifyVoiceExit(activeSession);
      }
    };

    window.addEventListener("beforeunload", handlePageExit);
    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handlePageExit);
    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener(WHISPR_DESKTOP_BEFORE_CLOSE_EVENT, handlePageExit);
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

