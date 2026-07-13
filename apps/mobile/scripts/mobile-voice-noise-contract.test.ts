import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  getMobileMicrophoneCaptureOptions,
  getMobileNoiseSuppressionLabel,
  setMobileMicrophoneEnabledWithNoiseSuppression,
} from "../src/voice/mobile-voice-noise-contract";

describe("mobile voice noise suppression contract", () => {
  it("uses native WebRTC microphone constraints for mobile noise suppression", () => {
    assert.deepEqual(getMobileMicrophoneCaptureOptions(), {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    });
    assert.equal(getMobileNoiseSuppressionLabel("tr"), "Gurultu bastirma aktif");
    assert.equal(getMobileNoiseSuppressionLabel("en"), "Noise suppression active");
    assert.deepEqual(getMobileMicrophoneCaptureOptions(false), {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: false,
    });
  });

  it("passes capture constraints to the actual LiveKit microphone enable call", async () => {
    const calls: Array<{
      enabled: boolean;
      options: unknown;
    }> = [];
    const localParticipant = {
      async setMicrophoneEnabled(enabled: boolean, options?: unknown) {
        calls.push({ enabled, options });
        return undefined;
      },
    };

    await setMobileMicrophoneEnabledWithNoiseSuppression(localParticipant, true);
    await setMobileMicrophoneEnabledWithNoiseSuppression(localParticipant, false);

    assert.deepEqual(calls, [
      {
        enabled: true,
        options: getMobileMicrophoneCaptureOptions(),
      },
      {
        enabled: false,
        options: undefined,
      },
    ]);
  });

  it("keeps the mobile LiveKit hook wired to native microphone capture constraints", () => {
    const hookSource = readFileSync(
      resolve(__dirname, "../src/voice/use-mobile-voice-room.ts"),
      "utf8",
    );

    assert.match(hookSource, /setMobileMicrophoneEnabledWithNoiseSuppression/);
    assert.match(hookSource, /getMobileMicrophoneCaptureOptions/);
  });

  it("does not present browser Krisp as the mobile noise suppression implementation", () => {
    const displayModelSource = readFileSync(
      resolve(__dirname, "../src/app/mobile-display-model.ts"),
      "utf8",
    );
    const copySource = readFileSync(resolve(__dirname, "../src/locale/mobile-copy.ts"), "utf8");
    const mobileVoiceTextSurface = `${displayModelSource}\n${copySource}`;

    assert.doesNotMatch(mobileVoiceTextSurface, /Krisp/i);
    assert.match(displayModelSource, /getMobileNoiseSuppressionLabel/);
    assert.match(copySource, /settingsVoiceNoiseSuppressionTitle/);
  });
});
