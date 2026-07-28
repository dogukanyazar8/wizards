/**
 * §2 "1h".2 loudness maths for the recording waveform.
 *
 * Kept apart from `mobile-voice-message-recorder` because that module reaches
 * for `expo-audio`, and the numbers here are worth testing without a native
 * runtime behind them.
 */

/** How often the recorder is polled for a new loudness sample while recording. */
export const VOICE_MESSAGE_METER_INTERVAL_MS = 100;

/** How many samples the bar keeps; older ones scroll off the left. */
export const VOICE_MESSAGE_METER_WINDOW = 28;

/**
 * Quietest level the bar bothers to draw. Metering is reported in dBFS, where 0
 * is the loudest the microphone can encode and −160 is digital silence; speech
 * lives around −30…−10, so anchoring the floor at −50 keeps a normal voice in
 * the upper half of the bar instead of a flat line near the bottom.
 */
export const VOICE_MESSAGE_METER_FLOOR_DB = -50;

/**
 * dBFS to a 0…1 bar height. The curve is deliberately not linear: loudness is
 * perceived logarithmically, so a straight mapping makes ordinary speech look
 * uniformly quiet.
 */
export function normalizeMobileVoiceMeterLevel(decibels: number | undefined): number {
  if (decibels === undefined || !Number.isFinite(decibels)) {
    return 0;
  }

  const clamped = Math.min(0, Math.max(VOICE_MESSAGE_METER_FLOOR_DB, decibels));
  const linear = (clamped - VOICE_MESSAGE_METER_FLOOR_DB) / -VOICE_MESSAGE_METER_FLOOR_DB;
  return Math.round(Math.pow(linear, 0.7) * 1000) / 1000;
}

/** Appends one sample, keeping only the newest `window` of them. */
export function appendMobileVoiceMeterLevel(
  levels: readonly number[],
  level: number,
  window = VOICE_MESSAGE_METER_WINDOW,
): readonly number[] {
  const next = [...levels, level];
  return next.length > window ? next.slice(next.length - window) : next;
}
