import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  LocalAudioTrack,
  RemoteAudioTrack,
  Track,
  type Participant,
  type Room,
} from "livekit-client";

import { getSocket } from "@/lib/socket/client";
import type { VoiceAudioLevelPayload } from "@/lib/socket/events";
import {
  VOICE_AUDIO_LEVEL_BROADCAST_INTERVAL_MS,
  VOICE_AUDIO_LEVEL_CHANGE_THRESHOLD,
  VOICE_AUDIO_LEVEL_IDLE_THRESHOLD,
  VOICE_AUDIO_LEVEL_KEEPALIVE_BROADCAST_INTERVAL_MS,
  VOICE_AUDIO_LEVEL_SPEAKING_THRESHOLD,
  VOICE_AUDIO_LEVEL_SYNC_INTERVAL_MS,
  VOICE_REMOTE_AUDIO_LEVEL_STALE_MS,
  createVoiceAudioLevelMonitor,
  getParticipantAudioActivity,
  normalizeVoiceAudioLevel,
  shouldUpdateParticipantAudioActivity,
  type VoiceAudioLevelMonitor,
  type VoiceParticipantAudioActivity,
} from "@/lib/voice/provider-lifecycle";

export type RemoteVoiceAudioLevel = VoiceParticipantAudioActivity & {
  channelId: string;
  updatedAt: number;
};

type ParticipantAudioLevelMonitorEntry = {
  monitor: VoiceAudioLevelMonitor | null;
  track: MediaStreamTrack | null;
};

export type VoiceAudioLevelParticipant = VoiceParticipantAudioActivity & {
  userId: string;
};

type UseVoiceAudioLevelsOptions<ParticipantModel extends VoiceAudioLevelParticipant> = {
  currentUserId: string;
  getVoiceState: () => {
    activeChannelId: string | null;
    serverId: string | null;
  };
  remoteAudioLevelsRef: MutableRefObject<Map<string, RemoteVoiceAudioLevel>>;
  room: Room | null;
  setParticipants: Dispatch<SetStateAction<ParticipantModel[]>>;
};

function getParticipantMicrophoneMediaStreamTrack(participant: Participant) {
  const microphoneTrack = participant.getTrackPublication(Track.Source.Microphone)?.track ?? null;

  if (microphoneTrack instanceof LocalAudioTrack || microphoneTrack instanceof RemoteAudioTrack) {
    return microphoneTrack.mediaStreamTrack;
  }

  return null;
}

