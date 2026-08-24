import { z } from "zod";

/**
 * Mesajlar paketi karar #5 — sesli mesaj.
 *
 * `Attachment.duration` (seconds) and `Attachment.waveform` (string) already
 * exist. `waveform` has never been written: the mobile player derives its bars
 * from a hash of the attachment id, which draws the *same* silhouette for two
 * recordings of the same length and a different one for the same recording
 * re-uploaded. This module gives the column a real meaning and both platforms
 * one parser.
 *
 * Encoding: comma-separated integers 0–100, at most 64 of them, no spaces.
 * A string rather than `Int[]` because the column is already `String?` on a live
 * database, and re-typing an empty column buys nothing that validation here
 * does not already give every write.
 */

export const VOICE_MESSAGE_MAX_MS = 5 * 60_000;
export const VOICE_MESSAGE_WAVEFORM_BUCKETS = 64;
export const VOICE_MESSAGE_MAX_AMPLITUDE = 100;

/** What a browser recorder can actually produce; the upload route mirrors it. */
export const VOICE_MESSAGE_CONTENT_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
] as const;

export function isVoiceMessageContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";

  return (VOICE_MESSAGE_CONTENT_TYPES as readonly string[]).includes(normalized);
}

export const VoiceWaveformSchema = z
  .array(z.number().int().min(0).max(VOICE_MESSAGE_MAX_AMPLITUDE))
  .max(VOICE_MESSAGE_WAVEFORM_BUCKETS);

export type VoiceWaveform = z.infer<typeof VoiceWaveformSchema>;

/** `[0, 100, 42]` → `"0,100,42"`. */
export function serializeWaveform(waveform: readonly number[]): string {
  return VoiceWaveformSchema.parse([...waveform]).join(",");
}

/**
 * Returns `[]` for anything unparseable — a null column, an empty string, a
 * value written before this encoding existed. The player draws a flat bar for
 * an empty waveform, which is honest; guessing a shape is not.
 */
export function parseWaveform(value: string | null | undefined): number[] {
  if (!value) {
    return [];
  }

  const parsed = value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isInteger(entry));

  const result = VoiceWaveformSchema.safeParse(parsed);

  return result.success ? result.data : [];
}

/**
 * Resamples an arbitrary run of amplitudes into exactly `buckets` values.
 *
 * Each bucket takes the **peak** of its slice, not the mean: a mean flattens
 * speech into a featureless band, and the bar the eye looks for when scrubbing
 * is the loud one. A run shorter than the bucket count is stretched rather than
 * padded with zeroes, so a two-second note still fills the track.
 */
export function bucketAmplitudes(
  samples: readonly number[],
  buckets: number = VOICE_MESSAGE_WAVEFORM_BUCKETS,
): number[] {
  if (buckets <= 0) {
    return [];
  }

  if (samples.length === 0) {
    return Array.from({ length: buckets }, () => 0);
  }

  return Array.from({ length: buckets }, (_unused, index) => {
    const start = Math.floor((index * samples.length) / buckets);
    const end = Math.max(start + 1, Math.floor(((index + 1) * samples.length) / buckets));

    let peak = 0;
    for (let at = start; at < end && at < samples.length; at += 1) {
      peak = Math.max(peak, samples[at] ?? 0);
    }

    return peak;
  });
}

/**
 * Linear RMS (0–1) → the 0–100 bar height.
 *
 * The scale is **decibel**, not linear. Half the linear amplitude is −6 dBFS,
 * which the ear hears as a little quieter; drawn linearly it is half the bar,
 * which the eye reads as near-silence. `-60 dBFS` is the floor: below it the
 * bar sits at 0 and the recording reads as a pause, which is what it is.
 */
export const VOICE_MESSAGE_FLOOR_DB = -60;

export function rmsToAmplitude(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) {
    return 0;
  }

  const db = 20 * Math.log10(Math.min(1, rms));
  if (db <= VOICE_MESSAGE_FLOOR_DB) {
    return 0;
  }

  const normalized = (db - VOICE_MESSAGE_FLOOR_DB) / -VOICE_MESSAGE_FLOOR_DB;

  return Math.round(Math.min(1, Math.max(0, normalized)) * VOICE_MESSAGE_MAX_AMPLITUDE);
}

/** Recorder samples (linear RMS) → the stored waveform. */
export function toVoiceWaveform(
  rmsSamples: readonly number[],
  buckets: number = VOICE_MESSAGE_WAVEFORM_BUCKETS,
): number[] {
  return bucketAmplitudes(rmsSamples.map(rmsToAmplitude), buckets);
}

export function hasReachedVoiceMessageLimit(elapsedMs: number): boolean {
  return elapsedMs >= VOICE_MESSAGE_MAX_MS;
}

/** `"0:07"`, `"1:04"`, `"12:00"`. Rounds down: a 7.9s note is still 0:07. */
export function formatVoiceDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export interface VoiceMessageAttachmentLike {
  readonly contentType: string;
  // `exactOptionalPropertyTypes` altında `?` ile `| undefined` aynı şey değil:
  // çağıran taraf alanı `undefined` **taşıyabilen** bir tiple veriyor.
  readonly duration?: number | null | undefined;
  readonly waveform?: string | null | undefined;
}

/**
 * An audio attachment sent from the recorder, as opposed to an audio *file* the
 * user attached. Both are `audio/*`; only the recorder writes a duration, so
 * that is the tell. Without it a two-hour podcast upload would render as a voice
 * note with a scrub bar the player cannot fill.
 */
export function isVoiceMessageAttachment(attachment: VoiceMessageAttachmentLike): boolean {
  return (
    isVoiceMessageContentType(attachment.contentType) &&
    typeof attachment.duration === "number" &&
    attachment.duration > 0
  );
}
