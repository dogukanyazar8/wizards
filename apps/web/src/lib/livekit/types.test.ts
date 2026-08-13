import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CreateLiveKitTokenBodySchema, LiveKitTokenResponseSchema } from "./types";

describe("CreateLiveKitTokenBodySchema", () => {
  it("requires exactly one bounded conversation or channel identifier", () => {
    assert.deepEqual(CreateLiveKitTokenBodySchema.parse({ channelId: "channel-1" }), {
      channelId: "channel-1",
    });
    assert.deepEqual(CreateLiveKitTokenBodySchema.parse({ conversationId: "dm-1" }), {
      conversationId: "dm-1",
    });

    for (const input of [{}, { channelId: "channel-1", conversationId: "dm-1" }]) {
      const result = CreateLiveKitTokenBodySchema.safeParse(input);

      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(
          result.error.issues.some(
            (issue) =>
              issue.code === "custom" &&
              issue.message === "Provide exactly one of channelId or conversationId." &&
              issue.path.join(".") === "channelId",
          ),
        );
      }
    }
  });
});

describe("LiveKitTokenResponseSchema", () => {
  it("requires the server-authoritative media policy", () => {
    const response = LiveKitTokenResponseSchema.parse({
      mediaPolicy: { audioBitrate: 96_000, videoQualityMode: "FULL" },
      token: "token",
      url: "wss://eu.example.test",
    });
    assert.equal(response.mediaPolicy.audioBitrate, 96_000);
    assert.equal(response.mediaPolicy.videoQualityMode, "FULL");
    assert.equal(
      LiveKitTokenResponseSchema.safeParse({ token: "token", url: "wss://example.test" }).success,
      false,
    );
  });
});
