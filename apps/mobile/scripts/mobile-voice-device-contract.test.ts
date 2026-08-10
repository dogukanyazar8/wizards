import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES,
  loadMobileVoiceDevicePreferences,
  sanitizeMobileVoiceDeviceId,
  saveMobileVoiceDevicePreferences,
  toMobileVoiceInputOptions,
  toMobileVoiceOutputOptions,
} from "../src/voice/mobile-voice-device-contract";

function createMemoryStorage(initial: Record<string, string | null> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    async getItemAsync(key: string) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("mobile voice device contract", () => {
  it("bounds device identifiers and preserves stable unique options", () => {
    assert.equal(sanitizeMobileVoiceDeviceId("  mic-1  "), "mic-1");
    assert.equal(sanitizeMobileVoiceDeviceId("x".repeat(257)), null);
    assert.equal(sanitizeMobileVoiceDeviceId("   "), null);

    assert.deepEqual(toMobileVoiceOutputOptions(["speaker", "bluetooth", "speaker", ""]), [
      { id: "speaker", kind: "audiooutput", labelKey: "speaker" },
      { id: "bluetooth", kind: "audiooutput", labelKey: "bluetooth" },
    ]);
    assert.deepEqual(
      toMobileVoiceInputOptions([
        { deviceId: "mic-1", label: "Phone microphone" },
        { deviceId: "mic-1", label: "Duplicate" },
        { deviceId: "mic-2", label: "" },
      ]),
      [
        { id: "mic-1", kind: "audioinput", label: "Phone microphone" },
        { id: "mic-2", kind: "audioinput", label: null },
      ],
    );
  });

  it("persists only bounded device ids and the normalized noise boolean", async () => {
    const storage = createMemoryStorage();
    assert.deepEqual(await loadMobileVoiceDevicePreferences(storage), {
      ...DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES,
    });

    assert.deepEqual(
      await saveMobileVoiceDevicePreferences(storage, {
        audioInputId: " mic-1 ",
        audioOutputId: "speaker",
        autoGainControlEnabled: true,
        echoCancellationEnabled: false,
        noiseSuppressionEnabled: false,
        screenShareAudioMuted: true,
        screenShareQualityId: "h1080fps30",
      }),
      {
        audioInputId: "mic-1",
        audioOutputId: "speaker",
        autoGainControlEnabled: true,
        echoCancellationEnabled: false,
        noiseSuppressionEnabled: false,
        screenShareAudioMuted: true,
        screenShareQualityId: "h1080fps30",
      },
    );
    assert.deepEqual(await loadMobileVoiceDevicePreferences(storage), {
      audioInputId: "mic-1",
      audioOutputId: "speaker",
      autoGainControlEnabled: true,
      echoCancellationEnabled: false,
      noiseSuppressionEnabled: false,
      screenShareAudioMuted: true,
      screenShareQualityId: "h1080fps30",
    });
  });

  it("keeps the screen-share quality a stored preference and drops retired values", async () => {
    const storage = createMemoryStorage();

    assert.equal(
      (await loadMobileVoiceDevicePreferences(storage)).screenShareQualityId,
      "h720fps30",
    );

    const saved = await saveMobileVoiceDevicePreferences(storage, {
      audioInputId: null,
      audioOutputId: null,
      autoGainControlEnabled: true,
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      screenShareAudioMuted: false,
      screenShareQualityId: "h1440fps60" as never,
    });

    assert.equal(saved.screenShareQualityId, "h720fps30");
    assert.equal(
      (await loadMobileVoiceDevicePreferences(storage)).screenShareQualityId,
      "h720fps30",
    );
  });
});
