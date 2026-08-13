import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildChannelCreateSettings, buildChannelUpdateSettings } from "./channel-settings";

describe("channel settings persistence model", () => {
  it("preserves current defaults when advanced settings are omitted", () => {
    assert.deepEqual(buildChannelCreateSettings({ type: "TEXT" }), {
      slowModeDelay: 0,
    });
    assert.deepEqual(buildChannelCreateSettings({ type: "VOICE" }), {
      bitrate: 64_000,
      rtcRegion: null,
      userLimit: 0,
      videoQualityMode: "AUTO",
    });
  });

  it("normalizes automatic RTC and returns only fields valid for the channel type", () => {
    assert.deepEqual(buildChannelCreateSettings({ slowModeDelay: 60, type: "TEXT" }), {
      slowModeDelay: 60,
    });
    assert.deepEqual(
      buildChannelCreateSettings({
        bitrate: 128_000,
        rtcRegion: "AUTO",
        type: "VOICE",
        userLimit: 8,
        videoQualityMode: "FULL",
      }),
      { bitrate: 128_000, rtcRegion: null, userLimit: 8, videoQualityMode: "FULL" },
    );
  });

  it("rejects update settings from the wrong channel type", () => {
    assert.throws(
      () => buildChannelUpdateSettings("TEXT", { bitrate: 96_000 }),
      /Voice settings are not available for text channels/,
    );
    assert.throws(
      () => buildChannelUpdateSettings("VOICE", { slowModeDelay: 30 }),
      /Slow mode is not available for voice channels/,
    );
  });

  it("keeps partial updates partial and normalizes automatic RTC", () => {
    assert.deepEqual(buildChannelUpdateSettings("TEXT", { slowModeDelay: 300 }), {
      slowModeDelay: 300,
    });
    assert.deepEqual(buildChannelUpdateSettings("VOICE", { bitrate: 32_000, rtcRegion: "AUTO" }), {
      bitrate: 32_000,
      rtcRegion: null,
    });
  });
});
