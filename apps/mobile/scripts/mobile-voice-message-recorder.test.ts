import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  appendMobileVoiceMeterLevel,
  normalizeMobileVoiceMeterLevel,
  VOICE_MESSAGE_METER_FLOOR_DB,
} from "../src/media/mobile-voice-meter";

describe("mobile voice-message recorder contract", () => {
  it("keeps microphone permission and recording behind an explicit composer action", () => {
    const source = readFileSync(
      resolve(__dirname, "../src/media/mobile-voice-message-recorder.ts"),
      "utf8",
    );

    assert.match(source, /AudioModule\.requestRecordingPermissionsAsync\(\)/);
    assert.match(source, /prepareToRecordAsync\(\)/);
    assert.match(source, /recorder\.record\(\)/);
    assert.match(source, /await recorder\.stop\(\)/);
    assert.match(source, /discard\(\): Promise<void>/);
    assert.match(source, /new ExpoFile\(uri\)/);
    assert.match(source, /recordingFile\.delete\(\)/);
    assert.match(source, /disposeMobileVoiceRecording/);
    assert.match(source, /return \(\) => \{[\s\S]*void discard\(\)/);
    // The point of this guard is that nothing starts a recording on its own.
    // §2 "1h".2 added one effect, and it only samples loudness for the waveform,
    // so the ban is on what an effect may do rather than on effects existing.
    const effectBodies = source.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\n\s*\}, \[/g) ?? [];
    for (const body of effectBodies) {
      assert.doesNotMatch(body, /recorder\.record\(\)/);
      assert.doesNotMatch(body, /prepareToRecordAsync\(\)/);
      assert.doesNotMatch(body, /requestRecordingPermissionsAsync\(\)/);
    }
  });
});

describe("1h recording loudness", () => {
  it("maps dBFS onto the bar, floors the inaudible and clamps the loudest", () => {
    // 0 dBFS is as loud as the microphone encodes; the floor and anything under
    // it is a flat line, and a missing sample is silence rather than a crash.
    assert.equal(normalizeMobileVoiceMeterLevel(0), 1);
    assert.equal(normalizeMobileVoiceMeterLevel(VOICE_MESSAGE_METER_FLOOR_DB), 0);
    assert.equal(normalizeMobileVoiceMeterLevel(-160), 0);
    assert.equal(normalizeMobileVoiceMeterLevel(undefined), 0);
    assert.equal(normalizeMobileVoiceMeterLevel(Number.NaN), 0);

    // Speech sits well above halfway, which is the point of the curve: a linear
    // map would draw ordinary talking as a barely-there ripple.
    const speech = normalizeMobileVoiceMeterLevel(-20);
    assert.ok(speech > 0.6 && speech < 1, `unexpected speech level ${speech}`);
  });

  it("keeps only the newest window of samples, oldest first", () => {
    const window = 4;
    let levels: readonly number[] = [];
    for (const level of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
      levels = appendMobileVoiceMeterLevel(levels, level, window);
    }

    assert.deepEqual(levels, [0.3, 0.4, 0.5, 0.6]);
    assert.equal(appendMobileVoiceMeterLevel([], 0.5, window).length, 1);
  });
});
