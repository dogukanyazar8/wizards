import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_QUIET_HOURS_TIME_ZONE,
  isWithinQuietHours,
  parseQuietHourMinutes,
  resolveQuietHoursTimeZone,
} from "@/lib/notifications/quiet-hours";

function settings(quietHours: {
  enabled?: boolean;
  from?: string | null;
  timeZone?: string | null;
  to?: string | null;
}) {
  return {
    quietHours: {
      enabled: quietHours.enabled ?? true,
      from: quietHours.from ?? null,
      timeZone: quietHours.timeZone ?? null,
      to: quietHours.to ?? null,
    },
  };
}

/** Istanbul is UTC+3 all year, so a UTC instant maps to a wall clock three hours later. */
const UTC_2230 = new Date("2026-08-21T22:30:00.000Z");

describe("parseQuietHourMinutes", () => {
  it("reads HH:mm into minutes since midnight", () => {
    assert.equal(parseQuietHourMinutes("00:00"), 0);
    assert.equal(parseQuietHourMinutes("08:00"), 480);
    assert.equal(parseQuietHourMinutes("23:59"), 1439);
  });

  it("refuses anything that is not 24-hour HH:mm", () => {
    for (const value of ["", "8:00", "24:00", "23:60", "23:00:00", "gece", null, undefined]) {
      assert.equal(parseQuietHourMinutes(value), null, `${String(value)} must not parse`);
    }
  });
});

describe("resolveQuietHoursTimeZone", () => {
  it("prefers the quiet-hours zone, then the account zone, then Istanbul", () => {
    assert.equal(resolveQuietHoursTimeZone("Europe/Berlin", "Asia/Tokyo"), "Europe/Berlin");
    assert.equal(resolveQuietHoursTimeZone(null, "Asia/Tokyo"), "Asia/Tokyo");
    assert.equal(resolveQuietHoursTimeZone(null, null), DEFAULT_QUIET_HOURS_TIME_ZONE);
  });

  it("falls back when the stored zone is not a zone the runtime knows", () => {
    assert.equal(resolveQuietHoursTimeZone("Mars/Olympus", null), DEFAULT_QUIET_HOURS_TIME_ZONE);
    assert.equal(resolveQuietHoursTimeZone("   ", "Asia/Tokyo"), "Asia/Tokyo");
  });
});

describe("isWithinQuietHours", () => {
  it("is false while quiet hours are switched off", () => {
    assert.equal(
      isWithinQuietHours(
        settings({ enabled: false, from: "23:00", timeZone: "UTC", to: "08:00" }),
        new Date("2026-08-21T00:30:00.000Z"),
      ),
      false,
    );
  });

  it("covers a range that crosses midnight", () => {
    const overnight = settings({ from: "23:00", timeZone: "UTC", to: "08:00" });

    assert.equal(isWithinQuietHours(overnight, new Date("2026-08-21T00:30:00.000Z")), true);
    assert.equal(isWithinQuietHours(overnight, new Date("2026-08-21T09:00:00.000Z")), false);
  });

  it("treats the start as inside and the end as outside", () => {
    const overnight = settings({ from: "23:00", timeZone: "UTC", to: "08:00" });

    assert.equal(isWithinQuietHours(overnight, new Date("2026-08-21T23:00:00.000Z")), true);
    assert.equal(isWithinQuietHours(overnight, new Date("2026-08-21T08:00:00.000Z")), false);
    assert.equal(isWithinQuietHours(overnight, new Date("2026-08-21T07:59:00.000Z")), true);
  });

  it("covers a range inside one day", () => {
    const daytime = settings({ from: "09:00", timeZone: "UTC", to: "17:00" });

    assert.equal(isWithinQuietHours(daytime, new Date("2026-08-21T12:00:00.000Z")), true);
    assert.equal(isWithinQuietHours(daytime, new Date("2026-08-21T08:59:00.000Z")), false);
    assert.equal(isWithinQuietHours(daytime, new Date("2026-08-21T17:00:00.000Z")), false);
  });

  it("reads the wall clock of the stored zone, not UTC", () => {
    const overnight = { from: "23:00", to: "08:00" };

    // 22:30 UTC is 01:30 in Istanbul: quiet there, awake in UTC.
    assert.equal(isWithinQuietHours(settings({ ...overnight, timeZone: null }), UTC_2230), true);
    assert.equal(isWithinQuietHours(settings({ ...overnight, timeZone: "UTC" }), UTC_2230), false);
  });

  it("falls back to the default zone when the stored zone is unusable", () => {
    assert.equal(
      isWithinQuietHours(
        settings({ from: "23:00", timeZone: "Mars/Olympus", to: "08:00" }),
        UTC_2230,
      ),
      true,
    );
  });

  it("is false for a zero-length or half-written range", () => {
    // A zero-length range read as "always on" would silence a user who never
    // asked for silence; the endpoint rejects it with 400 before it can be stored.
    assert.equal(
      isWithinQuietHours(settings({ from: "23:00", timeZone: "UTC", to: "23:00" }), UTC_2230),
      false,
    );
    assert.equal(
      isWithinQuietHours(settings({ from: "23:00", timeZone: "UTC", to: null }), UTC_2230),
      false,
    );
    assert.equal(
      isWithinQuietHours(settings({ from: null, timeZone: "UTC", to: "08:00" }), UTC_2230),
      false,
    );
  });

  it("is false when the stored range is not HH:mm", () => {
    assert.equal(
      isWithinQuietHours(settings({ from: "2300", timeZone: "UTC", to: "08:00" }), UTC_2230),
      false,
    );
  });
});