export function useVoiceAudioLevels<ParticipantModel extends VoiceAudioLevelParticipant>({
  currentUserId,
  getVoiceState,
  remoteAudioLevelsRef,
  room,
  setParticipants,
}: UseVoiceAudioLevelsOptions<ParticipantModel>) {
  useEffect(() => {
    const socket = getSocket();
    const handleVoiceAudioLevelUpdate = (data: VoiceAudioLevelPayload) => {
      if (data.userId === currentUserId) {
        return;
      }

      remoteAudioLevelsRef.current.set(data.userId, {
        audioLevel: normalizeVoiceAudioLevel(data.audioLevel),
        channelId: data.channelId,
        isMuted: data.isMuted,
        isSpeaking: data.isSpeaking,
        updatedAt: performance.now(),
      });
    };

    socket.on("voice:audio-level:update", handleVoiceAudioLevelUpdate);

    return () => {
      socket.off("voice:audio-level:update", handleVoiceAudioLevelUpdate);
    };
  }, [currentUserId, remoteAudioLevelsRef]);

  useEffect(() => {
    if (!room || typeof window === "undefined") {
      return;
    }

    let animationFrameId = 0;
    let lastSyncAt = 0;
    let lastAudioLevelBroadcastAt = 0;
    let lastBroadcastAudioActivity: VoiceParticipantAudioActivity | null = null;
    const audioLevelMonitors = new Map<string, ParticipantAudioLevelMonitorEntry>();

    const disposeAudioLevelMonitor = (participantId: string) => {
      const currentMonitor = audioLevelMonitors.get(participantId);
      currentMonitor?.monitor?.dispose();
      audioLevelMonitors.delete(participantId);
    };

    const pruneAudioLevelMonitors = (liveParticipantIds: Set<string>) => {
      for (const participantId of audioLevelMonitors.keys()) {
        if (!liveParticipantIds.has(participantId)) {
          disposeAudioLevelMonitor(participantId);
        }
      }
    };

    const getAudioLevelMonitor = (participant: Participant) => {
      const nextTrack = getParticipantMicrophoneMediaStreamTrack(participant);
      const currentMonitor = audioLevelMonitors.get(participant.identity);
      if (currentMonitor?.track === nextTrack) {
        return currentMonitor.monitor;
      }

      currentMonitor?.monitor?.dispose();

      const nextMonitor = nextTrack ? createVoiceAudioLevelMonitor(nextTrack) : null;
      audioLevelMonitors.set(participant.identity, {
        monitor: nextMonitor,
        track: nextTrack,
      });
      return nextMonitor;
    };

    const getRecentRemoteAudioActivity = (
      participantId: string,
      timestamp: number,
    ): VoiceParticipantAudioActivity | null => {
      const remoteAudioLevel = remoteAudioLevelsRef.current.get(participantId);
      if (!remoteAudioLevel) {
        return null;
      }

      if (timestamp - remoteAudioLevel.updatedAt > VOICE_REMOTE_AUDIO_LEVEL_STALE_MS) {
        remoteAudioLevelsRef.current.delete(participantId);
        return null;
      }

      if (remoteAudioLevel.channelId !== getVoiceState().activeChannelId) {
        return null;
      }

      return {
        audioLevel: remoteAudioLevel.audioLevel,
        isMuted: remoteAudioLevel.isMuted,
        isSpeaking: remoteAudioLevel.isSpeaking,
      };
    };

    const resolveParticipantAudioActivity = (
      participant: Participant,
      timestamp: number,
    ): VoiceParticipantAudioActivity => {
      const audioActivity = getParticipantAudioActivity(participant);
      if (audioActivity.isMuted) {
        disposeAudioLevelMonitor(participant.identity);
        return audioActivity;
      }

      if (participant.identity !== room.localParticipant.identity) {
        const remoteAudioActivity = getRecentRemoteAudioActivity(participant.identity, timestamp);
        if (remoteAudioActivity) {
          return remoteAudioActivity;
        }
      }

      const measuredAudioLevel =
        getAudioLevelMonitor(participant)?.readLevel() ?? audioActivity.audioLevel;

      return {
        ...audioActivity,
        audioLevel: measuredAudioLevel,
        isSpeaking:
          measuredAudioLevel > VOICE_AUDIO_LEVEL_IDLE_THRESHOLD &&
          (audioActivity.isSpeaking || measuredAudioLevel >= VOICE_AUDIO_LEVEL_SPEAKING_THRESHOLD),
      };
    };

    const emitLocalAudioActivity = (
      audioActivity: VoiceParticipantAudioActivity,
      timestamp: number,
    ) => {
      if (timestamp - lastAudioLevelBroadcastAt < VOICE_AUDIO_LEVEL_BROADCAST_INTERVAL_MS) {
        return;
      }

      const shouldBroadcast =
        !lastBroadcastAudioActivity ||
        lastBroadcastAudioActivity.isMuted !== audioActivity.isMuted ||
        lastBroadcastAudioActivity.isSpeaking !== audioActivity.isSpeaking ||
        Math.abs(lastBroadcastAudioActivity.audioLevel - audioActivity.audioLevel) >=
          VOICE_AUDIO_LEVEL_CHANGE_THRESHOLD;
      const shouldSendKeepAlive =
        !audioActivity.isMuted &&
        (audioActivity.isSpeaking ||
          audioActivity.audioLevel > VOICE_AUDIO_LEVEL_SPEAKING_THRESHOLD) &&
        timestamp - lastAudioLevelBroadcastAt >= VOICE_AUDIO_LEVEL_KEEPALIVE_BROADCAST_INTERVAL_MS;

      if (!shouldBroadcast && !shouldSendKeepAlive) {
        return;
      }

      const voiceState = getVoiceState();
      if (!voiceState.activeChannelId || !voiceState.serverId) {
        return;
      }

      lastAudioLevelBroadcastAt = timestamp;
      lastBroadcastAudioActivity = audioActivity;
      getSocket().emit("voice:audio-level:update", {
        audioLevel: audioActivity.audioLevel,
        channelId: voiceState.activeChannelId,
        isMuted: audioActivity.isMuted,
        isSpeaking: audioActivity.isSpeaking,
        serverId: voiceState.serverId,
      });
    };

    const syncAudioLevels = (timestamp: number) => {
      if (timestamp - lastSyncAt >= VOICE_AUDIO_LEVEL_SYNC_INTERVAL_MS) {
        lastSyncAt = timestamp;

        const liveParticipants = new Map<string, Participant>();
        liveParticipants.set(room.localParticipant.identity, room.localParticipant);
        room.remoteParticipants.forEach((participant) => {
          liveParticipants.set(participant.identity, participant);
        });

        pruneAudioLevelMonitors(new Set(liveParticipants.keys()));

        const localAudioActivity = resolveParticipantAudioActivity(
          room.localParticipant,
          timestamp,
        );
        emitLocalAudioActivity(localAudioActivity, timestamp);

        setParticipants((currentParticipants) => {
          let hasChanges = false;
          const nextParticipants = currentParticipants.map((participant) => {
            const liveParticipant = liveParticipants.get(participant.userId);

            if (!liveParticipant) {
              return participant;
            }

            const nextAudioActivity =
              liveParticipant.identity === room.localParticipant.identity
                ? localAudioActivity
                : resolveParticipantAudioActivity(liveParticipant, timestamp);

            if (!shouldUpdateParticipantAudioActivity(participant, nextAudioActivity)) {
              return participant;
            }

            hasChanges = true;
            return {
              ...participant,
              ...nextAudioActivity,
            };
          });

          return hasChanges ? nextParticipants : currentParticipants;
        });
      }

      animationFrameId = window.requestAnimationFrame(syncAudioLevels);
    };

    animationFrameId = window.requestAnimationFrame(syncAudioLevels);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      for (const monitorEntry of audioLevelMonitors.values()) {
        monitorEntry.monitor?.dispose();
      }
      audioLevelMonitors.clear();
    };
  }, [getVoiceState, remoteAudioLevelsRef, room, setParticipants]);
}
