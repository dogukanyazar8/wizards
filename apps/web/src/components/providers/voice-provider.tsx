"use client";

import {
  ConnectionState,
  type AudioProcessorOptions,
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  Room,
  Track,
  type AudioCaptureOptions,
  type Participant,
  type RemoteVideoTrack,
  type TrackProcessor,
} from "livekit-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import type { KrispNoiseFilterProcessor } from "@livekit/krisp-noise-filter";
import { useI18n } from "@/components/providers/locale-provider";
import { VoiceAudioRenderer } from "@/components/voice/voice-audio-renderer";
import { getSocket } from "@/lib/socket/client";
import {
  deleteVoiceState,
  fetchLiveKitToken,
  sendVoiceHeartbeat,
  upsertVoiceState,
  voiceQueryKeys,
} from "@/lib/voice/client";
import {
  VOICE_HEARTBEAT_INTERVAL_MS,
  type VoiceChannelStateDTO,
} from "@/lib/voice/types";
import {
  applyScreenShareEncodingToSender,
  buildScreenShareMediaConstraints,
  getScreenShareCaptureOptions,
  getScreenSharePublishOptions,
  getScreenShareQualityPreset,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";
import {
  DEFAULT_PARTICIPANT_VOLUME,
  type VoiceAudioPreferences,
  useVoiceStore,
} from "@/store/voice-store";

type VoiceProviderProps = {
  children: ReactNode;
  currentUser: {
    id: string;
    avatarUrl?: string | null;
    displayName: string;
    username: string;
  };
};

export interface VoiceParticipantViewModel {
  avatarUrl: string | null;
  displayName: string | null;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
  username: string;
}

export interface VoiceScreenShareViewModel {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  isLocal: boolean;
  participantId: string;
  track: LocalVideoTrack | RemoteVideoTrack | null;
  trackSid: string;
  username: string;
}

export type KrispAvailability =
  | "available"
  | "checking"
  | "requires_livekit_cloud"
  | "unavailable"
  | "unsupported_browser";

type VoiceContextValue = {
  activeChannelId: string | null;
  audioPreferences: VoiceAudioPreferences;
  connectionState: ConnectionState;
  errorMessage: string | null;
  getParticipantVolume: (userId: string) => number;
  isApplyingAudioPreferences: boolean;
  isDeafened: boolean;
  isJoining: boolean;
  isKrispNoiseCancellationActive: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
  krispAvailability: KrispAvailability;
  participants: VoiceParticipantViewModel[];
  resetParticipantVolume: (userId: string) => void;
  room: Room | null;
  screenShareError: string | null;
  screenShares: VoiceScreenShareViewModel[];
  screenShareQuality: ScreenShareQualityId;
  serverId: string | null;
  activeScreenShareId: string | null;
  setAudioPreference: <Key extends keyof VoiceAudioPreferences>(
    key: Key,
    value: VoiceAudioPreferences[Key],
  ) => void;
  setActiveScreenShareId: (id: string) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  setScreenShareQuality: (qualityId: ScreenShareQualityId) => Promise<void>;
  prepareForVoiceJoin: () => Promise<boolean>;
  joinChannel: (input: { channelId: string; serverId: string }) => Promise<void>;
  leaveChannel: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  isApplyingScreenShareQuality: boolean;
  toggleDeafen: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
};

type ParticipantMetadata = {
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
};

const NEXT_PUBLIC_LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
const RECONNECT_TIMEOUT_MS = 30_000;

const VoiceContext = createContext<VoiceContextValue | null>(null);

function isMicrophonePermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|securityerror/i.test(
      error.message,
    )
  );
}

function isScreenSharePermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "AbortError" ||
      error.name === "SecurityError"
    );
  }

  return (
    error instanceof Error &&
    /notallowederror|permission denied|permissiondeniederror|aborterror|securityerror/i.test(
      error.message,
    )
  );
}

function isScreenShareSupported() {
  return Boolean(
    typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia,
  );
}

function isLiveKitCloudUrl(url: string) {
  return /livekit\.cloud/i.test(url);
}

function buildAudioCaptureOptions(
  audioPreferences: VoiceAudioPreferences,
): AudioCaptureOptions {
  return {
    autoGainControl: audioPreferences.autoGainControl,
    echoCancellation: audioPreferences.echoCancellation,
    noiseSuppression: audioPreferences.noiseSuppression,
  };
}

