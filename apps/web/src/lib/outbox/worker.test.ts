import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { cleanupExpiredSessions, startOutboxWorker, stopOutboxWorker } from "./worker";

describe("outbox worker lifecycle", () => {
  afterEach(async () => {
    await stopOutboxWorker({ timeoutMs: 50 });
  });

  it("deletes durable session rows whose bearer credentials have expired", async () => {
    const now = new Date("2026-08-12T12:00:00.000Z");
    const receivedWhere: unknown[] = [];

    const result = await cleanupExpiredSessions(
      { now },
      {
        authSession: {
          deleteMany: async ({ where }) => {
            receivedWhere.push(where);
            return { count: 3 };
          },
        },
        session: {
          deleteMany: async ({ where }) => {
            receivedWhere.push(where);
            return { count: 2 };
          },
        },
      },
    );

    assert.deepEqual(result, { count: 5 });
    assert.deepEqual(receivedWhere, [{ expiresAt: { lt: now } }, { expiresAt: { lt: now } }]);
  });

  it("waits for an in-flight drain before shutdown completes", async () => {
    let releaseDrain!: () => void;
    let drainCompleted = false;
    const drainStarted = new Promise<void>((resolve) => {
      const startedDrain = resolve;
      startOutboxWorker({
        cleanupJobs: async () => {},
        cleanupExpiredSessions: async () => ({ count: 0 }),
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
        purgeExpiredBugReports: async () => ({ deleted: 0 }),
        purgeExpiredEvidence: async () => ({ casesPurged: 0, evidenceDeleted: 0 }),
        rollUpClientHealthEvents: async () => ({ deleted: 0, summarized: 0 }),
        runImmediately: true,
        sweepBadges: async () => ({
          expired: 0,
          founderUpdated: 0,
          rarityComputed: false,
          revoked: 0,
        }),
        sweepExpiredFocus: async () => ({ restored: 0 }),
        sweepModerationCaseAlerts: async () => ({ alertedCases: 0, notified: 0 }),
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
      cleanupExpiredSessions: async ({ now }) => {
        assert.ok(now instanceof Date);
        operations.push("cleanup.sessions");
        return { count: 1 };
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
      purgeExpiredBugReports: async () => {
        operations.push("purge.bug-reports");
        return { deleted: 1 };
      },
      purgeExpiredEvidence: async () => {
        operations.push("purge.evidence");
        return { casesPurged: 0, evidenceDeleted: 0 };
      },
      rollUpClientHealthEvents: async () => {
        operations.push("rollup.health");
        return { deleted: 0, summarized: 0 };
      },
      runImmediately: true,
      sweepBadges: async () => {
        operations.push("sweep.badges");
        return { expired: 0, founderUpdated: 0, rarityComputed: false, revoked: 0 };
      },
      sweepExpiredFocus: async () => {
        operations.push("sweep.focus");
        return { restored: 0 };
      },
      sweepModerationCaseAlerts: async () => {
        operations.push("sweep.moderation-alerts");
        return { alertedCases: 0, notified: 0 };
      },
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
      // Focus windows expire in minutes, so the sweep runs on its own cadence
      // ahead of the hourly maintenance block.
      "sweep.focus",
      "cleanup.jobs",
      "cleanup.sessions",
      "cleanup.reauth",
      "cleanup.media.start",
      "cleanup.media.end",
      "rollup.health",
      "purge.bug-reports",
      "purge.evidence",
      // The only periodic hook the app has, so the stale-case alert rides it.
      "sweep.moderation-alerts",
      "sweep.badges",
    ]);
  });

  it("continues hourly maintenance after one task fails and retries the failed block", async () => {
    let cleanupAttempts = 0;
    let laterTaskRuns = 0;
    let signalSecondAttempt: (() => void) | undefined;
    const secondAttempt = new Promise<void>((resolve) => {
      signalSecondAttempt = resolve;
    });

    startOutboxWorker({
      cleanupJobs: async () => {
        cleanupAttempts += 1;
        if (cleanupAttempts === 1) {
          throw new Error("cleanup jobs unavailable");
        }
        signalSecondAttempt?.();
      },
      cleanupExpiredSessions: async () => {
        laterTaskRuns += 1;
        return { count: 0 };
      },
      cleanupMobileMediaUploads: async () => ({ deleted: 0, failed: 0 }),
      cleanupReauthChallenges: async () => 0,
      drainJobs: async () => 0,
      intervalMs: 5,
      purgeExpiredBugReports: async () => ({ deleted: 0 }),
      purgeExpiredEvidence: async () => ({ casesPurged: 0, evidenceDeleted: 0 }),
      rollUpClientHealthEvents: async () => ({ deleted: 0, summarized: 0 }),
      runImmediately: true,
      sweepBadges: async () => ({
        expired: 0,
        founderUpdated: 0,
        rarityComputed: false,
        revoked: 0,
      }),
      sweepExpiredFocus: async () => ({ restored: 0 }),
      sweepModerationCaseAlerts: async () => ({ alertedCases: 0, notified: 0 }),
      workerId: "test-worker-maintenance",
    });

    const retried = await Promise.race([
      secondAttempt.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);

    assert.equal(retried, true, "failed maintenance block advanced lastCleanupAt");
    assert.ok(laterTaskRuns >= 1, "later maintenance tasks were skipped after the first failure");
  });
});
