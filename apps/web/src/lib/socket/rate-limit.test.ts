import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Redis from "ioredis";

import {
  CHANNEL_MESSAGE_RATE_LIMIT,
  checkChannelMessageRateLimit,
  checkDMMessageRateLimits,
  DM_MESSAGE_CONVERSATION_RATE_LIMIT,
  DM_MESSAGE_GLOBAL_RATE_LIMIT,
  RATE_LIMIT_UNAVAILABLE_LOG_INTERVAL_MS,
  shouldLogRateLimitUnavailable,
} from "./rate-limits";

describe("socket DM rate limit configuration", () => {
  const redis = {} as Redis;

  it("uses the configured channel message cap", async () => {
    const result = await checkChannelMessageRateLimit({
      rateLimitCheck: async (_redis, key, limit, windowSeconds) => {
        assert.equal(key, "rate:msg:user-1");
        assert.equal(limit, CHANNEL_MESSAGE_RATE_LIMIT.limit);
        assert.equal(windowSeconds, CHANNEL_MESSAGE_RATE_LIMIT.windowSeconds);
        return false;
      },
      redis,
      userId: "user-1",
    });

    assert.equal(result.status, "limited");
  });

  it("returns unavailable instead of throwing when channel rate limiting fails", async () => {
    const error = new Error("redis unavailable");
    const result = await checkChannelMessageRateLimit({
      rateLimitCheck: async () => {
        throw error;
      },
      redis,
      userId: "user-1",
    });

    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.equal(result.error, error);
    }
  });

  it("has a global cap above the per-conversation cap", () => {
    assert.equal(DM_MESSAGE_CONVERSATION_RATE_LIMIT.limit, 30);
    assert.ok(
      DM_MESSAGE_GLOBAL_RATE_LIMIT.limit > DM_MESSAGE_CONVERSATION_RATE_LIMIT.limit,
    );
    assert.equal(
      DM_MESSAGE_GLOBAL_RATE_LIMIT.windowSeconds,
      DM_MESSAGE_CONVERSATION_RATE_LIMIT.windowSeconds,
    );
  });

  it("stops after the global DM cap when it is exhausted", async () => {
    const checkedKeys: string[] = [];
    const result = await checkDMMessageRateLimits({
      conversationId: "conversation-1",
      rateLimitCheck: async (_redis, key) => {
        checkedKeys.push(key);
        return false;
      },
      redis,
      userId: "user-1",
    });

    assert.equal(result.status, "global");
    assert.deepEqual(checkedKeys, ["rate:dm:global:user-1"]);
  });

  it("checks the per-conversation DM cap after the global cap passes", async () => {
    const result = await checkDMMessageRateLimits({
      conversationId: "conversation-1",
      rateLimitCheck: async (_redis, key) => key === "rate:dm:global:user-1",
      redis,
      userId: "user-1",
    });

    assert.equal(result.status, "conversation");
  });

  it("returns unavailable instead of throwing when DM rate limiting fails", async () => {
    const error = new Error("redis unavailable");
    const checkedKeys: string[] = [];
    const result = await checkDMMessageRateLimits({
      conversationId: "conversation-1",
      rateLimitCheck: async (_redis, key) => {
        checkedKeys.push(key);
        throw error;
      },
      redis,
      userId: "user-1",
    });

    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.equal(result.error, error);
    }
    assert.deepEqual(checkedKeys, ["rate:dm:global:user-1"]);
  });

  it("throttles unavailable logs by message scope", () => {
    const now = 1_000_000;

    assert.equal(shouldLogRateLimitUnavailable("channel-message", now), true);
    assert.equal(shouldLogRateLimitUnavailable("channel-message", now + 1), false);
    assert.equal(
      shouldLogRateLimitUnavailable(
        "channel-message",
        now + RATE_LIMIT_UNAVAILABLE_LOG_INTERVAL_MS,
      ),
      true,
    );
    assert.equal(shouldLogRateLimitUnavailable("dm-message", now + 1), true);
  });
});
