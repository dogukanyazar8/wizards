import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createChannelAdvancedSettings,
  getChannelAdvancedSettingsInput,
  hasCreateChannelProgress,
  isChannelAdvancedSettingsValid,
} from "./channel-form-model";

describe("channel form model", () => {
  it("keeps existing values when editing and current defaults when creating", () => {
    assert.deepEqual(createChannelAdvancedSettings(), {
      bitrate: 64_000,
      rtcRegion: null,
      slowModeDelay: 0,
      userLimit: 0,
      videoQualityMode: "AUTO",
    });
    assert.equal(
      createChannelAdvancedSettings({
        bitrate: 128_000,
        rtcRegion: "EU_WEST",
        slowModeDelay: 30,
        userLimit: 7,
        videoQualityMode: "FULL",
      }).rtcRegion,
      "EU_WEST",
    );
  });

  it("submits only text settings for a text channel", () => {
    assert.deepEqual(
      getChannelAdvancedSettingsInput("TEXT", {
        ...createChannelAdvancedSettings(),
        bitrate: 128_000,
        slowModeDelay: 30,
      }),
      { slowModeDelay: 30 },
    );
  });

  it("submits only voice settings for a voice channel", () => {
    assert.deepEqual(
      getChannelAdvancedSettingsInput("VOICE", {
        bitrate: 96_000,
        rtcRegion: "EU_WEST",
        slowModeDelay: 60,
        userLimit: 5,
        videoQualityMode: "FULL",
      }),
      {
        bitrate: 96_000,
        rtcRegion: "EU_WEST",
        userLimit: 5,
        videoQualityMode: "FULL",
      },
    );
  });

  it("rejects a voice user limit outside the server contract", () => {
    assert.equal(
      isChannelAdvancedSettingsValid("VOICE", {
        ...createChannelAdvancedSettings(),
        userLimit: 11,
      }),
      false,
    );
  });

  it("accepts only server-advertised RTC region keys", () => {
    const settings = { ...createChannelAdvancedSettings(), rtcRegion: "EU_WEST" };

    assert.equal(isChannelAdvancedSettingsValid("VOICE", settings), false);
    assert.equal(isChannelAdvancedSettingsValid("VOICE", settings, ["EU_WEST"]), true);
  });

  it("detects only changes from the create modal baseline", () => {
    const baseline = {
      advancedSettings: createChannelAdvancedSettings(),
      allowedRoleIds: [] as string[],
      categoryId: "category-1" as string | null,
      name: "",
      preset: "PUBLIC" as const,
      topic: "",
      type: "TEXT" as const,
    };

    assert.equal(hasCreateChannelProgress(baseline, baseline), false);
    assert.equal(hasCreateChannelProgress({ ...baseline, name: "  " }, baseline), false);
    assert.equal(hasCreateChannelProgress({ ...baseline, name: "tasarim" }, baseline), true);
    assert.equal(hasCreateChannelProgress({ ...baseline, type: "VOICE" }, baseline), true);
    assert.equal(
      hasCreateChannelProgress(
        { ...baseline, advancedSettings: { ...baseline.advancedSettings, slowModeDelay: 5 } },
        baseline,
      ),
      true,
    );
  });
});