function getAudioPreferencesSignature(audioPreferences: VoiceAudioPreferences) {
  return [
    audioPreferences.autoGainControl,
    audioPreferences.echoCancellation,
    audioPreferences.krispNoiseCancellation,
    audioPreferences.noiseSuppression,
  ].join(":");
}

function parseParticipantMetadata(participant: Participant): ParticipantMetadata {
  if (!participant.metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(participant.metadata) as ParticipantMetadata;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function getParticipantProfile(
  participant: Participant,
  currentUser: VoiceProviderProps["currentUser"],
): Pick<VoiceParticipantViewModel, "avatarUrl" | "displayName" | "userId" | "username"> {
  if (participant.identity === currentUser.id) {
    return {
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl ?? null,
    };
  }

  const metadata = parseParticipantMetadata(participant);
  const username =
    metadata.username?.trim() ||
    metadata.displayName?.trim() ||
    participant.name?.trim() ||
    participant.identity;

  return {
    userId: participant.identity,
    username,
    displayName: metadata.displayName?.trim() || participant.name?.trim() || null,
    avatarUrl: metadata.avatarUrl ?? null,
  };
}

function getScreenShareId(participantId: string, trackSid: string) {
  return `${participantId}:${trackSid}`;
}

function collectScreenShares(
  targetRoom: Room,
  currentUser: VoiceProviderProps["currentUser"],
): VoiceScreenShareViewModel[] {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].flatMap(
    (participant) => {
      const profile = getParticipantProfile(participant, currentUser);

      return participant
        .getTrackPublications()
        .filter(
          (publication) =>
            publication.source === Track.Source.ScreenShare && !publication.isMuted,
        )
        .map((publication) => ({
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
          id: getScreenShareId(participant.identity, publication.trackSid),
          isLocal: participant.identity === currentUser.id,
          participantId: participant.identity,
          track: publication.videoTrack ?? null,
          trackSid: publication.trackSid,
          username: profile.username,
        }));
    },
  );
}

function countActiveScreenShares(targetRoom: Room) {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].reduce(
    (count, participant) =>
      count +
      participant
        .getTrackPublications()
        .filter(
          (publication) =>
            publication.source === Track.Source.ScreenShare && !publication.isMuted,
        ).length,
    0,
  );
}

function mapVoiceStateCache(
  states: VoiceChannelStateDTO[] | undefined,
  channelId: string,
  participants: Array<{
    avatarUrl: string | null;
    displayName: string | null;
    isScreenSharing?: boolean;
    userId: string;
    username: string;
  }>,
) {
  const nextStates = states ? [...states] : [];
  const existingIndex = nextStates.findIndex((state) => state.channelId === channelId);

  if (participants.length === 0) {
    if (existingIndex >= 0) {
      nextStates.splice(existingIndex, 1);
    }
    return nextStates;
  }

  const nextState: VoiceChannelStateDTO = {
    channelId,
    participants,
  };

  if (existingIndex >= 0) {
    nextStates[existingIndex] = nextState;
    return nextStates;
  }

  nextStates.push(nextState);
  return nextStates;
}

function mapVoiceScreenShareStateCache(
  states: VoiceChannelStateDTO[] | undefined,
  channelId: string,
  userId: string,
  isScreenSharing: boolean,
) {
  if (!states) {
    return states;
  }

  return states.map((state) => {
    if (state.channelId !== channelId) {
      return state;
    }

    return {
      ...state,
      participants: state.participants.map((participant) =>
        participant.userId === userId
          ? {
              ...participant,
              isScreenSharing,
            }
          : participant,
      ),
    };
  });
}

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

function getLocalScreenShareTrack(targetRoom: Room | null) {
  const screenShareTrack =
    targetRoom?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track ?? null;

  return screenShareTrack instanceof LocalVideoTrack ? screenShareTrack : null;
}

async function applyScreenShareQualityToTrack(
  track: LocalVideoTrack,
  qualityId: ScreenShareQualityId,
) {
  const preset = getScreenShareQualityPreset(qualityId);

  if (track.sender) {
    await applyScreenShareEncodingToSender(track.sender, preset.encoding);
  }

  await track.mediaStreamTrack
    .applyConstraints(buildScreenShareMediaConstraints(qualityId))
    .catch(() => undefined);
}

