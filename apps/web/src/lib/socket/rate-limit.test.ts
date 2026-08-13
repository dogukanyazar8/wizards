import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type Redis from "ioredis";

import {
  CHANNEL_MESSAGE_EDIT_RATE_LIMIT,
  CHANNEL_MESSAGE_RATE_LIMIT,
  checkChannelMessageEditRateLimit,
  checkChannelMessageRateLimit,
  checkChannelSlowMode,
  checkDMMessageRateLimits,
  DM_MESSAGE_CONVERSATION_RATE_LIMIT,
  DM_MESSAGE_GLOBAL_RATE_LIMIT,
  RATE_LIMIT_UNAVAILABLE_GRACE_LIMIT,
  RATE_LIMIT_UNAVAILABLE_GRACE_MS,
  RATE_LIMIT_UNAVAILABLE_LOG_INTERVAL_MS,
  resetRateLimitUnavailableGraceForTest,
  shouldLogRateLimitUnavailable,
} from "./rate-limits";
import * as rateLimits from "./rate-limits";

class MemoryRateLimitGraceRedis {
  private readonly values = new Map<
    string,
    { attempts: number; expiresAt: number; firstAt: number }
  >();

  async eval(
    _script: string,
    keyCount: number,
    key: string,
    nowInput: number,
    graceMsInput: number,
    staleMsInput: number,
    limitInput: number,
  ) {
    assert.equal(keyCount, 1);

    const now = Number(nowInput);
    const graceMs = Number(graceMsInput);
    const staleMs = Number(staleMsInput);
    const limit = Number(limitInput);
    const existing = this.values.get(key);

    if (existing && now > existing.expiresAt) {
      this.values.delete(key);
    }

    const state = this.values.get(key) ?? {
      attempts: 0,
      expiresAt: now + staleMs,
      firstAt: now,
    };
    state.expiresAt = now + staleMs;
    this.values.set(key, state);

    if (now - state.firstAt > graceMs || state.attempts >= limit) {
      return 0;
    }

    state.attempts += 1;
    return 1;
  }
}

