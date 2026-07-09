import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { startOutboxWorker, stopOutboxWorker } from "./worker";

describe("outbox worker lifecycle", () => {
  afterEach(async () => {
    await stopOutboxWorker({ timeoutMs: 50 });
  });

  it("waits for an in-flight drain before shutdown completes", async () => {
    let releaseDrain!: () => void;
    let drainCompleted = false;
    const drainStarted = new Promise<void>((resolve) => {
      const startedDrain = resolve;
      startOutboxWorker({
        cleanupJobs: async () => {},
        cleanupReauthChallenges: async () => 0,
        drainJobs: async () => {
          startedDrain();
          await new Promise<void>((resolveDrain) => {
            releaseDrain = resolveDrain;
          });
          drainCompleted = true;
          return 1;
        },
        intervalMs: 60_000,
        runImmediately: true,
        workerId: "test-worker",
      });
    });

    await drainStarted;
    const stopped = stopOutboxWorker({ timeoutMs: 1_000 });
    await Promise.resolve();

    assert.equal(drainCompleted, false);
    releaseDrain();
    await stopped;
    assert.equal(drainCompleted, true);
  });
});
