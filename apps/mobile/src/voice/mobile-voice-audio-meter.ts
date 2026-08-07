/**
 * On-device speaking detection for the voice room.
 *
 * `participant.isSpeaking` from livekit-client is purely server-derived: the SFU
 * audio-level observer samples on `audio.update_interval` (400ms by default) and
 * smooths the result over `audio.smooth_intervals`, so an avatar ring bound to it
 * lights up roughly half a second to a second after the person starts talking.
 * The browser client works around this by running its own Web Audio analyser;
 * React Native has no Web Audio, but the WebRTC stats report already carries a
 * per-track audio level, so the same measurement is one stats read away.
 *
 * Everything here is pure so the thresholds can be exercised without a room.
 */

/** Attack threshold, ~-35 dBov: the level LiveKit itself treats as "active". */
export const MOBILE_VOICE_SPEAKING_ATTACK_LEVEL = 0.018;
/** Release threshold, ~-43 dBov: below this the mic is carrying room noise. */
export const MOBILE_VOICE_SPEAKING_RELEASE_LEVEL = 0.007;
/**
 * How long the level has to stay under the release threshold before the ring
 * goes out. Speech dips to silence between syllables; without a hold the ring
 * strobes on every consonant.
 */
export const MOBILE_VOICE_SPEAKING_RELEASE_HOLD_MS = 220;
/**
 * A measurement older than this is discarded and the LiveKit value takes over
 * again, so a participant whose stats stopped arriving cannot stay lit forever.
 */
export const MOBILE_VOICE_AUDIO_ACTIVITY_STALE_MS = 450;

export type MobileVoiceAudioActivity = {
  readonly audioLevel: number;
  readonly isSpeaking: boolean;
  /** Last tick whose level cleared the release threshold; drives the hold. */
  readonly loudAt: number;
  readonly updatedAt: number;
};

export type MobileVoiceAudioLevelDirection = "inbound" | "outbound";

/**
 * The shape both `RTCStatsReport` and the `Map` react-native-webrtc resolves
 * from `getStats()` satisfy.
 */
export type MobileVoiceAudioStatsReport = {
  forEach: (callback: (value: unknown, key: string) => void) => void;
};

function getNumberProperty(entry: Record<string, unknown>, key: string): number | null {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringProperty(entry: Record<string, unknown>, key: string): string | null {
  const value = entry[key];
  return typeof value === "string" ? value : null;
}

function isAudioEntry(entry: Record<string, unknown>): boolean {
  // libwebrtc reports `kind`; older reports (and the legacy `track` stats) use
  // `mediaType`. An entry that names neither is only accepted as a fallback.
  const kind = getStringProperty(entry, "kind") ?? getStringProperty(entry, "mediaType");
  return kind === null || kind === "audio";
}

function getAudioLevelEntryRank(
  entry: Record<string, unknown>,
  direction: MobileVoiceAudioLevelDirection,
): number {
  const type = getStringProperty(entry, "type");
  if (type === null || !isAudioEntry(entry)) {
    return 0;
  }

  if (direction === "outbound") {
    // `media-source` is the capture-side level: it is what the microphone hears
    // right now, before packetization, which is exactly the local ring's input.
    if (type === "media-source") {
      return 3;
    }

    if (type === "outbound-rtp") {
      return 2;
    }
  } else if (type === "inbound-rtp") {
    return 3;
  }

  // The deprecated `track` stats still carry audioLevel on some platforms.
  return type === "track" ? 1 : 0;
}

/**
 * Pulls the highest-confidence `audioLevel` (0..1 linear amplitude) out of a
 * stats report. Returns null when the platform reports no level at all, which
 * leaves the caller on the LiveKit value rather than forcing a false silence.
 */
export function readMobileVoiceAudioLevel(
  report: MobileVoiceAudioStatsReport | null | undefined,
  direction: MobileVoiceAudioLevelDirection,
): number | null {
  if (!report) {
    return null;
  }

  let bestRank = 0;
  let bestLevel: number | null = null;

  report.forEach((value) => {
    if (typeof value !== "object" || value === null) {
      return;
    }

    const entry = value as Record<string, unknown>;
    const rank = getAudioLevelEntryRank(entry, direction);
    if (rank <= bestRank) {
      return;
    }

    const audioLevel = getNumberProperty(entry, "audioLevel");
    if (audioLevel === null) {
      return;
    }

    bestRank = rank;
    bestLevel = Math.max(0, Math.min(1, audioLevel));
  });

  return bestLevel;
}

/**
 * Advances one participant's speaking state. Rising past the attack threshold
 * turns the ring on within a single tick; falling back only turns it off once
 * the level has stayed under the release threshold for the hold window.
 */
export function measureMobileVoiceAudioActivity({
  isMuted,
  level,
  now,
  previous,
}: {
  isMuted: boolean;
  level: number;
  now: number;
  previous?: MobileVoiceAudioActivity | undefined;
}): MobileVoiceAudioActivity {
  if (isMuted) {
    return { audioLevel: 0, isSpeaking: false, loudAt: 0, updatedAt: now };
  }

  const audioLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;

  if (audioLevel >= MOBILE_VOICE_SPEAKING_ATTACK_LEVEL) {
    return { audioLevel, isSpeaking: true, loudAt: now, updatedAt: now };
  }

  const wasSpeaking = previous?.isSpeaking ?? false;

  if (audioLevel >= MOBILE_VOICE_SPEAKING_RELEASE_LEVEL) {
    return { audioLevel, isSpeaking: wasSpeaking, loudAt: now, updatedAt: now };
  }

  const loudAt = previous?.loudAt ?? 0;
  const isSpeaking = wasSpeaking && now - loudAt < MOBILE_VOICE_SPEAKING_RELEASE_HOLD_MS;

  return { audioLevel, isSpeaking, loudAt, updatedAt: now };
}

/**
 * Adopts a peer-reported level (the socket fast path) into the same store the
 * on-device meter writes to, so whichever signal is fresher wins.
 */
export function createMobileVoiceAudioActivityFromPeer({
  audioLevel,
  isMuted,
  isSpeaking,
  now,
}: {
  audioLevel: number;
  isMuted: boolean;
  isSpeaking: boolean;
  now: number;
}): MobileVoiceAudioActivity {
  if (isMuted) {
    return { audioLevel: 0, isSpeaking: false, loudAt: 0, updatedAt: now };
  }

  const level = Number.isFinite(audioLevel) ? Math.max(0, Math.min(1, audioLevel)) : 0;

  return { audioLevel: level, isSpeaking, loudAt: isSpeaking ? now : 0, updatedAt: now };
}

export function getFreshMobileVoiceAudioActivity(
  activity: MobileVoiceAudioActivity | undefined,
  now: number,
): MobileVoiceAudioActivity | null {
  if (!activity) {
    return null;
  }

  return now - activity.updatedAt <= MOBILE_VOICE_AUDIO_ACTIVITY_STALE_MS ? activity : null;
}
