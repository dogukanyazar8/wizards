import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMobileChannelRowTimestamp,
  formatMobileDateSeparator,
} from "../src/locale/mobile-date-separator";
import { getMobileIntlLocale } from "../src/locale/mobile-locale-preferences";

describe("mobile date separator", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("maps product locales to stable Intl locale identifiers", () => {
    assert.equal(getMobileIntlLocale("tr"), "tr-TR");
    assert.equal(getMobileIntlLocale("en"), "en-US");
  });

  it("uses relative labels for today and yesterday", () => {
    assert.equal(formatMobileDateSeparator("2026-07-16T09:00:00.000Z", "tr", now), "Bugün");
    assert.equal(formatMobileDateSeparator("2026-07-15T12:00:00.000Z", "tr", now), "Dün");
    assert.equal(formatMobileDateSeparator("2026-07-16T09:00:00.000Z", "en", now), "Today");
    assert.equal(formatMobileDateSeparator("2026-07-15T12:00:00.000Z", "en", now), "Yesterday");
  });

  it("drops the year within the current year and keeps it for other years", () => {
    assert.equal(formatMobileDateSeparator("2026-05-18T12:00:00.000Z", "tr", now), "18 Mayıs");
    assert.equal(formatMobileDateSeparator("2025-05-18T12:00:00.000Z", "tr", now), "18 Mayıs 2025");
    assert.equal(formatMobileDateSeparator("2026-05-18T12:00:00.000Z", "en", now), "May 18");
    assert.equal(formatMobileDateSeparator("2025-05-18T12:00:00.000Z", "en", now), "May 18, 2025");
  });

  it("fails closed for invalid dates", () => {
    assert.equal(formatMobileDateSeparator("not-a-date", "tr", now), "");
  });
});

describe("channel row timestamp", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("shows the clock time for today (1a/1b right column)", () => {
    assert.match(
      formatMobileChannelRowTimestamp("2026-07-16T10:59:00.000Z", "tr", now),
      /^\d\d:\d\d$/,
    );
  });

  it("shows the relative day label for yesterday", () => {
    assert.equal(formatMobileChannelRowTimestamp("2026-07-15T10:00:00.000Z", "tr", now), "Dün");
    assert.equal(
      formatMobileChannelRowTimestamp("2026-07-15T10:00:00.000Z", "en", now),
      "Yesterday",
    );
  });

  it("falls back to the calendar date for older messages", () => {
    assert.equal(
      formatMobileChannelRowTimestamp("2026-05-18T12:00:00.000Z", "tr", now),
      "18 Mayıs",
    );
    assert.equal(
      formatMobileChannelRowTimestamp("2025-05-18T12:00:00.000Z", "tr", now),
      "18 Mayıs 2025",
    );
  });

  it("fails closed for invalid dates", () => {
    assert.equal(formatMobileChannelRowTimestamp("not-a-date", "tr", now), "");
  });
});
