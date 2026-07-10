import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAttemptTracker,
  createMemoryAttemptStore,
  createRedisAttemptStore,
} from "./attempt-tracker";

const tracker = createAttemptTracker({
  freeFailures: 2,
  initialBackoffMs: 1_000,
  keyPrefix: "rate:test:account",
  maxBackoffMs: 4_000,
  windowSeconds: 60,
});

describe("attempt tracker", () => {
  it("applies exponential backoff through the configured ceiling", async () => {
    const store = createMemoryAttemptStore();
    const identifier = "account-1";

    assert.deepEqual(
      await tracker.recordFailure({ identifier, nowMs: 100, store }),
      { failures: 1, locked: false },
    );
    assert.deepEqual(
      await tracker.recordFailure({ identifier, nowMs: 100, store }),
      { failures: 2, locked: false },
    );
    assert.deepEqual(
      await tracker.recordFailure({ identifier, nowMs: 100, store }),
      { failures: 3, locked: true, retryAfterSeconds: 1 },
    );
    assert.deepEqual(
      await tracker.assertAllowed({ identifier, nowMs: 500, store }),
      { allowed: false, retryAfterSeconds: 1 },
    );

    assert.deepEqual(
      await tracker.recordFailure({ identifier, nowMs: 1_100, store }),
      { failures: 4, locked: true, retryAfterSeconds: 2 },
    );
    assert.deepEqual(
      await tracker.recordFailure({ identifier, nowMs: 3_100, store }),
      { failures: 5, locked: true, retryAfterSeconds: 4 },
    );
    assert.deepEqual(
      await tracker.recordFailure({ identifier, nowMs: 7_100, store }),
      { failures: 6, locked: true, retryAfterSeconds: 4 },
    );
  });

  it("resets failures without affecting other account identifiers", async () => {
    const store = createMemoryAttemptStore();

    for (const identifier of ["account-1", "account-2"]) {
      await tracker.recordFailure({ identifier, nowMs: 1_000, store });
      await tracker.recordFailure({ identifier, nowMs: 1_000, store });
      await tracker.recordFailure({ identifier, nowMs: 1_000, store });
    }

    await tracker.resetFailures({ identifier: "account-1", store });

    assert.deepEqual(
      await tracker.assertAllowed({ identifier: "account-1", nowMs: 1_100, store }),
      { allowed: true },
    );
    assert.deepEqual(
      await tracker.assertAllowed({ identifier: "account-2", nowMs: 1_100, store }),
      { allowed: false, retryAfterSeconds: 1 },
    );
    assert.equal(await store.get(tracker.getKey("account-1")), null);
  });

  it("fails open from malformed stored state while preserving the configured key prefix", async () => {
    const store = createMemoryAttemptStore();
    const key = tracker.getKey("account-1");
    await store.set(key, "not-json", "EX", 60);

    assert.equal(key, "rate:test:account:account-1");
    assert.deepEqual(
      await tracker.assertAllowed({ identifier: "account-1", nowMs: 1_000, store }),
      { allowed: true },
    );
  });

  it("does not lose concurrent failure increments", async () => {
    const store = createMemoryAttemptStore();
    const productionShapeTracker = createAttemptTracker({
      freeFailures: 4,
      initialBackoffMs: 30_000,
      keyPrefix: "rate:concurrent:account",
      maxBackoffMs: 15 * 60_000,
      windowSeconds: 15 * 60,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        productionShapeTracker.recordFailure({
          identifier: "account-1",
          nowMs: 90_000,
          store,
        }),
      ),
    );

    assert.equal(results.filter((result) => result.locked).length, 1);
    assert.deepEqual(
      await productionShapeTracker.assertAllowed({
        identifier: "account-1",
        nowMs: 90_000,
        store,
      }),
      { allowed: false, retryAfterSeconds: 30 },
    );
  });

  it("records Redis failures atomically with the complete policy input", async () => {
    const calls: Array<{ args: Array<number | string>; keyCount: number; script: string }> = [];
    const redis = {
      async del() {},
      async eval(
        script: string,
        keyCount: number,
        ...args: Array<number | string>
      ) {
        calls.push({ args, keyCount, script });
        return [5, 120_000];
      },
      async get() {
        return null;
      },
      async set() {},
    };
    const store = createRedisAttemptStore(redis);

    assert.deepEqual(
      await tracker.recordFailure({
        identifier: "account-1",
        nowMs: 90_000,
        store,
      }),
      { failures: 5, locked: true, retryAfterSeconds: 30 },
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.keyCount, 1);
    assert.deepEqual(calls[0]?.args, [
      "rate:test:account:account-1",
      90_000,
      2,
      1_000,
      4_000,
      60,
    ]);
    assert.match(calls[0]?.script ?? "", /redis\.call\(\s*"SET"/);
  });
});
