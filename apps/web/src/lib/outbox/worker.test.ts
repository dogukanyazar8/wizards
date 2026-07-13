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
        cleanupMobileMediaUploads: async () => ({ deleted: 0, failed: 0 }),
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

  it("runs and awaits mobile media cleanup in the hourly cleanup block", async () => {
    const operations: string[] = [];
    let releaseMediaCleanup: (() => void) | undefined;
    let signalMediaStarted: (() => void) | undefined;
    const mediaStarted = new Promise<void>((resolve) => {
      signalMediaStarted = resolve;
    });

    startOutboxWorker({
      cleanupJobs: async () => {
        operations.push("cleanup.jobs");
      },
      cleanupMobileMediaUploads: async () => {
        operations.push("cleanup.media.start");
        signalMediaStarted?.();
        await new Promise<void>((resolve) => {
          releaseMediaCleanup = resolve;
        });
        operations.push("cleanup.media.end");
        return { deleted: 1, failed: 0 };
      },
      cleanupReauthChallenges: async () => {
        operations.push("cleanup.reauth");
        return 0;
      },
      drainJobs: async () => {
        operations.push("drain.jobs");
        return 0;
      },
      intervalMs: 60_000,
      runImmediately: true,
      workerId: "test-worker-media",
    });

    const started = await Promise.race([
      mediaStarted.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 50)),
    ]);
    assert.equal(started, true, "hourly cleanup never started mobile media cleanup");

    let stopped = false;
    const stopping = stopOutboxWorker({ timeoutMs: 1_000 }).then(() => {
      stopped = true;
    });
    await Promise.resolve();
    assert.equal(stopped, false);

    releaseMediaCleanup?.();
    await stopping;
    assert.deepEqual(operations, [
      "drain.jobs",
      "cleanup.jobs",
      "cleanup.reauth",
      "cleanup.media.start",
      "cleanup.media.end",
    ]);
  });
});
