"use client";

import {
  ConnectionState,
  type AudioProcessorOptions,
  LocalAudioTrack,
  LocalTrack,
  Room,
  Track,
  type AudioCaptureOptions,
  type Participant,
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
import { VoiceAudioRenderer } from "@/components/voice/voice-audio-renderer";
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
  krispAvailability: KrispAvailability;
  participants: VoiceParticipantViewModel[];
  resetParticipantVolume: (userId: string) => void;
  room: Room | null;
  serverId: string | null;
  setAudioPreference: <Key extends keyof VoiceAudioPreferences>(
    key: Key,
    value: VoiceAudioPreferences[Key],
  ) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  joinChannel: (input: { channelId: string; serverId: string }) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleMute: () => Promise<void>;
};

type ParticipantMetadata = {
  avatarUrl?: string | null;
  displayName?: string | null;
  username?: string | null;
};

const NEXT_PUBLIC_LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "";
const RECONNECT_TIMEOUT_MS = 30_000;

const VoiceContext = createContext<VoiceContextValue | null>(null);

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

function mapVoiceStateCache(
  states: VoiceChannelStateDTO[] | undefined,
  channelId: string,
  participants: Array<{
    avatarUrl: string | null;
    displayName: string | null;
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
  const queryClient = useQueryClient();
  const roomRef = useRef<Room | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinRequestRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const krispProcessorRef = useRef<KrispNoiseFilterProcessor | null>(null);
  const supportsLiveKitCloudNoiseCancellationRef = useRef(
    isLiveKitCloudUrl(NEXT_PUBLIC_LIVEKIT_URL),
  );
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantViewModel[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isApplyingAudioPreferences, setIsApplyingAudioPreferences] = useState(false);
  const [isKrispNoiseCancellationActive, setIsKrispNoiseCancellationActive] = useState(false);
  const [krispAvailability, setKrispAvailability] = useState<KrispAvailability>(
    supportsLiveKitCloudNoiseCancellationRef.current ? "checking" : "requires_livekit_cloud",
  );

  const {
    activeChannelId,
    audioPreferences,
    isDeafened,
    isMuted,
    participantVolumes,
    serverId,
  } = useVoiceStore(
    useShallow((state) => ({
      activeChannelId: state.activeChannelId,
      audioPreferences: state.audioPreferences,
      isDeafened: state.isDeafened,
      isMuted: state.isMuted,
      participantVolumes: state.participantVolumes,
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

  const updateVoiceStatesCache = useCallback(
    (
      targetServerId: string,
      targetChannelId: string,
      nextParticipants: Array<{
        avatarUrl: string | null;
        displayName: string | null;
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
      }, VOICE_HEARTBEAT_INTERVAL_MS);
    },
    [stopHeartbeat],
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

      setIsApplyingAudioPreferences(true);

      try {
        await localMicrophoneTrack.restartTrack(buildAudioCaptureOptions(audioPreferences));
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

  const leaveChannel = useCallback(async () => {
    stopHeartbeat();
    clearReconnectTimeout();
    joinRequestRef.current = null;

    const activeSession = useVoiceStore.getState().sessionId;
    const activeServer = useVoiceStore.getState().serverId;
    const activeChannel = useVoiceStore.getState().activeChannelId;
    const activeRoom = roomRef.current;

    roomRef.current = null;
    setRoom(null);
    setParticipants([]);
    setConnectionState(ConnectionState.Disconnected);
    setErrorMessage(null);

    if (activeRoom) {
      activeRoom.removeAllListeners();
      await stopLocalTracks(activeRoom).catch(() => undefined);
      await activeRoom.disconnect(true).catch(() => undefined);
    }

    if (activeSession) {
      await deleteVoiceState().catch(() => undefined);
    }

    await resetKrispProcessor();

    if (activeServer && activeChannel) {
      updateVoiceStatesCache(activeServer, activeChannel, []);
    }

    useVoiceStore.getState().leave();
  }, [clearReconnectTimeout, resetKrispProcessor, stopHeartbeat, updateVoiceStatesCache]);

  const joinChannel = useCallback(
    async ({ channelId, serverId: nextServerId }: { channelId: string; serverId: string }) => {
      const currentState = useVoiceStore.getState();
      const nextJoinKey = `${nextServerId}:${channelId}`;

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
        useVoiceStore.getState().setMuted(true);
        useVoiceStore.getState().setDeafened(false);

        updateVoiceStatesCache(nextServerId, channelId, state.participants);
        startHeartbeat(sessionId);
        void nextRoom.startAudio().catch(() => undefined);
        syncRoomParticipants();
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
            useVoiceStore.getState().setMuted(false);
            syncParticipants(nextRoom);
          })
          .catch(() => {
            setIsKrispNoiseCancellationActive(false);
            useVoiceStore.getState().setMuted(true);
            syncParticipants(nextRoom);
          });
      } catch (error) {
        roomRef.current = null;
        setRoom(null);
        setParticipants([]);
        setConnectionState(ConnectionState.Disconnected);
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
      startHeartbeat,
      syncKrispNoiseCancellation,
      syncParticipants,
      updateVoiceStatesCache,
    ],
  );

  const toggleMute = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    const nextMuted = !useVoiceStore.getState().isMuted;

    if (nextMuted) {
      await activeRoom.localParticipant.setMicrophoneEnabled(false);
      setIsKrispNoiseCancellationActive(false);
    } else {
      await activeRoom.localParticipant.setMicrophoneEnabled(
        true,
        buildAudioCaptureOptions(useVoiceStore.getState().audioPreferences),
      );

      const localMicrophoneTrack = getLocalMicrophoneTrack(activeRoom);
      if (localMicrophoneTrack) {
        await syncKrispNoiseCancellation(
          localMicrophoneTrack,
          useVoiceStore.getState().audioPreferences.krispNoiseCancellation,
        );
      }
    }

    useVoiceStore.getState().setMuted(nextMuted);
    syncParticipants(activeRoom);
  }, [syncKrispNoiseCancellation, syncParticipants]);

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
      setErrorMessage("Microphone settings could not be updated.");
    });
  }, [applyAudioPreferencesToRoom]);

  useEffect(() => {
    return () => {
      stopHeartbeat();
      clearReconnectTimeout();
      const activeRoom = roomRef.current;
      if (activeRoom) {
        activeRoom.removeAllListeners();
        void stopLocalTracks(activeRoom).catch(() => undefined);
        void activeRoom.disconnect(true).catch(() => undefined);
      }
      void resetKrispProcessor();
    };
  }, [clearReconnectTimeout, resetKrispProcessor, stopHeartbeat]);

  useEffect(() => {
    const handlePageExit = () => {
      stopHeartbeat();
      clearReconnectTimeout();

      const activeRoom = roomRef.current;
      if (activeRoom) {
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
  }, [clearReconnectTimeout, stopHeartbeat]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannelId,
      audioPreferences,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingAudioPreferences,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive,
      isMuted,
      krispAvailability,
      participants,
      resetParticipantVolume: useVoiceStore.getState().resetParticipantVolume,
      room,
      serverId,
      setAudioPreference: useVoiceStore.getState().setAudioPreference,
      setParticipantVolume: useVoiceStore.getState().setParticipantVolume,
      joinChannel,
      leaveChannel,
      toggleDeafen,
      toggleMute,
    }),
    [
      activeChannelId,
      audioPreferences,
      connectionState,
      errorMessage,
      getParticipantVolume,
      isApplyingAudioPreferences,
      isDeafened,
      isJoining,
      isKrispNoiseCancellationActive,
      isMuted,
      joinChannel,
      krispAvailability,
      leaveChannel,
      participants,
      room,
      serverId,
      toggleDeafen,
      toggleMute,
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
