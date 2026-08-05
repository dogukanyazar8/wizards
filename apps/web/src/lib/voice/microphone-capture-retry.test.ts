import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMicrophoneCaptureRetry } from "./microphone-capture-retry";
import {
  DEFAULT_AUDIO_DEVICE_ID,
  DEFAULT_VOICE_AUDIO_PREFERENCES,
  type VoiceAudioPreferences,
} from "@/store/voice-store";

function preferences(overrides: Partial<VoiceAudioPreferences> = {}): VoiceAudioPreferences {
  return { ...DEFAULT_VOICE_AUDIO_PREFERENCES, ...overrides };
}

describe("resolveMicrophoneCaptureRetry", () => {
  it("falls back to the system default when a hand-picked device disappeared", () => {
    const retry = resolveMicrophoneCaptureRetry(
      preferences({ inputDeviceId: "mic-1" }),
      new DOMException("missing", "NotFoundError"),
    );

    assert.equal(retry?.reason, "default-device");
    assert.equal(retry?.persistDeviceFallback, true);
    assert.equal(retry?.preferences.inputDeviceId, DEFAULT_AUDIO_DEVICE_ID);
  });

  it("still retries when the system default device itself failed", () => {
    const retry = resolveMicrophoneCaptureRetry(
      preferences({ inputDeviceId: DEFAULT_AUDIO_DEVICE_ID, voiceIsolation: true }),
      new DOMException("Could not start audio source", "NotReadableError"),
    );

    assert.equal(retry?.reason, "bare-capture");
    assert.equal(retry?.persistDeviceFallback, false);
    assert.equal(retry?.persistProcessingFallback, false);
    assert.equal(retry?.preferences.voiceIsolation, false);
  });

  it("drops voice isolation for constraint failures and persists the choice", () => {
    const retry = resolveMicrophoneCaptureRetry(
      preferences({ voiceIsolation: true }),
      new Error("ConstraintNotSatisfiedError"),
    );

    assert.equal(retry?.reason, "stable-processing");
    assert.equal(retry?.persistProcessingFallback, true);
    assert.equal(retry?.preferences.voiceIsolation, false);
  });

  it("does not retry permission denials or publish failures", () => {
    assert.equal(
      resolveMicrophoneCaptureRetry(preferences(), new DOMException("blocked", "NotAllowedError")),
      null,
    );
    assert.equal(
      resolveMicrophoneCaptureRetry(preferences(), new Error("Microphone track was not published")),
      null,
    );
  });
});
