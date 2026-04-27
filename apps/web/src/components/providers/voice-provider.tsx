"use client";

import {
  ConnectionState,
  LocalTrack,
  RemoteAudioTrack,
  Room,
  Track,
  type Participant,
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
import { useVoiceStore } from "@/store/voice-store";

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

type VoiceContextValue = {
  activeChannelId: string | null;
  connectionState: ConnectionState;
  errorMessage: string | null;
  isDeafened: boolean;
  isJoining: boolean;
  isMuted: boolean;
  participants: VoiceParticipantViewModel[];
  room: Room | null;
  serverId: string | null;
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

const RECONNECT_TIMEOUT_MS = 30_000;

const VoiceContext = createContext<VoiceContextValue | null>(null);

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

function applyRemoteAudioState(room: Room, isDeafened: boolean) {
  for (const participant of room.remoteParticipants.values()) {
    const publication = participant.getTrackPublication(Track.Source.Microphone);
    const track = publication?.track;

    if (track instanceof RemoteAudioTrack) {
      track.setVolume(isDeafened ? 0 : 1);
    }
  }
}

export function VoiceProvider({ children, currentUser }: VoiceProviderProps) {
  const queryClient = useQueryClient();
  const roomRef = useRef<Room | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinRequestRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipantViewModel[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const { activeChannelId, isDeafened, isMuted, serverId } = useVoiceStore(
    useShallow((state) => ({
      activeChannelId: state.activeChannelId,
      isDeafened: state.isDeafened,
      isMuted: state.isMuted,
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

    if (activeRoom) {
      activeRoom.removeAllListeners();
      await stopLocalTracks(activeRoom).catch(() => undefined);
      await activeRoom.disconnect(true).catch(() => undefined);
    }

    if (activeSession) {
      await deleteVoiceState().catch(() => undefined);
    }

    if (activeServer && activeChannel) {
      updateVoiceStatesCache(activeServer, activeChannel, []);
    }

    useVoiceStore.getState().leave();
  }, [clearReconnectTimeout, stopHeartbeat, updateVoiceStatesCache]);

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
      const nextRoom = new Room();
      roomRef.current = nextRoom;
      setRoom(nextRoom);

      const syncRoomParticipants = () => {
        applyRemoteAudioState(nextRoom, useVoiceStore.getState().isDeafened);
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
        syncRoomParticipants();
      });
      nextRoom.on("disconnected", () => {
        setConnectionState(ConnectionState.Disconnected);
      });

      try {
        const tokenResponse = await fetchLiveKitToken({ channelId });
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
          .setMicrophoneEnabled(true)
          .then(() => {
            useVoiceStore.getState().setMuted(false);
            syncParticipants(nextRoom);
          })
          .catch(() => {
            useVoiceStore.getState().setMuted(true);
            syncParticipants(nextRoom);
          });
      } catch (error) {
        roomRef.current = null;
        setRoom(null);
        setParticipants([]);
        setConnectionState(ConnectionState.Disconnected);
        nextRoom.removeAllListeners();
        await nextRoom.disconnect(true).catch(() => undefined);
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
      clearReconnectTimeout,
      leaveChannel,
      startHeartbeat,
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
    await activeRoom.localParticipant.setMicrophoneEnabled(!nextMuted);
    useVoiceStore.getState().setMuted(nextMuted);
    syncParticipants(activeRoom);
  }, [syncParticipants]);

  const toggleDeafen = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) {
      return;
    }

    const nextDeafened = !useVoiceStore.getState().isDeafened;
    useVoiceStore.getState().setDeafened(nextDeafened);
    applyRemoteAudioState(activeRoom, nextDeafened);
    syncParticipants(activeRoom);
  }, [syncParticipants]);

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
    };
  }, [clearReconnectTimeout, stopHeartbeat]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      stopHeartbeat();
      clearReconnectTimeout();

      const activeRoom = roomRef.current;
      if (activeRoom) {
        void stopLocalTracks(activeRoom).catch(() => undefined);
        void activeRoom.disconnect(true).catch(() => undefined);
      }

      if (useVoiceStore.getState().sessionId) {
        void fetch("/api/v1/voice/state", {
          method: "DELETE",
          keepalive: true,
        }).catch(() => undefined);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [clearReconnectTimeout, stopHeartbeat]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannelId,
      connectionState,
      errorMessage,
      isDeafened,
      isJoining,
      isMuted,
      participants,
      room,
      serverId,
      joinChannel,
      leaveChannel,
      toggleDeafen,
      toggleMute,
    }),
    [
      activeChannelId,
      connectionState,
      errorMessage,
      isDeafened,
      isJoining,
      isMuted,
      joinChannel,
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
