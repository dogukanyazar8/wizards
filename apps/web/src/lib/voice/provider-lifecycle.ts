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
export const LIVEKIT_LOCAL_PARTICIPANT_PROFILE_RETRY_DELAYS_MS = [500, 1_500] as const;

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

export function getParticipantAudioActivity(participant: Participant): VoiceParticipantAudioActivity {
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

export function createVoiceAudioLevelMonitor(track: MediaStreamTrack): VoiceAudioLevelMonitor | null {
  if (typeof window === "undefined" || track.readyState !== "live") {
    return null;
  }

  const AudioContextConstructor =
    window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  try {
    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));

    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.18;
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    void audioContext.resume().catch(() => undefined);

    return {
      dispose: () => {
        source.disconnect();
        void audioContext.close().catch(() => undefined);
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

export type LiveKitLocalParticipantProfileClient = {
  metadata?: string | null;
  name?: string | null;
  setMetadata: (metadata: string) => Promise<void>;
  setName: (name: string) => Promise<void>;
};

export type LiveKitLocalParticipantProfile = {
  metadata: string;
  name: string;
};

export type LiveKitLocalParticipantProfileFieldSync =
  | { status: "failed"; error: unknown }
  | { status: "skipped" | "unchanged" | "updated" };

export type LiveKitLocalParticipantProfileSyncResult = {
  metadata: LiveKitLocalParticipantProfileFieldSync;
  name: LiveKitLocalParticipantProfileFieldSync;
};

export type SyncLiveKitLocalParticipantProfileOptions = {
  isTransientError?: (error: unknown) => boolean;
  retryDelaysMs?: readonly number[];
  shouldContinue?: () => boolean;
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

export function isTransientLiveKitSignalRequestError(error: unknown) {
  return (
    error instanceof Error &&
    /network|reconnect|request.*timed out|signal|timeout|transport|timed out/i.test(
      error.message,
    )
  );
}

async function syncLiveKitLocalParticipantProfileField(
  apply: () => Promise<void>,
  options: Required<SyncLiveKitLocalParticipantProfileOptions>,
): Promise<LiveKitLocalParticipantProfileFieldSync> {
  for (let attempt = 0; ; attempt += 1) {
    if (!options.shouldContinue()) {
      return { status: "skipped" };
    }

    try {
      await apply();
      return { status: "updated" };
    } catch (error) {
      const retryDelay = options.retryDelaysMs[attempt];
      if (!options.shouldContinue()) {
        return { status: "skipped" };
      }

      if (retryDelay === undefined || !options.isTransientError(error)) {
        return { status: "failed", error };
      }

      await options.wait(retryDelay);
    }
  }
}

export async function syncLiveKitLocalParticipantProfile(
  participant: LiveKitLocalParticipantProfileClient,
  profile: LiveKitLocalParticipantProfile,
  options: SyncLiveKitLocalParticipantProfileOptions = {},
): Promise<LiveKitLocalParticipantProfileSyncResult> {
  const syncOptions: Required<SyncLiveKitLocalParticipantProfileOptions> = {
    isTransientError: options.isTransientError ?? isTransientLiveKitSignalRequestError,
    retryDelaysMs:
      options.retryDelaysMs ?? LIVEKIT_LOCAL_PARTICIPANT_PROFILE_RETRY_DELAYS_MS,
    shouldContinue: options.shouldContinue ?? (() => true),
    wait: options.wait ?? wait,
  };

  const result: LiveKitLocalParticipantProfileSyncResult = {
    metadata:
      participant.metadata === profile.metadata
        ? { status: "unchanged" }
        : await syncLiveKitLocalParticipantProfileField(
            () => participant.setMetadata(profile.metadata),
            syncOptions,
          ),
    name:
      participant.name === profile.name
        ? { status: "unchanged" }
        : await syncLiveKitLocalParticipantProfileField(
            () => participant.setName(profile.name),
            syncOptions,
          ),
  };

  return result;
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
