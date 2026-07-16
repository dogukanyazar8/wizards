import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

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
    assert.doesNotMatch(source, /useEffect\s*\(/);
  });
});
