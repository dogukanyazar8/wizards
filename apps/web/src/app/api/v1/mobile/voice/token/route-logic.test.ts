import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { mobileVoiceTokenPostRoute } from "./route-logic";

function dependenciesFor(
  target: { channelId: string } | { conversationId: string },
  calls: string[],
  capture: { tokenInput?: unknown },
) {
  return {
    authenticate: async () => {
      calls.push("authenticate");
      return { userId: "user-1" };
    },
    createToken: async (_userId: string, input: unknown) => {
      calls.push("create-token");
      capture.tokenInput = input;
      return {
        mediaPolicy: { audioBitrate: 64_000, videoQualityMode: "AUTO" as const },
        token: "t".repeat(16),
        url: "wss://livekit.example.com",
      };
    },
    enforceRateLimit: async () => {
      calls.push("rate-limit");
    },
    getDurationMs: () => 2,
    getErrorMetadata: () => ({}),
    getNow: () => 10,
    parseBody: async () => {
      calls.push("parse");
      return target;
    },
    recordMetric: () => {
      calls.push("metric");
    },
  };
}

describe("mobile voice token route logic", () => {
  for (const target of [
    { channelId: "channel-1" },
    { conversationId: "conversation-1" },
  ] as const) {
    it(`forwards and returns only ${Object.keys(target)[0]}`, async () => {
      const calls: string[] = [];
      const capture: { tokenInput?: unknown } = {};
      const response = await mobileVoiceTokenPostRoute(
        new Request("https://whispr.test/voice/token", { method: "POST" }),
        dependenciesFor(target, calls, capture),
      );

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
      assert.deepEqual(calls, ["authenticate", "rate-limit", "parse", "create-token", "metric"]);
      assert.deepEqual(capture.tokenInput, target);
      assert.deepEqual(await response.json(), {
        ...target,
        mediaPolicy: { audioBitrate: 64_000, videoQualityMode: "AUTO" },
        provider: "livekit",
        token: "t".repeat(16),
        url: "wss://livekit.example.com",
      });
    });
  }

  it("preserves authenticated error handling and skips downstream work", async () => {
    const calls: string[] = [];
    const response = await mobileVoiceTokenPostRoute(
      new Request("https://whispr.test/voice/token", { method: "POST" }),
      {
        ...dependenciesFor({ channelId: "channel-1" }, calls, {}),
        authenticate: async () => {
          calls.push("authenticate");
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      },
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
    assert.deepEqual(calls, ["authenticate", "metric"]);
  });
});
