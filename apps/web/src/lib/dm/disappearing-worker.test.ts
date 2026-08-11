import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DISAPPEARING_LOCK_TTL_MS,
  runDisappearingSweep,
  type DisappearingSweepDependencies,
} from "./disappearing-worker";

type Trace = string[];

function dependencies(overrides: Partial<DisappearingSweepDependencies> = {}): {
  deps: DisappearingSweepDependencies;
  errors: unknown[];
  trace: Trace;
} {
  const trace: Trace = [];
  const errors: unknown[] = [];

  const deps: DisappearingSweepDependencies = {
    acquireLock: async (ttlMs) => {
      trace.push(`acquire:${ttlMs}`);
      return "token-1";
    },
    logError: (_message, error) => {
      errors.push(error);
    },
    purge: async ({ limit }) => {
      trace.push(`purge:${limit}`);
      return { deleted: 3 };
    },
    releaseLock: async (token) => {
      trace.push(`release:${token}`);
    },
    ...overrides,
  };

  return { deps, errors, trace };
}

describe("runDisappearingSweep", () => {
  it("takes the lock, sweeps, then gives the lock back", async () => {
    const { deps, trace } = dependencies();

    const result = await runDisappearingSweep({ limit: 500 }, deps);

    assert.deepEqual(result, { deleted: 3, skipped: false });
    assert.deepEqual(trace, [
      `acquire:${DISAPPEARING_LOCK_TTL_MS}`,
      "purge:500",
      "release:token-1",
    ]);
  });

  it("does nothing when another instance holds the lock", async () => {
    // C3: the worker runs on one instance. Every web replica starts a timer, so
    // the lock is what keeps them from deleting the same batch three times.
    let requestedTtlMs = 0;
    const { deps, trace } = dependencies({
      acquireLock: async (ttlMs) => {
        requestedTtlMs = ttlMs;
        return null;
      },
    });

    const result = await runDisappearingSweep({ limit: 500 }, deps);

    assert.deepEqual(result, { deleted: 0, skipped: true });
    assert.equal(requestedTtlMs, DISAPPEARING_LOCK_TTL_MS);
    // No purge and no release: the tick costs one Redis round trip.
    assert.deepEqual(trace, []);
  });

  it("releases the lock even when the sweep throws", async () => {
    // A held lock after a crash would stop every later tick until it expired.
    const { deps, errors, trace } = dependencies({
      purge: async () => {
        throw new Error("database unavailable");
      },
    });

    const result = await runDisappearingSweep({ limit: 500 }, deps);

    assert.deepEqual(result, { deleted: 0, skipped: false });
    assert.equal(errors.length, 1);
    assert.deepEqual(trace, [`acquire:${DISAPPEARING_LOCK_TTL_MS}`, "release:token-1"]);
  });

  it("survives a Redis outage by skipping the tick rather than dying", async () => {
    const { deps, errors } = dependencies({
      acquireLock: async () => {
        throw new Error("redis unavailable");
      },
    });

    const result = await runDisappearingSweep({ limit: 500 }, deps);

    assert.deepEqual(result, { deleted: 0, skipped: true });
    assert.equal(errors.length, 1);
  });

  it("does not fail the sweep when the release itself fails", async () => {
    // The lock expires on its own; a throw here would mark a successful purge
    // as failed and log noise every minute.
    const { deps, errors } = dependencies({
      releaseLock: async () => {
        throw new Error("redis unavailable");
      },
    });

    const result = await runDisappearingSweep({ limit: 500 }, deps);

    assert.equal(result.deleted, 3);
    assert.equal(errors.length, 1);
  });

  it("keeps the lock shorter than the tick it protects", () => {
    // A TTL longer than the interval would let one slow sweep block the next
    // one forever; shorter means a dead holder is forgotten before the retry.
    assert.ok(DISAPPEARING_LOCK_TTL_MS < 60_000);
  });
});
