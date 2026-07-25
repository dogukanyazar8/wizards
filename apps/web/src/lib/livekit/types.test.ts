import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CreateLiveKitTokenBodySchema } from "./types";

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
