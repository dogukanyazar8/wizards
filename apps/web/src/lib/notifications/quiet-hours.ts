import type { MentionQuietHours } from "@wizards/types";

/**
 * Bahsedilmeler Ş4 — SPEC-BAHSEDILMELER §7 quiet hours.
 *
 * The design's own wording decides what quiet hours do: `bahsetmeler sayaçta birikir`. A quiet
 * hour suppresses the push and the desktop toast, never the mention row and never the counter.
 * This module answers only the "is it quiet right now" half; the fan-out path (Ş2) owns what it
 * does with the answer.
 *
 * The window is a wall clock, not an instant. Evaluating `23:00 – 08:00` in UTC would shift the
 * user's night by their offset — three hours in Istanbul, and one more again in a zone that
 * observes DST.
 */

/** Last resort when neither the quiet-hours zone nor the account zone is usable. */
export const DEFAULT_QUIET_HOURS_TIME_ZONE = "Europe/Istanbul";

const QUIET_HOUR_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;
const MINUTES_PER_HOUR = 60;

/**
 * Anything with quiet hours on it. `MentionSettings` satisfies this structurally, so Ş2 can pass
 * the settings object it already loaded instead of unpacking one field.
 */
export interface QuietHoursCarrier {
  readonly quietHours: MentionQuietHours;
}

/** `"23:00"` → 1380. Returns `null` for anything that is not 24-hour `HH:mm`. */
export function parseQuietHourMinutes(value: string | null | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = QUIET_HOUR_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

function isUsableTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    // A zone the runtime does not know reaches here from a row written by an older client or a
    // hand-edited record. Throwing would turn a settings row into a 500 on the send path.
    return false;
  }
}

/**
 * §7: the quiet-hours zone wins, then the account zone (`UserSettings.timeZone`), then Istanbul.
 * A stored zone the runtime cannot resolve is treated as absent rather than fatal.
 */
export function resolveQuietHoursTimeZone(
  quietHoursTimeZone: string | null | undefined,
  accountTimeZone: string | null | undefined,
): string {
  for (const candidate of [quietHoursTimeZone, accountTimeZone]) {
    const trimmed = candidate?.trim();
    if (trimmed && isUsableTimeZone(trimmed)) {
      return trimmed;
    }
  }

  return DEFAULT_QUIET_HOURS_TIME_ZONE;
}

/** Minutes since local midnight for `at` in `timeZone`. */
function zonedMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(at);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour * MINUTES_PER_HOUR + minute;
}

/**
 * Ş4 ↔ Ş2 contract. The one signature the fan-out path calls.
 *
 * The range is half-open: `from` is inside the quiet window, `to` is the first minute outside it.
 * `from > to` is a range that crosses midnight (`23:00 – 08:00`) and becomes a union; otherwise it
 * is a plain interval.
 *
 * A range that is zero-length, half-written or not `HH:mm` answers `false`. Reading it as
 * "always quiet" would silence somebody who never asked for silence — the endpoint rejects that
 * shape with 400 before it can be stored, and this is the second line of the same defence.
 */
export function isWithinQuietHours(settings: QuietHoursCarrier, at: Date): boolean {
  const { quietHours } = settings;

  if (!quietHours.enabled) {
    return false;
  }

  const from = parseQuietHourMinutes(quietHours.from);
  const to = parseQuietHourMinutes(quietHours.to);

  if (from === null || to === null || from === to) {
    return false;
  }

  const now = zonedMinutes(at, resolveQuietHoursTimeZone(quietHours.timeZone, null));

  return from < to ? now >= from && now < to : now >= from || now < to;
}
