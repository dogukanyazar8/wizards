import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OUTBOX_JOB_TYPES,
  enqueueAttachmentScanJob,
  getOutboxRetryDelayMs,
  logOutboxDrainMetrics,
} from "./service";

describe("outbox service", () => {
  it("backs off retries without exceeding the worker cap", () => {
    assert.equal(getOutboxRetryDelayMs(1), 1000);
    assert.equal(getOutboxRetryDelayMs(2), 2000);
    assert.equal(getOutboxRetryDelayMs(8), 60000);
    assert.equal(getOutboxRetryDelayMs(20), 60000);
  });

  it("logs a structured outbox drain signal with queue delay and failed jobs", async () => {
    const logs: unknown[][] = [];

    await logOutboxDrainMetrics({
      client: {
        outboxJob: {
          async count() {
            return 3;
          },
          async findFirst() {
            return { createdAt: new Date("2026-07-08T10:00:00.000Z") };
          },
        },
      },
      logger: (...args: unknown[]) => {
        logs.push(args);
      },
      now: new Date("2026-07-08T10:00:30.000Z"),
      processedJobs: 7,
    });

    assert.deepEqual(logs, [
      [
        "[outbox]",
        {
          failedJobCount: 3,
          oldestPendingAgeMs: 30_000,
          processedJobs: 7,
          type: "outbox_drain",
        },
      ],
    ]);
  });

  it("enqueues attachment scan jobs with an idempotent per-attachment key", async () => {
    const writes: unknown[] = [];

    await enqueueAttachmentScanJob(
      {
        outboxJob: {
          async upsert(args: unknown) {
            writes.push(args);
          },
        },
      },
      { attachmentId: "attachment-1" },
    );

    assert.deepEqual(writes, [
      {
        create: {
          idempotencyKey: "attachment-scan:attachment-1",
          payload: {
            attachmentId: "attachment-1",
          },
          type: OUTBOX_JOB_TYPES.attachmentScan,
        },
        update: {},
        where: {
          idempotencyKey: "attachment-scan:attachment-1",
        },
      },
    ]);
  });
});
