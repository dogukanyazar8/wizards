import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_COMMUNICATIONS_DEVICE_ID,
  resolveAudioDeviceFallback,
} from "./audio-device-fallback";
import { DEFAULT_AUDIO_DEVICE_ID } from "@/store/voice-store";

describe("resolveAudioDeviceFallback", () => {
  it("keeps the selected device when it is still available", () => {
    const result = resolveAudioDeviceFallback({
      devices: [{ deviceId: "mic-1" }, { deviceId: DEFAULT_AUDIO_DEVICE_ID }],
      preferredDeviceId: "mic-1",
    });

    assert.deepEqual(result, {
      changed: false,
      deviceId: "mic-1",
      reason: "selected",
    });
  });

  it("prefers the OS communications device when the selected device disappeared", () => {
    const result = resolveAudioDeviceFallback({
      devices: [
        { deviceId: DEFAULT_AUDIO_DEVICE_ID },
        { deviceId: DEFAULT_COMMUNICATIONS_DEVICE_ID },
        { deviceId: "mic-2" },
      ],
      preferredDeviceId: "mic-1",
    });

    assert.deepEqual(result, {
      changed: true,
      deviceId: DEFAULT_COMMUNICATIONS_DEVICE_ID,
      reason: "system-communications",
    });
  });

  it("keeps an explicit system default preference even when communications is exposed", () => {
    const result = resolveAudioDeviceFallback({
      devices: [
        { deviceId: DEFAULT_AUDIO_DEVICE_ID },
        { deviceId: DEFAULT_COMMUNICATIONS_DEVICE_ID },
        { deviceId: "mic-2" },
      ],
      preferredDeviceId: DEFAULT_AUDIO_DEVICE_ID,
    });

    assert.deepEqual(result, {
      changed: false,
      deviceId: DEFAULT_AUDIO_DEVICE_ID,
      reason: "system-default",
    });
  });

  it("falls back to the system default when no communications device is exposed", () => {
    const result = resolveAudioDeviceFallback({
      devices: [{ deviceId: DEFAULT_AUDIO_DEVICE_ID }, { deviceId: "mic-2" }],
      preferredDeviceId: "mic-1",
    });

    assert.deepEqual(result, {
      changed: true,
      deviceId: DEFAULT_AUDIO_DEVICE_ID,
      reason: "system-default",
    });
  });

  it("uses the first valid device when no default pseudo-device is available", () => {
    const result = resolveAudioDeviceFallback({
      devices: [{ deviceId: "mic-2" }, { deviceId: "mic-3" }],
      preferredDeviceId: "mic-1",
    });

    assert.deepEqual(result, {
      changed: true,
      deviceId: "mic-2",
      reason: "first-valid",
    });
  });
});
