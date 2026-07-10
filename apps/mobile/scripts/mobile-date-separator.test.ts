import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMobileDateSeparator } from "../src/locale/mobile-date-separator";
import { getMobileIntlLocale } from "../src/locale/mobile-locale-preferences";

describe("mobile date separator", () => {
  it("maps product locales to stable Intl locale identifiers", () => {
    assert.equal(getMobileIntlLocale("tr"), "tr-TR");
    assert.equal(getMobileIntlLocale("en"), "en-US");
  });

  it("formats Turkish and English separators from the active product locale", () => {
    const value = "2026-07-10T10:00:00.000Z";

    assert.equal(formatMobileDateSeparator(value, "tr"), "10 Temmuz 2026");
    assert.equal(formatMobileDateSeparator(value, "en"), "July 10, 2026");
  });

  it("fails closed for invalid dates", () => {
    assert.equal(formatMobileDateSeparator("not-a-date", "tr"), "");
  });
});
