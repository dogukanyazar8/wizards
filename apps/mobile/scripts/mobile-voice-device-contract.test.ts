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
        noiseSuppressionEnabled: false,
      }),
      {
        audioInputId: "mic-1",
        audioOutputId: "speaker",
        noiseSuppressionEnabled: false,
      },
    );
    assert.deepEqual(await loadMobileVoiceDevicePreferences(storage), {
      audioInputId: "mic-1",
      audioOutputId: "speaker",
      noiseSuppressionEnabled: false,
    });
  });
});