describe("socket DM rate limit configuration", () => {
  const redis = {} as Redis;

  beforeEach(() => {
    resetRateLimitUnavailableGraceForTest();
  });

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

  it("uses a separate configured channel message edit cap", async () => {
    const result = await checkChannelMessageEditRateLimit({
      rateLimitCheck: async (_redis, key, limit, windowSeconds) => {
        assert.equal(key, "rate:msg:edit:user-1");
        assert.equal(limit, CHANNEL_MESSAGE_EDIT_RATE_LIMIT.limit);
        assert.equal(windowSeconds, CHANNEL_MESSAGE_EDIT_RATE_LIMIT.windowSeconds);
        return false;
      },
      redis,
      userId: "user-1",
    });

    assert.equal(result.status, "limited");
  });

  it("scopes slow mode by channel and user and returns an exact retry delay", async () => {
    const result = await checkChannelSlowMode({
      channelId: "channel-1",
      delaySeconds: 30,
      redis,
      slowModeCheck: async (_redis, key, delaySeconds) => {
        assert.equal(key, "rate:channel-slow:channel-1:user-1");
        assert.equal(delaySeconds, 30);
        return { allowed: false, retryAfterSeconds: 17 };
      },
      userId: "user-1",
    });

    assert.deepEqual(result, { retryAfterSeconds: 17, status: "limited" });
  });

  it("does not touch Redis when slow mode is disabled", async () => {
    const result = await checkChannelSlowMode({
      channelId: "channel-1",
      delaySeconds: 0,
      redis,
      slowModeCheck: async () => {
        throw new Error("must not run");
      },
      userId: "user-1",
    });

    assert.deepEqual(result, { status: "allowed" });
  });

  it("fails closed when slow-mode storage is unavailable", async () => {
    const error = new Error("redis unavailable");
    const result = await checkChannelSlowMode({
      channelId: "channel-1",
      delaySeconds: 10,
      redis,
      slowModeCheck: async () => {
        throw error;
      },
      userId: "user-1",
    });

    assert.deepEqual(result, { error, status: "unavailable" });
  });

  it("returns unavailable instead of throwing when channel rate limiting fails", async () => {
    const error = new Error("redis unavailable");
    const graceRedis = new MemoryRateLimitGraceRedis() as unknown as Redis;
    const result = await checkChannelMessageRateLimit({
      rateLimitCheck: async () => {
        throw error;
      },
      redis: graceRedis,
      userId: "user-1",
    });

    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.equal(result.allowDuringGrace, true);
      assert.equal(result.error, error);
    }
  });

  it("bounds channel sends during a brief Redis outage grace window", async () => {
    const error = new Error("redis unavailable");
    const graceRedis = new MemoryRateLimitGraceRedis() as unknown as Redis;
    let now = 1_000_000;
    const checkUnavailable = () =>
      checkChannelMessageRateLimit({
        now: () => now,
        rateLimitCheck: async () => {
          throw error;
        },
        redis: graceRedis,
        userId: "user-1",
      });

    for (let index = 0; index < RATE_LIMIT_UNAVAILABLE_GRACE_LIMIT; index += 1) {
      const result = await checkUnavailable();
      assert.equal(result.status, "unavailable");
      if (result.status === "unavailable") {
        assert.equal(result.allowDuringGrace, true);
      }
      now += 100;
    }

    const exhausted = await checkUnavailable();
    assert.equal(exhausted.status, "unavailable");
    if (exhausted.status === "unavailable") {
      assert.equal(exhausted.allowDuringGrace, false);
    }

    now = 1_000_000 + RATE_LIMIT_UNAVAILABLE_GRACE_MS + 1;
    const expired = await checkUnavailable();
    assert.equal(expired.status, "unavailable");
    if (expired.status === "unavailable") {
      assert.equal(expired.allowDuringGrace, false);
    }
  });

  it("allows recovery immediately after a successful rate-limit check", async () => {
    const error = new Error("redis unavailable");
    const graceRedis = new MemoryRateLimitGraceRedis() as unknown as Redis;
    let shouldThrow = true;
    const result = await checkChannelMessageEditRateLimit({
      rateLimitCheck: async () => {
        if (shouldThrow) {
          throw error;
        }
        return true;
      },
      redis: graceRedis,
      userId: "user-1",
    });

    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.equal(result.allowDuringGrace, true);
    }

    shouldThrow = false;
    assert.deepEqual(
      await checkChannelMessageEditRateLimit({
        rateLimitCheck: async () => true,
        redis,
        userId: "user-1",
      }),
      { status: "allowed" },
    );

    shouldThrow = true;
    const recoveredThenUnavailable = await checkChannelMessageEditRateLimit({
      rateLimitCheck: async () => {
        throw error;
      },
      redis: graceRedis,
      userId: "user-1",
    });
    assert.equal(recoveredThenUnavailable.status, "unavailable");
    if (recoveredThenUnavailable.status === "unavailable") {
      assert.equal(recoveredThenUnavailable.allowDuringGrace, true);
    }
  });

  it("fails closed when the distributed outage grace check also cannot reach Redis", async () => {
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
      assert.equal(result.allowDuringGrace, false);
      assert.equal(result.error, error);
    }
  });

  it("has a global cap above the per-conversation cap", () => {
    assert.equal(DM_MESSAGE_CONVERSATION_RATE_LIMIT.limit, 30);
    assert.ok(DM_MESSAGE_GLOBAL_RATE_LIMIT.limit > DM_MESSAGE_CONVERSATION_RATE_LIMIT.limit);
    assert.equal(
      DM_MESSAGE_GLOBAL_RATE_LIMIT.windowSeconds,
      DM_MESSAGE_CONVERSATION_RATE_LIMIT.windowSeconds,
    );
  });

  it("bounds delivery acknowledgements by user instead of attacker-controlled conversation ids", async () => {
    type CheckDelivery = (args: {
      rateLimitCheck: (
        redis: Redis,
        key: string,
        limit: number,
        windowSeconds: number,
      ) => Promise<boolean>;
      redis: Redis;
      userId: string;
    }) => Promise<{ status: string }>;
    const checkDelivery = (rateLimits as unknown as { checkDMDeliveryAckRateLimit?: CheckDelivery })
      .checkDMDeliveryAckRateLimit;

    assert.equal(typeof checkDelivery, "function");

    const keys: string[] = [];
    const result = await checkDelivery?.({
      rateLimitCheck: async (_redis, key) => {
        keys.push(key);
        return true;
      },
      redis,
      userId: "user-1",
    });

    assert.equal(result?.status, "allowed");
    assert.deepEqual(keys, ["rate:dm:delivery:user-1"]);
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
    const graceRedis = new MemoryRateLimitGraceRedis() as unknown as Redis;
    const checkedKeys: string[] = [];
    const result = await checkDMMessageRateLimits({
      conversationId: "conversation-1",
      rateLimitCheck: async (_redis, key) => {
        checkedKeys.push(key);
        throw error;
      },
      redis: graceRedis,
      userId: "user-1",
    });

    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") {
      assert.equal(result.allowDuringGrace, true);
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
    assert.equal(shouldLogRateLimitUnavailable("channel-message-edit", now + 2), true);
  });
});
