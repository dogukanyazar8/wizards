import { setAudioModeAsync } from "expo-audio";

/**
 * Who is allowed to make noise, and under which audio session.
 *
 * Voice notes used to play only sometimes, and the reason was the session
 * category rather than the player: the app configured the audio mode for
 * *recording* and never for playback. `setAudioModeAsync` takes a whole mode,
 * not a patch, so the recorder's own "I am done" call
 * (`{ allowsRecording: false }`) reset `playsInSilentMode` to its default —
 * `false` on iOS. That drops the session into `ambient`, which the ring switch
 * silences; on Android the native `play()` is a no-op outright while the ringer
 * is silent or on vibrate. A voice note is speech the user asked to hear, so
 * playback arms `playsInSilentMode` before it starts a player, exactly like
 * every other messenger.
 */
const PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  // A voice note is short and spoken: ducking a podcast is friendlier than
  // stopping it, and it keeps the session out of the recorder's exclusive mode.
  interruptionMode: "duckOthers",
  playsInSilentMode: true,
  shouldPlayInBackground: false,
} as const;

let playbackModePromise: Promise<void> | null = null;

/**
 * Applies the playback audio mode once per app run. A failed attempt is not
 * cached: the next play retries rather than inheriting a session nobody
 * configured.
 */
export function ensureMobilePlaybackAudioMode(): Promise<void> {
  playbackModePromise ??= setAudioModeAsync(PLAYBACK_AUDIO_MODE).catch(() => {
    playbackModePromise = null;
  });

  return playbackModePromise;
}

/**
 * Called by the recorder around a take: recording owns the session while it
 * runs, so the next play has to re-apply the playback mode instead of trusting
 * the cached one.
 */
export function invalidateMobilePlaybackAudioMode(): void {
  playbackModePromise = null;
}

type MobileVoicePlaybackHandle = {
  readonly pause: () => void;
};

let activeVoicePlayback: MobileVoicePlaybackHandle | null = null;

/**
 * One voice note at a time. Two players talking over each other is never what a
 * tap on a second bubble meant, and on iOS the second `play()` would otherwise
 * share the session with the first.
 */
export function claimMobileVoicePlayback(handle: MobileVoicePlaybackHandle): void {
  if (activeVoicePlayback && activeVoicePlayback !== handle) {
    activeVoicePlayback.pause();
  }

  activeVoicePlayback = handle;
}

export function releaseMobileVoicePlayback(handle: MobileVoicePlaybackHandle): void {
  if (activeVoicePlayback === handle) {
    activeVoicePlayback = null;
  }
}