async function stopLocalTracks(room: Room) {
  const publications = room.localParticipant.getTrackPublications();
  const localTracks = publications
    .map((publication) => publication.track)
    .filter((track): track is LocalTrack => track instanceof LocalTrack);

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

function notifyVoiceExit() {
  return fetch("/api/v1/voice/state", {
    method: "DELETE",
    keepalive: true,
  }).catch(() => undefined);
}

export function VoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const roomRef = useRef<Room | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinRequestRef = useRef<string | null>(null);
  const preparedMicrophoneAccessRef = useRef<boolean | null>(null);
  const appliedAudioPreferencesSignatureRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const krispProcessorRef = useRef<KrispNoiseFilterProcessor | null>(null);
  const lastEmittedScreenShareStateRef = useRef<boolean | null>(null);
  const supportsLiveKitCloudNoiseCancellationRef = useRef(
    isLiveKitCloudUrl(NEXT_PUBLIC_LIVEKIT_URL),
  );
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantViewModel[]>([]);
  const [screenShares, setScreenShares] = useState<VoiceScreenShareViewModel[]>([]);
  const [activeScreenShareId, setActiveScreenShareIdState] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isApplyingAudioPreferences, setIsApplyingAudioPreferences] = useState(false);
  const [isApplyingScreenShareQuality, setIsApplyingScreenShareQuality] = useState(false);
  const [isKrispNoiseCancellationActive, setIsKrispNoiseCancellationActive] = useState(false);
  const [krispAvailability, setKrispAvailability] = useState<KrispAvailability>(
    supportsLiveKitCloudNoiseCancellationRef.current ? "checking" : "requires_livekit_cloud",
  );

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

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const getParticipantVolume = useCallback(
    (userId: string) => participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME,
    [participantVolumes],
  );

  const requestMicrophonePermission = useCallback(
    async (preferences: VoiceAudioPreferences) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioCaptureOptions(preferences),
      });

      for (const track of stream.getTracks()) {
        track.stop();
      }

      return true;
    },
    [],
  );

  const prepareForVoiceJoin = useCallback(async () => {
    const currentPreferences = useVoiceStore.getState().audioPreferences;

    try {
      const granted = await requestMicrophonePermission(currentPreferences);
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
        const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);

        return {
          ...profile,
          isLocal: participant.identity === currentUser.id,
          isMuted:
            microphonePublication?.isMuted ?? !participant.isMicrophoneEnabled,
          isSpeaking: participant.isSpeaking && participant.audioLevel > 0.05,
        } satisfies VoiceParticipantViewModel;
      });

      setParticipants(nextParticipants);
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

  const startHeartbeat = useCallback(
    (sessionId: string) => {
      stopHeartbeat();
      heartbeatRef.current = setInterval(() => {
        void sendVoiceHeartbeat(sessionId).catch(() => {
          // If the session vanished on the server, a reconnect or explicit leave
          // will reconcile the local state.
        });
        const store = useVoiceStore.getState();
        if (store.isScreenSharing && store.screenShareMode === "voice") {
          emitVoiceScreenShareState(store.activeChannelId, store.serverId, true, {
            force: true,
          });
        }
      }, VOICE_HEARTBEAT_INTERVAL_MS);
    },
    [emitVoiceScreenShareState, stopHeartbeat],
  );

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
    } catch {
      setKrispAvailability("unavailable");
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
        quality: "high",
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

  const syncKrispNoiseCancellation = useCallback(
    async (track: LocalAudioTrack, enabled: boolean) => {
      if (!enabled) {
        const currentProcessor = track.getProcessor();
        if (currentProcessor?.name === "livekit-noise-filter") {
          if (krispProcessorRef.current) {
            await krispProcessorRef.current.setEnabled(false).catch(() => undefined);
          }
        }

        setIsKrispNoiseCancellationActive(false);
        return;
      }

      const processor = await getOrCreateKrispProcessor();
      if (!processor) {
        setIsKrispNoiseCancellationActive(false);
        return;
      }

      const currentProcessor = track.getProcessor();
      if (!currentProcessor || currentProcessor.name !== "livekit-noise-filter") {
        await track.setProcessor(
          processor as unknown as TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>,
        );
      }

      await processor.setEnabled(true);
      setIsKrispNoiseCancellationActive(true);
    },
    [getOrCreateKrispProcessor],
  );

  const applyAudioPreferencesToRoom = useCallback(
    async (targetRoom: Room | null = roomRef.current) => {
      const localMicrophoneTrack = getLocalMicrophoneTrack(targetRoom);
      if (!localMicrophoneTrack) {
        setIsKrispNoiseCancellationActive(false);
        return;
      }

      if (useVoiceStore.getState().isMuted) {
        appliedAudioPreferencesSignatureRef.current = null;
        setIsKrispNoiseCancellationActive(false);
        return;
      }

      const nextSignature = getAudioPreferencesSignature(audioPreferences);
      const shouldRestartCapture =
        appliedAudioPreferencesSignatureRef.current !== nextSignature;

      setIsApplyingAudioPreferences(true);

      try {
        if (shouldRestartCapture) {
          await localMicrophoneTrack.restartTrack(buildAudioCaptureOptions(audioPreferences));
          appliedAudioPreferencesSignatureRef.current = nextSignature;
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

  const setActiveScreenShareId = useCallback(
    (id: string) => {
      setActiveScreenShareIdState(id);
      useVoiceStore.getState().setScreenShareState({
        activeSharerId: id,
        channelId: useVoiceStore.getState().activeChannelId,
        conversationId: null,
        isSharing: useVoiceStore.getState().isScreenSharing,
        mode: "voice",
      });
    },
    [],
  );

  const stopScreenShare = useCallback(async (targetRoom?: Room | null) => {
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
  }, [syncScreenShares]);

  const setScreenShareQuality = useCallback(
    async (qualityId: ScreenShareQualityId) => {
      useVoiceStore.getState().setScreenShareQuality(qualityId);

      const localScreenShareTrack = getLocalScreenShareTrack(roomRef.current);
      if (!localScreenShareTrack) {
        return;
      }

      setIsApplyingScreenShareQuality(true);
      try {
        await applyScreenShareQualityToTrack(localScreenShareTrack, qualityId);
        setErrorMessage(null);
        syncScreenShares(roomRef.current);
      } catch {
        const message = t("screenShare.errors.qualityFailed");
        useVoiceStore.getState().setScreenShareError(message);
        setErrorMessage(message);
      } finally {
        setIsApplyingScreenShareQuality(false);
      }
    },
    [syncScreenShares, t],
  );

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
      const message = t("screenShare.errors.notSupported");
      useVoiceStore.getState().setScreenShareError(message);
      setErrorMessage(message);
      return;
    }

    if (countActiveScreenShares(activeRoom) >= 2) {
      const message = t("screenShare.errors.maxReached");
      useVoiceStore.getState().setScreenShareError(message);
      setErrorMessage(message);
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
        ? t("screenShare.errors.permissionDenied")
        : error instanceof Error
          ? error.message
          : t("screenShare.errors.startFailed");

      useVoiceStore.getState().setScreenShareError(message);
      setErrorMessage(message);
      await stopScreenShare(activeRoom).catch(() => undefined);
    }
  }, [stopScreenShare, syncScreenShares, t]);

  const leaveChannel = useCallback(async () => {
    stopHeartbeat();
    clearReconnectTimeout();
    joinRequestRef.current = null;

    const activeSession = useVoiceStore.getState().sessionId;
    const activeServer = useVoiceStore.getState().serverId;
    const activeChannel = useVoiceStore.getState().activeChannelId;
    const activeRoom = roomRef.current;

    roomRef.current = null;
    appliedAudioPreferencesSignatureRef.current = null;
    lastEmittedScreenShareStateRef.current = null;
    setRoom(null);
    setParticipants([]);
    setScreenShares([]);
    setActiveScreenShareIdState(null);
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage(null);

    if (activeRoom) {
      activeRoom.removeAllListeners();
      await stopScreenShare(activeRoom).catch(() => undefined);
      await stopLocalTracks(activeRoom).catch(() => undefined);
      await activeRoom.disconnect(true).catch(() => undefined);
      setScreenShares([]);
      setActiveScreenShareIdState(null);
      useVoiceStore.getState().clearScreenShareState();
    }

    if (activeSession) {
      await deleteVoiceState().catch(() => undefined);
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
    stopScreenShare,
    updateVoiceStatesCache,
  ]);

  const joinChannel = useCallback(
    async ({ channelId, serverId: nextServerId }: { channelId: string; serverId: string }) => {
      const currentState = useVoiceStore.getState();
      const nextJoinKey = `${nextServerId}:${channelId}`;
      const microphoneDeniedMessage = t("voice.errors.microphoneDenied");
      const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");

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

      let hasMicrophoneAccess = false;
      const preparedMicrophoneAccess = preparedMicrophoneAccessRef.current;
      preparedMicrophoneAccessRef.current = null;

      if (preparedMicrophoneAccess !== null) {
        hasMicrophoneAccess = preparedMicrophoneAccess;
      } else {
        try {
          hasMicrophoneAccess = await requestMicrophonePermission(currentState.audioPreferences);
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

      nextRoom.on("participantConnected", syncRoomParticipants);
      nextRoom.on("participantDisconnected", syncRoomParticipants);
      nextRoom.on("activeSpeakersChanged", syncRoomParticipants);
      nextRoom.on("trackMuted", syncRoomParticipants);
      nextRoom.on("trackUnmuted", syncRoomParticipants);
      nextRoom.on("localTrackPublished", syncRoomParticipants);
      nextRoom.on("localTrackUnpublished", syncRoomParticipants);
      nextRoom.on("participantMetadataChanged", syncRoomParticipants);
      nextRoom.on("participantNameChanged", syncRoomParticipants);
      nextRoom.on("trackPublished", syncRoomParticipants);
      nextRoom.on("trackUnpublished", syncRoomParticipants);
      nextRoom.on("trackSubscribed", syncRoomParticipants);
      nextRoom.on("trackUnsubscribed", syncRoomParticipants);
      nextRoom.on("connectionStateChanged", (state) => {
        setConnectionState(state);
        syncRoomParticipants();

        if (
          state === ConnectionState.Reconnecting ||
          state === ConnectionState.SignalReconnecting
        ) {
          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            setErrorMessage("Voice reconnection timed out.");
            void leaveChannel();
          }, RECONNECT_TIMEOUT_MS);
          return;
        }

        clearReconnectTimeout();
      });
      nextRoom.on("reconnected", () => {
        clearReconnectTimeout();
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
        void applyAudioPreferencesToRoom(nextRoom).catch(() => undefined);
        syncRoomParticipants();
      });
      nextRoom.on("disconnected", () => {
        setConnectionState(ConnectionState.Disconnected);
      });

      try {
        const tokenResponse = await fetchLiveKitToken({ channelId });
        supportsLiveKitCloudNoiseCancellationRef.current = isLiveKitCloudUrl(tokenResponse.url);

        if (!supportsLiveKitCloudNoiseCancellationRef.current) {
          setKrispAvailability("requires_livekit_cloud");
        } else if (krispAvailability === "requires_livekit_cloud") {
          setKrispAvailability("checking");
        }

        await nextRoom.connect(tokenResponse.url, tokenResponse.token);
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
        useVoiceStore.getState().setMuted(!hasMicrophoneAccess);
        useVoiceStore.getState().setDeafened(false);

        updateVoiceStatesCache(nextServerId, channelId, state.participants);
        startHeartbeat(sessionId);
        void nextRoom.startAudio().catch(() => undefined);
        syncRoomParticipants();

        if (!hasMicrophoneAccess) {
          setIsKrispNoiseCancellationActive(false);
          setErrorMessage(microphoneDeniedMessage);
          syncParticipants(nextRoom);
          return;
        }

        void nextRoom.localParticipant
          .setMicrophoneEnabled(
            true,
            buildAudioCaptureOptions(useVoiceStore.getState().audioPreferences),
          )
          .then(async () => {
            const localMicrophoneTrack = getLocalMicrophoneTrack(nextRoom);
            if (localMicrophoneTrack) {
              await syncKrispNoiseCancellation(
                localMicrophoneTrack,
                useVoiceStore.getState().audioPreferences.krispNoiseCancellation,
              );
            }
            appliedAudioPreferencesSignatureRef.current = getAudioPreferencesSignature(
              useVoiceStore.getState().audioPreferences,
            );
            setErrorMessage(null);
            useVoiceStore.getState().setMuted(false);
            syncParticipants(nextRoom);
          })
          .catch((error) => {
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
        setConnectionState(ConnectionState.Disconnected);
        appliedAudioPreferencesSignatureRef.current = null;
        nextRoom.removeAllListeners();
        await stopLocalTracks(nextRoom).catch(() => undefined);
        await nextRoom.disconnect(true).catch(() => undefined);
        await resetKrispProcessor();
        useVoiceStore.getState().leave();
        setErrorMessage(error instanceof Error ? error.message : "Failed to join voice channel.");
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
      clearReconnectTimeout,
      krispAvailability,
      leaveChannel,
      resetKrispProcessor,
      requestMicrophonePermission,
      startHeartbeat,
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
      return;
    }

    const nextMuted = !useVoiceStore.getState().isMuted;
    const microphoneDeniedMessage = t("voice.errors.microphoneDenied");
    const microphoneEnableFailedMessage = t("voice.errors.microphoneEnableFailed");

    if (nextMuted) {
      try {
        await activeRoom.localParticipant.setMicrophoneEnabled(false);
      } catch {
        setErrorMessage(microphoneEnableFailedMessage);
        return;
      }
      appliedAudioPreferencesSignatureRef.current = null;
      setIsKrispNoiseCancellationActive(false);
    } else {
      const nextAudioPreferences = useVoiceStore.getState().audioPreferences;

      try {
        await requestMicrophonePermission(nextAudioPreferences);
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
        await activeRoom.localParticipant.setMicrophoneEnabled(
          true,
          buildAudioCaptureOptions(nextAudioPreferences),
        );

        const localMicrophoneTrack = getLocalMicrophoneTrack(activeRoom);
        if (localMicrophoneTrack) {
          await syncKrispNoiseCancellation(
            localMicrophoneTrack,
            nextAudioPreferences.krispNoiseCancellation,
          );
        }
        appliedAudioPreferencesSignatureRef.current =
          getAudioPreferencesSignature(nextAudioPreferences);
        setErrorMessage(null);
      } catch (error) {
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
    syncParticipants(activeRoom);
  }, [requestMicrophonePermission, syncKrispNoiseCancellation, syncParticipants, t]);

  const toggleDeafen = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
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

    void applyAudioPreferencesToRoom(activeRoom).catch(() => {
      setErrorMessage(t("voice.errors.microphoneSettingsFailed"));
    });
  }, [applyAudioPreferencesToRoom, t]);

  useEffect(() => {
    return () => {
      stopHeartbeat();
      clearReconnectTimeout();
      const activeRoom = roomRef.current;
      if (activeRoom) {
        activeRoom.removeAllListeners();
        void stopScreenShare(activeRoom).catch(() => undefined);
        void stopLocalTracks(activeRoom).catch(() => undefined);
        void activeRoom.disconnect(true).catch(() => undefined);
      }
      void resetKrispProcessor();
    };
  }, [clearReconnectTimeout, resetKrispProcessor, stopHeartbeat, stopScreenShare]);

  useEffect(() => {
    const handlePageExit = () => {
      stopHeartbeat();
      clearReconnectTimeout();

      const activeRoom = roomRef.current;
      if (activeRoom) {
        void stopScreenShare(activeRoom).catch(() => undefined);
        void stopLocalTracks(activeRoom).catch(() => undefined);
        void activeRoom.disconnect(true).catch(() => undefined);
      }

      if (useVoiceStore.getState().sessionId) {
        void notifyVoiceExit();
      }
    };

    window.addEventListener("beforeunload", handlePageExit);
    window.addEventListener("pagehide", handlePageExit);
    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      window.removeEventListener("pagehide", handlePageExit);
    };
  }, [clearReconnectTimeout, stopHeartbeat, stopScreenShare]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannelId,
      audioPreferences,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingAudioPreferences,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive,
      isMuted,
      isScreenSharing,
      krispAvailability,
      participants,
      resetParticipantVolume: useVoiceStore.getState().resetParticipantVolume,
      room,
      screenShareError,
      screenShares,
      screenShareQuality,
      serverId,
      activeScreenShareId,
      setAudioPreference: useVoiceStore.getState().setAudioPreference,
      setActiveScreenShareId,
      setParticipantVolume: useVoiceStore.getState().setParticipantVolume,
      setScreenShareQuality,
      prepareForVoiceJoin,
      joinChannel,
      leaveChannel,
      stopScreenShare,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
    }),
    [
      activeChannelId,
      activeScreenShareId,
      audioPreferences,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingAudioPreferences,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive,
      isMuted,
      isScreenSharing,
      joinChannel,
      krispAvailability,
      leaveChannel,
      participants,
      prepareForVoiceJoin,
      room,
      screenShareError,
      screenShares,
      screenShareQuality,
      serverId,
      setActiveScreenShareId,
      setScreenShareQuality,
      stopScreenShare,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
    ],
  );

  return (
    <VoiceContext.Provider value={value}>
      {children}
      <VoiceAudioRenderer room={room} />
    </VoiceContext.Provider>
  );
}

export function useVoiceConnection() {
  const value = useContext(VoiceContext);

  if (!value) {
    throw new Error("useVoiceConnection must be used within VoiceProvider");
  }

  return value;
}
