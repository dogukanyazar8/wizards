import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAudioCaptureProcessingProfile,
  getNoiseSuppressionChoice,
  getNoiseSuppressionPreset,
  getBrowserNoiseFilterEnabled,
  getKrispNoiseFilterTier,
  isEnhancedNoiseFilterMode,
  isKrispNoiseFilterTier,
  resolveNoiseFilterTier,
  shouldUseEnhancedNoiseFilterCapture,
  shouldUseKrispNoiseFilter,
} from "./noise-filter";

import { DEFAULT_AUDIO_DEVICE_ID, type VoiceAudioPreferences } from "@/store/voice-store";

const basePreferences: VoiceAudioPreferences = {
  autoGainControl: true,
  echoCancellation: true,
  enhancedNoiseFilterMode: "layered",
  inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
  krispNoiseCancellation: true,
  noiseSuppression: true,
  outputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
  voiceIsolation: true,
};

describe("noise filter helpers", () => {
  it("three settings choices round trip without changing echo, gain or device selection", () => {
    for (const choice of [0, 1, 2]) {
      const preset = getNoiseSuppressionPreset(choice);
      const next = { ...basePreferences, ...preset };
      assert.equal(getNoiseSuppressionChoice(next), choice);
      assert.equal(next.echoCancellation, basePreferences.echoCancellation);
      assert.equal(next.autoGainControl, basePreferences.autoGainControl);
      assert.equal(next.inputDeviceId, basePreferences.inputDeviceId);
      assert.equal(shouldUseKrispNoiseFilter(next, true), choice === 0);
      assert.equal(getBrowserNoiseFilterEnabled(next, true), choice !== 2);
    }
    assert.throws(() => getNoiseSuppressionPreset(99), /INVALID_NOISE_SUPPRESSION_CHOICE/);
    const krisp = { ...basePreferences, ...getNoiseSuppressionPreset(0) };
    assert.equal(getAudioCaptureProcessingProfile(krisp, false), "native");
    assert.equal(getAudioCaptureProcessingProfile(krisp, true), "enhanced");
  });
  it("normalizes the supported enhanced noise filter experiment modes", () => {
    assert.equal(isEnhancedNoiseFilterMode("layered"), true);
    assert.equal(isEnhancedNoiseFilterMode("krisp_only"), true);
    assert.equal(isEnhancedNoiseFilterMode("browser_only"), true);
    assert.equal(isEnhancedNoiseFilterMode("unknown"), false);
  });

  it("maps Krisp processor quality to a typed tier", () => {
    assert.equal(getKrispNoiseFilterTier("high"), "krisp_high");
    assert.equal(getKrispNoiseFilterTier("medium"), "krisp_medium");
    assert.equal(getKrispNoiseFilterTier("low"), "krisp_low");
    assert.equal(isKrispNoiseFilterTier("krisp_high"), true);
    assert.equal(isKrispNoiseFilterTier("browser_native"), false);
    assert.equal(isKrispNoiseFilterTier("off"), false);
  });

  it("maps experiment modes to Krisp and capture processing decisions", () => {
    assert.equal(shouldUseKrispNoiseFilter(basePreferences, true), true);
    assert.equal(
      shouldUseKrispNoiseFilter(
        {
          ...basePreferences,
          enhancedNoiseFilterMode: "browser_only",
        },
        true,
      ),
      false,
    );
    assert.equal(
      getAudioCaptureProcessingProfile(
        {
          ...basePreferences,
          enhancedNoiseFilterMode: "krisp_only",
        },
        true,
      ),
      "enhanced",
    );
    assert.equal(
      shouldUseEnhancedNoiseFilterCapture(
        {
          ...basePreferences,
          enhancedNoiseFilterMode: "krisp_only",
        },
        true,
      ),
      true,
    );
    assert.equal(getAudioCaptureProcessingProfile(basePreferences, true), "native");
    assert.equal(
      getAudioCaptureProcessingProfile(
        {
          ...basePreferences,
          noiseSuppression: false,
          voiceIsolation: false,
        },
        true,
      ),
      "off",
    );
  });

  it("detects when browser-native cleanup is requested", () => {
    assert.equal(getBrowserNoiseFilterEnabled(basePreferences, true), true);
    assert.equal(
      getBrowserNoiseFilterEnabled(
        {
          ...basePreferences,
          noiseSuppression: false,
        },
        true,
      ),
      true,
    );
    assert.equal(
      getBrowserNoiseFilterEnabled(
        {
          ...basePreferences,
          noiseSuppression: false,
        },
        false,
      ),
      false,
    );
  });

  it("resolves the active tier without exposing device capability details", () => {
    assert.equal(
      resolveNoiseFilterTier({
        browserNoiseFilterEnabled: true,
        isKrispNoiseCancellationActive: true,
        krispQuality: "medium",
      }),
      "krisp_medium",
    );
    assert.equal(
      resolveNoiseFilterTier({
        browserNoiseFilterEnabled: true,
        isKrispNoiseCancellationActive: false,
        krispQuality: null,
      }),
      "browser_native",
    );
    assert.equal(
      resolveNoiseFilterTier({
        browserNoiseFilterEnabled: false,
        isKrispNoiseCancellationActive: false,
        krispQuality: null,
      }),
      "off",
    );
  });
});
