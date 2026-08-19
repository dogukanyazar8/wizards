import { Track, type Participant } from "livekit-client";

export type VoiceParticipantAudioActivity = {
  audioLevel: number;
  isMuted: boolean;
  isSpeaking: boolean;
};

export type VoiceAudioLevelMonitor = {
  dispose: () => void;
  readLevel: () => number;
};

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export const VOICE_AUDIO_LEVEL_SYNC_INTERVAL_MS = 33;
export const VOICE_AUDIO_LEVEL_BROADCAST_INTERVAL_MS = 50;
export const VOICE_AUDIO_LEVEL_KEEPALIVE_BROADCAST_INTERVAL_MS = 500;
export const VOICE_AUDIO_LEVEL_CHANGE_THRESHOLD = 0.01;
export const VOICE_AUDIO_LEVEL_IDLE_THRESHOLD = 0.006;
export const VOICE_AUDIO_LEVEL_SPEAKING_THRESHOLD = 0.025;
export const VOICE_REMOTE_AUDIO_LEVEL_STALE_MS = 450;
export const LIVEKIT_CONNECT_RETRY_DELAYS_MS = [650, 1_500] as const;

export const ROOM_PARTICIPANT_SYNC_EVENTS = [
  "participantConnected",
  "participantDisconnected",
  "activeSpeakersChanged",
  "trackMuted",
  "trackUnmuted",
  "localTrackPublished",
  "localTrackUnpublished",
  "participantMetadataChanged",
  "participantNameChanged",
  "trackPublished",
  "trackUnpublished",
  "trackSubscribed",
  "trackUnsubscribed",
] as const;

type RoomParticipantSyncEvent = (typeof ROOM_PARTICIPANT_SYNC_EVENTS)[number];

export type RoomParticipantSyncEmitter = {
  off: (event: RoomParticipantSyncEvent, handler: () => void) => unknown;
  on: (event: RoomParticipantSyncEvent, handler: () => void) => unknown;
};

export type ReconnectTimeoutTimerApi<TimerHandle> = {
  clearTimeout: (handle: TimerHandle) => void;
  setTimeout: (callback: () => void, ms: number) => TimerHandle;
};

export type ReconnectTimeoutController = {
  clear: () => void;
  hasPending: () => boolean;
  schedule: (callback: () => void, ms: number) => void;
};

export function normalizeVoiceAudioLevel(audioLevel: number) {
  if (!Number.isFinite(audioLevel)) {
    return 0;
  }

  return Math.min(1, Math.max(0, audioLevel));
}

export function getParticipantAudioActivity(
  participant: Participant,
): VoiceParticipantAudioActivity {
  const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
  const isMuted = microphonePublication?.isMuted ?? !participant.isMicrophoneEnabled;
  const audioLevel = isMuted ? 0 : normalizeVoiceAudioLevel(participant.audioLevel);
  const isSpeaking =
    !isMuted &&
    audioLevel > VOICE_AUDIO_LEVEL_IDLE_THRESHOLD &&
    (participant.isSpeaking || audioLevel >= VOICE_AUDIO_LEVEL_SPEAKING_THRESHOLD);

  return {
    audioLevel,
    isMuted,
    isSpeaking,
  };
}

export function shouldUpdateParticipantAudioActivity(
  current: VoiceParticipantAudioActivity,
  next: VoiceParticipantAudioActivity,
) {
  return (
    current.isMuted !== next.isMuted ||
    current.isSpeaking !== next.isSpeaking ||
    Math.abs(current.audioLevel - next.audioLevel) >= VOICE_AUDIO_LEVEL_CHANGE_THRESHOLD
  );
}

export function createVoiceAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextConstructor =
    window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    return new AudioContextConstructor();
  } catch {
    return null;
  }
}

export function createVoiceAudioLevelMonitor(
  track: MediaStreamTrack,
  audioContext?: AudioContext | null,
): VoiceAudioLevelMonitor | null {
  if (track.readyState !== "live") {
    return null;
  }

  const ownsAudioContext = audioContext === undefined;
  const activeAudioContext = ownsAudioContext ? createVoiceAudioContext() : audioContext;
  if (!activeAudioContext) {
    return null;
  }

  try {
    const analyser = activeAudioContext.createAnalyser();
    const source = activeAudioContext.createMediaStreamSource(new MediaStream([track]));

    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.18;
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    void activeAudioContext.resume().catch(() => undefined);

    return {
      dispose: () => {
        source.disconnect();
        void activeAudioContext.close().catch(() => undefined);
      },
      readLevel: () => {
        analyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (const sample of samples) {
          const amplitude = (sample - 128) / 128;
          sum += amplitude * amplitude;
        }

        const rms = Math.sqrt(sum / samples.length);
        return normalizeVoiceAudioLevel((rms - 0.008) * 8);
      },
    };
  } catch {
    if (ownsAudioContext) {
      void activeAudioContext.close().catch(() => undefined);
    }
    return null;
  }
}

export function isTransientLiveKitConnectionError(error: unknown) {
  return (
    error instanceof Error &&
    /could not establish pc connection|ice|network|timeout|transport|signaling/i.test(error.message)
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type ConnectLiveKitRoomClient = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: (stopTracks?: boolean) => Promise<void>;
};

export type ConnectLiveKitRoomRetryOptions = {
  isTransientError?: (error: unknown) => boolean;
  retryDelaysMs?: readonly number[];
  wait?: (ms: number) => Promise<void>;
};

export async function connectLiveKitRoomWithRetry(
  room: ConnectLiveKitRoomClient,
  url: string,
  token: string,
  options: ConnectLiveKitRoomRetryOptions = {},
) {
  const retryDelaysMs = options.retryDelaysMs ?? LIVEKIT_CONNECT_RETRY_DELAYS_MS;
  const waitForRetry = options.wait ?? wait;
  const isTransientError = options.isTransientError ?? isTransientLiveKitConnectionError;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      await room.connect(url, token);
      return;
    } catch (error) {
      const retryDelay = retryDelaysMs[attempt];
      if (retryDelay === undefined || !isTransientError(error)) {
        throw error;
      }

      await room.disconnect(true).catch(() => undefined);
      await waitForRetry(retryDelay);
    }
  }
}

export function registerRoomParticipantSyncListeners(
  room: RoomParticipantSyncEmitter,
  handler: () => void,
) {
  for (const event of ROOM_PARTICIPANT_SYNC_EVENTS) {
    room.on(event, handler);
  }

  return () => {
    for (const event of ROOM_PARTICIPANT_SYNC_EVENTS) {
      room.off(event, handler);
    }
  };
}

export function createReconnectTimeoutController<TimerHandle>(
  timers: ReconnectTimeoutTimerApi<TimerHandle>,
): ReconnectTimeoutController {
  let activeTimeout: TimerHandle | null = null;

  return {
    clear() {
      if (activeTimeout === null) {
        return;
      }

      timers.clearTimeout(activeTimeout);
      activeTimeout = null;
    },
    hasPending() {
      return activeTimeout !== null;
    },
    schedule(callback: () => void, ms: number) {
      if (activeTimeout !== null) {
        timers.clearTimeout(activeTimeout);
      }

      activeTimeout = timers.setTimeout(() => {
        activeTimeout = null;
        callback();
      }, ms);
    },
  };
}
