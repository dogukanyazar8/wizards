import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VoiceMediaPolicySchema } from "./voice-media-policy";

describe("voice media policy contract", () => {
  it("accepts only supported channel bitrate and video modes", () => {
    assert.deepEqual(
      VoiceMediaPolicySchema.parse({ audioBitrate: 128_000, videoQualityMode: "FULL" }),
      { audioBitrate: 128_000, videoQualityMode: "FULL" },
    );

    for (const audioBitrate of [32_000, 64_000, 96_000, 128_000]) {
      assert.equal(
        VoiceMediaPolicySchema.safeParse({ audioBitrate, videoQualityMode: "AUTO" }).success,
        true,
      );
    }
    assert.equal(
      VoiceMediaPolicySchema.safeParse({ audioBitrate: 48_000, videoQualityMode: "AUTO" }).success,
      false,
    );
    assert.equal(
      VoiceMediaPolicySchema.safeParse({ audioBitrate: 64_000, videoQualityMode: "LOW" }).success,
      false,
    );
  });
});
