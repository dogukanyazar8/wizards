import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRedisTotpReplayStore, TOTP_REPLAY_TTL_SECONDS } from "./totp-replay";

class MemoryRedis {
  fail = false;
  readonly calls: Array<{
    condition: "NX";
    key: string;
    mode: "EX";
    seconds: number;
    value: string;
  }> = [];
  readonly values = new Set<string>();

  async set(key: string, value: string, mode: "EX", seconds: number, condition: "NX") {
    if (this.fail) {
      throw new Error("Redis unavailable.");
    }
    this.calls.push({ condition, key, mode, seconds, value });
    if (this.values.has(key)) {
      return null;
    }
    this.values.add(key);
    return "OK" as const;
  }
}

describe("TOTP replay store", () => {
  it("claims a user counter once with a TTL longer than the acceptance window", async () => {
    const redis = new MemoryRedis();
    const store = createRedisTotpReplayStore(redis);

    assert.equal(await store.consume({ counter: 3, userId: "user-1" }), true);
    assert.equal(await store.consume({ counter: 3, userId: "user-1" }), false);
    assert.equal(TOTP_REPLAY_TTL_SECONDS, 120);
    assert.deepEqual(redis.calls[0], {
      condition: "NX",
      key: "auth:two-factor:replay:user-1:3",
      mode: "EX",
      seconds: 120,
      value: "1",
    });
  });

  it("allows the same counter for another user", async () => {
    const store = createRedisTotpReplayStore(new MemoryRedis());

    assert.equal(await store.consume({ counter: 3, userId: "user-1" }), true);
    assert.equal(await store.consume({ counter: 3, userId: "user-2" }), true);
  });

  it("allows only one concurrent claim", async () => {
    const store = createRedisTotpReplayStore(new MemoryRedis());
    const results = await Promise.all(
      Array.from({ length: 8 }, () => store.consume({ counter: 3, userId: "user-1" })),
    );

    assert.equal(results.filter(Boolean).length, 1);
  });

  it("propagates Redis errors for fail-closed handling", async () => {
    const redis = new MemoryRedis();
    redis.fail = true;
    const store = createRedisTotpReplayStore(redis);

    await assert.rejects(
      () => store.consume({ counter: 3, userId: "user-1" }),
      /Redis unavailable/u,
    );
  });
});
