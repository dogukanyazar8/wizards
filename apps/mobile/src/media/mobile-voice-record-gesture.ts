/**
 * MSG-1h §2 "1h".3: hold the mic to record, slide left to cancel, slide up to
 * lock. Three outcomes from one drag, so the decision lives here as a pure
 * function instead of inside the composer's pan handler.
 */

/** §2 "1h".3 / §4: the cancel threshold is the same 60px as the swipe-to-reply. */
export const MOBILE_VOICE_RECORD_CANCEL_DISTANCE = 60;

/** Lifting the finger past this height parks the recording without the finger. */
export const MOBILE_VOICE_RECORD_LOCK_DISTANCE = 48;

export type MobileVoiceRecordGesture = "cancel" | "lock" | "send";

export function resolveMobileVoiceRecordGesture({
  dx,
  dy,
}: {
  readonly dx: number;
  readonly dy: number;
}): MobileVoiceRecordGesture {
  // Cancel wins a diagonal drag: discarding by accident is recoverable, sending
  // a half-second of pocket noise to the other person is not.
  if (dx <= -MOBILE_VOICE_RECORD_CANCEL_DISTANCE) {
    return "cancel";
  }

  if (dy <= -MOBILE_VOICE_RECORD_LOCK_DISTANCE) {
    return "lock";
  }

  return "send";
}
