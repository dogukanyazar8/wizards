import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACCOUNT_FORMAT_PREVIEW_INSTANT,
  formatAccountDate,
  formatAccountDateTime,
  formatAccountTime,
  getAccountTimeZoneOptions,
  getInterfaceDensityMetrics,
  isValidIanaTimeZone,
  resolveAccountTimeZone,
} from "./account-date-time";

describe("account date and time preferences", () => {
  it("resolves AUTO at runtime and safely falls back for invalid zones", () => {
    assert.equal(resolveAccountTimeZone("AUTO", "Europe/Istanbul"), "Europe/Istanbul");
    assert.equal(resolveAccountTimeZone("AUTO", "Mars/Olympus_Mons"), "UTC");
    assert.equal(resolveAccountTimeZone("Mars/Olympus_Mons", "Europe/Istanbul"), "UTC");
    assert.equal(isValidIanaTimeZone("America/New_York"), true);
    assert.equal(isValidIanaTimeZone("Mars/Olympus_Mons"), false);
  });

  it("formats explicit date orders without losing locale digits", () => {
    const input = "2026-08-13T17:05:00.000Z";
    assert.equal(
      formatAccountDate(input, { dateFormat: "DMY", locale: "en-US", timeZone: "UTC" }),
      "13/08/2026",
    );
    assert.equal(
      formatAccountDate(input, { dateFormat: "MDY", locale: "en-US", timeZone: "UTC" }),
      "08/13/2026",
    );
    assert.equal(
      formatAccountDate(input, { dateFormat: "YMD", locale: "en-US", timeZone: "UTC" }),
      "2026/08/13",
    );
  });

  it("honors 12 and 24 hour preferences", () => {
    const input = "2026-08-13T17:05:00.000Z";
    assert.match(
      formatAccountTime(input, { locale: "en-US", timeFormat: "H12", timeZone: "UTC" }),
      /5:05\sPM/i,
    );
    assert.equal(
      formatAccountTime(input, { locale: "en-US", timeFormat: "H24", timeZone: "UTC" }),
      "17:05",
    );
  });

  it("handles a daylight-saving transition using the selected IANA zone", () => {
    const before = formatAccountTime("2026-03-08T06:30:00.000Z", {
      locale: "en-US",
      timeFormat: "H24",
      timeZone: "America/New_York",
    });
    const after = formatAccountTime("2026-03-08T07:30:00.000Z", {
      locale: "en-US",
      timeFormat: "H24",
      timeZone: "America/New_York",
    });

    assert.equal(before, "01:30");
    assert.equal(after, "03:30");
  });

  it("uses a neutral placeholder for invalid instants and deterministic preview input", () => {
    assert.equal(
      formatAccountDateTime("not-a-date", {
        dateFormat: "LOCALE",
        locale: "tr-TR",
        timeFormat: "LOCALE",
        timeZone: "AUTO",
      }),
      "—",
    );
    assert.equal(Number.isNaN(new Date(ACCOUNT_FORMAT_PREVIEW_INSTANT).getTime()), false);
  });

  it("builds a stable searchable zone option list including AUTO and selected values", () => {
    const options = getAccountTimeZoneOptions({
      selectedTimeZone: "Europe/Istanbul",
      supportedTimeZones: ["Europe/London", "America/New_York", "Europe/London"],
      systemTimeZone: "Europe/Berlin",
    });

    assert.equal(options[0], "AUTO");
    assert.deepEqual(options.slice(1), [
      "America/New_York",
      "Europe/Berlin",
      "Europe/Istanbul",
      "Europe/London",
      "UTC",
    ]);
  });
});

describe("interface density metrics", () => {
  it("reduces spacing in compact mode without shrinking controls below 44px", () => {
    const comfortable = getInterfaceDensityMetrics("COMFORTABLE");
    const compact = getInterfaceDensityMetrics("COMPACT");

    assert.ok(compact.sectionGap < comfortable.sectionGap);
    assert.ok(compact.rowGap < comfortable.rowGap);
    assert.ok(compact.controlMinHeight >= 44);
    assert.ok(comfortable.controlMinHeight >= 44);
  });
});
