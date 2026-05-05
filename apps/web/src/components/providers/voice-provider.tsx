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
import {
  WHISPR_DESKTOP_BEFORE_CLOSE_EVENT,
  isWhisprDesktopRuntime,
} from "@/lib/desktop/runtime";
import { logError } from "@/lib/logger";
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
  DEFAULT_AUDIO_DEVICE_ID,
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
const E2E_VOICE_HEARTBEAT_INTERVAL_MS = 10_000;
const E2E_MICROPHONE_DENIED_KEY = "whispr:e2e:deny-microphone";
const E2E_SCREEN_SHARE_DENIED_KEY = "whispr:e2e:deny-screen-share";
const KRISP_PROCESSOR_NAME = "livekit-noise-filter";

const VoiceContext = createContext<VoiceContextValue | null>(null);

function isE2EVoiceMockEnabled() {
  return (
    process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

function getE2EFlag(key: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "true";
}

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

function isMicrophoneDeviceUnavailable(error: unknown) {
  if (error instanceof DOMException) {
    return (
      error.name === "AbortError" ||
      error.name === "NotFoundError" ||
      error.name === "NotReadableError" ||
      error.name === "OverconstrainedError"
    );
  }

  return (
    error instanceof Error &&
    /aborterror|notfounderror|notreadableerror|overconstrainederror|could not start audio source|device not found|requested device not found|audio input device/i.test(
      error.message,
    )
  );
}

async function getMicrophonePermissionState() {
  if (typeof navigator === "undefined" || !("permissions" in navigator)) {
    return null;
  }

  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
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
  const options: AudioCaptureOptions = {
    autoGainControl: audioPreferences.autoGainControl,
    echoCancellation: audioPreferences.echoCancellation,
    noiseSuppression: audioPreferences.noiseSuppression,
  };

  if (audioPreferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID) {
    options.deviceId = audioPreferences.inputDeviceId;
  }

  return options;
}

function getAudioPreferencesSignature(audioPreferences: VoiceAudioPreferences) {
  return [
    audioPreferences.autoGainControl,
    audioPreferences.echoCancellation,
    audioPreferences.inputDeviceId,
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

function notifyVoiceExit() {
  return fetch("/api/v1/voice/state", {
    method: "DELETE",
    keepalive: true,
  }).catch(() => undefined);
}

function mapE2EVoiceParticipants(
  currentUser: VoiceProviderProps["currentUser"],
  participants: VoiceChannelStateDTO["participants"],
  isMuted: boolean,
): VoiceParticipantViewModel[] {
  return participants.map((participant) => ({
    avatarUrl: participant.avatarUrl,
    displayName: participant.displayName,
    isLocal: participant.userId === currentUser.id,
    isMuted: participant.userId === currentUser.id ? isMuted : false,
    isSpeaking: false,
    userId: participant.userId,
    username: participant.username,
  }));
}

function E2EVoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantViewModel[]>([]);
  const [screenShares, setScreenShares] = useState<VoiceScreenShareViewModel[]>([]);
  const [activeScreenShareId, setActiveScreenShareIdState] = useState<string | null>(null);
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

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(
    (sessionId: string) => {
      stopHeartbeat();
      heartbeatRef.current = setInterval(() => {
        void sendVoiceHeartbeat(sessionId).catch(() => undefined);
      }, E2E_VOICE_HEARTBEAT_INTERVAL_MS);
    },
    [stopHeartbeat],
  );

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
          useVoiceStore.getState().isMuted,
        ),
      );
    },
    [currentUser],
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
          mapVoiceScreenShareStateCache(
            current,
            targetChannelId,
            currentUser.id,
            isSharing,
          ),
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

  const leaveChannel = useCallback(async () => {
    const store = useVoiceStore.getState();
    const targetChannelId = store.activeChannelId;
    const targetServerId = store.serverId;

    stopHeartbeat();
    await stopScreenShare();
    setParticipants([]);
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage(null);

    if (store.sessionId) {
      await deleteVoiceState().catch(() => undefined);
    }

    if (targetServerId && targetChannelId) {
      setVoiceStateCache(targetServerId, targetChannelId, []);
    }

    store.leave();
  }, [setVoiceStateCache, stopHeartbeat, stopScreenShare]);

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
        setErrorMessage(
          error instanceof Error ? error.message : t("voice.view.errorTitle"),
        );
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
        participant.isLocal ? { ...participant, isMuted: nextMuted } : participant,
      ),
    );
  }, []);

  const toggleDeafen = useCallback(async () => {
    useVoiceStore.getState().setDeafened(!useVoiceStore.getState().isDeafened);
  }, []);

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
      setErrorMessage(message);
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
  }, [currentUser, emitScreenShareState, stopScreenShare, t]);

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
        void notifyVoiceExit();
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

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannelId,
      audioPreferences,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingAudioPreferences: false,
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive: false,
      isMuted,
      isScreenSharing,
      krispAvailability: "requires_livekit_cloud",
      participants,
      resetParticipantVolume: useVoiceStore.getState().resetParticipantVolume,
      room: null,
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
      isApplyingScreenShareQuality,
      isDeafened,
      isJoining,
      isMuted,
      isScreenSharing,
      joinChannel,
      leaveChannel,
      participants,
      prepareForVoiceJoin,
      screenShareError,
      screenShareQuality,
      screenShares,
      serverId,
      setActiveScreenShareId,
      setScreenShareQuality,
      stopScreenShare,
      toggleDeafen,
      toggleMute,
      toggleScreenShare,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

function LiveVoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isDesktopRuntime = useMemo(isWhisprDesktopRuntime, []);
  const roomRef = useRef<Room | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinRequestRef = useRef<string | null>(null);
  const preparedMicrophoneAccessRef = useRef<boolean | null>(null);
  const appliedAudioPreferencesSignatureRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const krispProcessorRef = useRef<KrispNoiseFilterProcessor | null>(null);
  const lastEmittedScreenShareStateRef = useRef<boolean | null>(null);
  const cleanupVoiceResourcesRef = useRef<() => void>(() => undefined);
  const microphoneSettingsFailedMessageRef = useRef(
    t("voice.errors.microphoneSettingsFailed"),
  );
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

  useEffect(() => {
    microphoneSettingsFailedMessageRef.current = t("voice.errors.microphoneSettingsFailed");
  }, [t]);
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
    async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return false;
      }

      const permissionState = await getMicrophonePermissionState();
      if (permissionState === "denied") {
        return false;
      }

      return true;
    },
    [],
  );

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
        quality: "medium",
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

      try {
        const processor = await getOrCreateKrispProcessor();
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
      } catch (error) {
        // Krisp is an enhancement; keep the published microphone alive and fall back to WebRTC.
        logError("[voice] Krisp noise cancellation failed", error);
        await detachKrispNoiseCancellation(track);
        setKrispAvailability("unavailable");
        setIsKrispNoiseCancellationActive(false);
        return false;
      }
    },
    [detachKrispNoiseCancellation, getOrCreateKrispProcessor],
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

        if (!shouldRetryWithDefaultDevice) {
          throw error;
        }

        logError("[voice] Selected microphone unavailable, retrying system default", error);
        const fallbackPreferences = {
          ...preferences,
          inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
        };

        useVoiceStore
          .getState()
          .setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);

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
          try {
            await localMicrophoneTrack.restartTrack(buildAudioCaptureOptions(audioPreferences));
            appliedAudioPreferencesSignatureRef.current = nextSignature;
          } catch (error) {
            const shouldRetryWithDefaultDevice =
              audioPreferences.inputDeviceId !== DEFAULT_AUDIO_DEVICE_ID &&
              isMicrophoneDeviceUnavailable(error);

            if (!shouldRetryWithDefaultDevice) {
              throw error;
            }

            logError("[voice] Microphone restart failed, retrying system default", error);
            const fallbackPreferences = {
              ...audioPreferences,
              inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
            };

            useVoiceStore
              .getState()
              .setAudioPreference("inputDeviceId", DEFAULT_AUDIO_DEVICE_ID);
            await localMicrophoneTrack.restartTrack(
              buildAudioCaptureOptions(fallbackPreferences),
            );
            appliedAudioPreferencesSignatureRef.current =
              getAudioPreferencesSignature(fallbackPreferences);
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
      const message = isDesktopRuntime
        ? t("screenShare.errors.notSupportedDesktop")
        : t("screenShare.errors.notSupported");
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
        ? isDesktopRuntime
          ? t("screenShare.errors.permissionDeniedDesktop")
          : t("screenShare.errors.permissionDenied")
        : error instanceof Error
          ? error.message
          : t("screenShare.errors.startFailed");

      useVoiceStore.getState().setScreenShareError(message);
      setErrorMessage(message);
      await stopScreenShare(activeRoom).catch(() => undefined);
    }
  }, [isDesktopRuntime, stopScreenShare, syncScreenShares, t]);

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
      const microphoneDeniedMessage = isDesktopRuntime
        ? t("voice.errors.microphoneDeniedDesktop")
        : t("voice.errors.microphoneDenied");
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

        void enableLocalMicrophone(
          nextRoom,
          useVoiceStore.getState().audioPreferences,
        )
          .then(async ({ preferences, track: localMicrophoneTrack }) => {
            if (localMicrophoneTrack) {
              await syncKrispNoiseCancellation(
                localMicrophoneTrack,
                preferences.krispNoiseCancellation,
              );
            }
            appliedAudioPreferencesSignatureRef.current =
              getAudioPreferencesSignature(preferences);
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
      enableLocalMicrophone,
      isDesktopRuntime,
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
    const microphoneDeniedMessage = isDesktopRuntime
      ? t("voice.errors.microphoneDeniedDesktop")
      : t("voice.errors.microphoneDenied");
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
        appliedAudioPreferencesSignatureRef.current =
          getAudioPreferencesSignature(preferences);
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
      setErrorMessage(microphoneSettingsFailedMessageRef.current);
    });
  }, [applyAudioPreferencesToRoom]);

  const cleanupVoiceResources = useCallback(() => {
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
  }, [clearReconnectTimeout, resetKrispProcessor, stopHeartbeat, stopScreenShare]);

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
        void stopLocalTracks(activeRoom).catch(() => undefined);
        void activeRoom.disconnect(true).catch(() => undefined);
      }

      if (useVoiceStore.getState().sessionId) {
        void notifyVoiceExit();
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
    stopHeartbeat,
    stopScreenShare,
  ]);

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
      <VoiceAudioRenderer
        outputDeviceId={audioPreferences.outputDeviceId}
        room={room}
      />
    </VoiceContext.Provider>
  );
}

export function VoiceProvider(props: VoiceProviderProps) {
  if (isE2EVoiceMockEnabled()) {
    return <E2EVoiceProvider {...props} />;
  }

  return <LiveVoiceProvider {...props} />;
}

export function useVoiceConnection() {
  const value = useContext(VoiceContext);

  if (!value) {
    throw new Error("useVoiceConnection must be used within VoiceProvider");
  }

  return value;
}
