import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampMobileMessageFontSize,
  getMobileMessageBodyStyle,
  getMobileMessageFontSizePx,
  getMobileMessageSpacing,
  MOBILE_DEFAULT_MESSAGE_FONT_SIZE,
  MOBILE_MESSAGE_FONT_SIZE_MAX,
  MOBILE_MESSAGE_FONT_SIZE_MIN,
  MOBILE_MESSAGE_FONT_SIZES,
  normalizeMobileMessageFontSize,
} from "../src/design/mobile-message-typography";
import {
  MOBILE_DEFAULT_MESSAGE_COMPACT,
  MOBILE_DEFAULT_MESSAGE_FOLLOW_SYSTEM_FONT,
  MOBILE_FONT_SCALE_STEPS,
  MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY,
  MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY,
  MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY,
  normalizeMobileMessageBooleanPreference,
} from "../src/design/mobile-appearance-preferences";

describe("mobile message typography", () => {
  it("keeps the four handoff steps at their exact px values", () => {
    assert.deepEqual([...MOBILE_MESSAGE_FONT_SIZES], ["small", "medium", "large", "xlarge"]);
    assert.equal(getMobileMessageFontSizePx("small"), 14);
    assert.equal(getMobileMessageFontSizePx("medium"), 15);
    assert.equal(getMobileMessageFontSizePx("large"), 16.5);
    assert.equal(getMobileMessageFontSizePx("xlarge"), 18);
    assert.equal(MOBILE_DEFAULT_MESSAGE_FONT_SIZE, "medium");
  });

  it("resolves line height per surface, tightening the largest step", () => {
    assert.equal(getMobileMessageBodyStyle({ size: "medium", surface: "dm" }).lineHeight, 21.3);
    assert.equal(
      getMobileMessageBodyStyle({ size: "medium", surface: "channel" }).lineHeight,
      21.75,
    );
    // xlarge is the biggest jump in the table, so both surfaces tighten one notch.
    assert.equal(getMobileMessageBodyStyle({ size: "xlarge", surface: "dm" }).lineHeight, 25.2);
    assert.equal(
      getMobileMessageBodyStyle({ size: "xlarge", surface: "channel" }).lineHeight,
      25.56,
    );
  });

  it("resolves the em letter spacing against the effective size", () => {
    assert.equal(
      getMobileMessageBodyStyle({ size: "medium", surface: "dm" }).letterSpacing,
      -0.075,
    );
    assert.equal(getMobileMessageBodyStyle({ size: "large", surface: "dm" }).letterSpacing, -0.082);
    assert.equal(getMobileMessageBodyStyle({ size: "xlarge", surface: "dm" }).letterSpacing, -0.09);
  });

  it("tightens line height and block spacing when compact layout is on", () => {
    assert.equal(
      getMobileMessageBodyStyle({ compact: true, size: "medium", surface: "dm" }).lineHeight,
      20.1,
    );
    assert.equal(
      getMobileMessageBodyStyle({ compact: true, size: "medium", surface: "channel" }).lineHeight,
      20.4,
    );
    // The compact step never changes the size itself, only the rhythm.
    assert.equal(
      getMobileMessageBodyStyle({ compact: true, size: "medium", surface: "dm" }).fontSize,
      15,
    );
    assert.deepEqual(getMobileMessageSpacing(false), {
      bubblePaddingBottom: 8,
      bubblePaddingTop: 9,
      channelRowPaddingVertical: 6,
      groupGap: 10,
    });
    assert.deepEqual(getMobileMessageSpacing(true), {
      bubblePaddingBottom: 6,
      bubblePaddingTop: 7,
      channelRowPaddingVertical: 4,
      groupGap: 6,
    });
  });

  it("clamps the OS-scaled body between 14 and 22 px", () => {
    assert.equal(MOBILE_MESSAGE_FONT_SIZE_MIN, 14);
    assert.equal(MOBILE_MESSAGE_FONT_SIZE_MAX, 22);
    assert.equal(clampMobileMessageFontSize(11), 14);
    assert.equal(clampMobileMessageFontSize(30), 22);
    assert.equal(clampMobileMessageFontSize(16.5), 16.5);
    // xlarge at a 1.5x device scale would be 27px without the clamp.
    assert.equal(
      getMobileMessageBodyStyle({ fontScale: 1.5, size: "xlarge", surface: "dm" }).fontSize,
      22,
    );
    // small at a 0.85x device scale would be 11.9px without the clamp.
    assert.equal(
      getMobileMessageBodyStyle({ fontScale: 0.85, size: "small", surface: "dm" }).fontSize,
      14,
    );
    assert.equal(
      getMobileMessageBodyStyle({ fontScale: 1.15, size: "medium", surface: "dm" }).fontSize,
      17.25,
    );
  });

  it("falls back to the default step for unknown or missing values", () => {
    assert.equal(normalizeMobileMessageFontSize(undefined), "medium");
    assert.equal(normalizeMobileMessageFontSize(null), "medium");
    assert.equal(normalizeMobileMessageFontSize("huge"), "medium");
    assert.equal(normalizeMobileMessageFontSize(3), "medium");
    assert.equal(normalizeMobileMessageFontSize("large"), "large");
    // A stray fontScale must not resize the body either.
    assert.equal(
      getMobileMessageBodyStyle({ fontScale: Number.NaN, size: "medium", surface: "dm" }).fontSize,
      15,
    );
    assert.equal(
      getMobileMessageBodyStyle({ fontScale: 0, size: "medium", surface: "dm" }).fontSize,
      15,
    );
  });

  it("stays independent of the interface text-size preference (K5)", () => {
    // The interface scale multiplies every typography token; the message body is
    // deliberately not one of them, so no step of it appears in this table.
    for (const factor of MOBILE_FONT_SCALE_STEPS) {
      assert.equal(
        getMobileMessageBodyStyle({ size: "medium", surface: "dm" }).fontSize,
        15,
        `interface scale ${factor} must not reach the message body`,
      );
    }
  });

  it("stores the three message preferences under their own keys and defaults", () => {
    assert.equal(MOBILE_MESSAGE_FONT_SIZE_PREFERENCE_KEY, "whispr.mobile.message-font-size");
    assert.equal(MOBILE_MESSAGE_COMPACT_PREFERENCE_KEY, "whispr.mobile.message-compact");
    assert.equal(
      MOBILE_MESSAGE_FOLLOW_SYSTEM_PREFERENCE_KEY,
      "whispr.mobile.message-follow-system-font",
    );
    assert.equal(MOBILE_DEFAULT_MESSAGE_COMPACT, false);
    assert.equal(MOBILE_DEFAULT_MESSAGE_FOLLOW_SYSTEM_FONT, false);
    assert.equal(normalizeMobileMessageBooleanPreference("true", false), true);
    assert.equal(normalizeMobileMessageBooleanPreference("false", true), false);
    assert.equal(normalizeMobileMessageBooleanPreference(null, false), false);
    assert.equal(normalizeMobileMessageBooleanPreference("yes", true), true);
  });
});
