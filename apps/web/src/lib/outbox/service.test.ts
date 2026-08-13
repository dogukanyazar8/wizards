import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@wizards/db";

import {
  MessageCreatedAnalyticsPayloadSchema,
  ACCOUNT_STORAGE_CLEANUP_KEYS_PER_JOB,
  OUTBOX_JOB_TYPES,
  cleanupOutboxJobs,
  drainOutboxJobs,
  enqueueAccountStorageCleanupJob,
  enqueueAttachmentScanJob,
  enqueueChannelMentionNotificationJob,
  enqueueChannelThreadReplyNotificationJob,
  enqueueDMMessageNotificationJob,
  enqueueMessageCreatedAnalyticsJob,
  resolveOutboxChannelSkipUserIds,
  getOutboxRetryDelayMs,
  logOutboxDrainMetrics,
} from "./service";

type Restore = () => void;

function patchMethod(target: object, key: string, value: unknown, restores: Restore[]) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  record[key] = value;
  restores.push(() => {
    record[key] = original;
  });
}

function outboxClient() {
  const jobs: Array<{ payload: unknown; type: string }> = [];

  return {
    client: {
      outboxJob: {
        upsert: async (args: { create: { payload: unknown; type: string } }) => {
          jobs.push({ payload: args.create.payload, type: args.create.type });
          return { id: `job-${jobs.length}` };
        },
      },
    },
    jobs,
  };
}

describe("message analytics attribution payload", () => {
  it("keeps jobs queued before this deploy parseable, in the UNKNOWN bucket", () => {
    const legacy = MessageCreatedAnalyticsPayloadSchema.parse({
      attachmentCount: 2,
      isDm: true,
      uploadedBytes: "1024",
      userId: "user-1",
    });

    assert.equal(legacy.clientType, "UNKNOWN");
    assert.equal(legacy.appVersion, undefined);
  });

  it("carries the sending client through to the worker", async () => {
    const { client, jobs } = outboxClient();

    await enqueueMessageCreatedAnalyticsJob(client, {
      attachmentCount: 0,
      attribution: { appVersion: "0.8.15", clientType: "MOBILE" },
      idempotencyKey: "analytics:dm-message:message-1",
      userId: "user-1",
    });

    assert.equal(jobs[0]?.type, OUTBOX_JOB_TYPES.messageCreatedAnalytics);
    assert.deepEqual(MessageCreatedAnalyticsPayloadSchema.parse(jobs[0]?.payload), {
      appVersion: "0.8.15",
      attachmentCount: 0,
      clientType: "MOBILE",
      isDm: false,
      uploadedBytes: "0",
      userId: "user-1",
    });
  });

  it("rejects a version string long enough to overflow the column", () => {
    assert.throws(() =>
      MessageCreatedAnalyticsPayloadSchema.parse({
        appVersion: "a".repeat(33),
        userId: "user-1",
      }),
    );
  });
});

describe("outbox service", () => {
  it("persists bounded account storage cleanup keys for durable retry", async () => {
    const { client, jobs } = outboxClient();

    await enqueueAccountStorageCleanupJob(client, {
      fileKeys: ["avatar-1", "attachment-1"],
      userId: "user-1",
    });

    assert.deepEqual(jobs, [
      {
        payload: { fileKeys: ["avatar-1", "attachment-1"] },
        type: OUTBOX_JOB_TYPES.accountStorageCleanup,
      },
    ]);
  });

  it("chunks arbitrarily large cleanup sets into worker-parseable jobs", async () => {
    const { client, jobs } = outboxClient();
    const fileKeys = Array.from(
      { length: ACCOUNT_STORAGE_CLEANUP_KEYS_PER_JOB + 1 },
      (_, index) => `file-${index}`,
    );

    await enqueueAccountStorageCleanupJob(client, { fileKeys, userId: "user-large" });

    assert.equal(jobs.length, 2);
    assert.equal((jobs[0]?.payload as { fileKeys: string[] }).fileKeys.length, 500);
    assert.deepEqual((jobs[1]?.payload as { fileKeys: string[] }).fileKeys, ["file-500"]);
  });

  it("bounds retention cleanup to one ordered batch", async () => {
    const restores: Restore[] = [];
    let findArgs: unknown;
    let deleteArgs: unknown;

    patchMethod(
      prisma.outboxJob,
      "findMany",
      async (args: unknown) => {
        findArgs = args;
        return [{ id: "job-1" }, { id: "job-2" }];
      },
      restores,
    );
    patchMethod(
      prisma.outboxJob,
      "deleteMany",
      async (args: unknown) => {
        deleteArgs = args;
        return { count: 2 };
      },
      restores,
    );

    try {
      const now = new Date("2026-08-12T12:00:00.000Z");
      await cleanupOutboxJobs(now);

      assert.deepEqual(findArgs, {
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        select: { id: true },
        take: 500,
        where: {
          OR: [
            {
              status: "COMPLETED",
              updatedAt: { lt: new Date("2026-08-05T12:00:00.000Z") },
            },
            {
              status: "FAILED",
              updatedAt: { lt: new Date("2026-07-13T12:00:00.000Z") },
            },
          ],
        },
      });
      assert.deepEqual(deleteArgs, { where: { id: { in: ["job-1", "job-2"] } } });
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("renews and completes a claimed job only under the current worker lease", async () => {
    const restores: Restore[] = [];
    const writes: Array<{ method: string; value: Record<string, unknown> }> = [];

    patchMethod(
      prisma,
      "$queryRaw",
      async () => [
        {
          attempts: 1,
          id: "job-1",
          maxAttempts: 8,
          payload: { adminUserId: "admin-1", campaignId: "campaign-1" },
          type: OUTBOX_JOB_TYPES.campaignSend,
        },
      ],
      restores,
    );
    patchMethod(
      prisma.notificationCampaign,
      "findUnique",
      async () => ({ status: "CANCELLED" }),
      restores,
    );
    patchMethod(prisma.outboxJob, "count", async () => 0, restores);
    patchMethod(prisma.outboxJob, "findFirst", async () => null, restores);
    patchMethod(
      prisma.outboxJob,
      "update",
      async (args: Record<string, unknown>) => {
        writes.push({ method: "update", value: args });
        return {};
      },
      restores,
    );
    patchMethod(
      prisma.outboxJob,
      "updateMany",
      async (args: Record<string, unknown>) => {
        writes.push({ method: "updateMany", value: args });
        return { count: 1 };
      },
      restores,
    );

    try {
      await drainOutboxJobs({ limit: 1, workerId: "worker-a" });

      const renewed = writes.find(
        ({ value }) =>
          (value.data as Record<string, unknown> | undefined)?.lockedAt instanceof Date,
      );
      const completed = writes.find(
        ({ value }) => (value.data as Record<string, unknown> | undefined)?.status === "COMPLETED",
      );
      assert.equal(
        (renewed?.value.where as Record<string, unknown> | undefined)?.lockedBy,
        "worker-a",
      );
      assert.equal(
        (completed?.value.where as Record<string, unknown> | undefined)?.lockedBy,
        "worker-a",
      );
      assert.equal(completed?.method, "updateMany");
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

  it("keeps storage cleanup retryable when UploadThing credentials are unavailable", async () => {
    const restores: Restore[] = [];
    const previousToken = process.env.UPLOADTHING_TOKEN;
    const statuses: string[] = [];
    delete process.env.UPLOADTHING_TOKEN;

    patchMethod(
      prisma,
      "$queryRaw",
      async () => [
        {
          attempts: 1,
          id: "job-storage-cleanup",
          maxAttempts: 8,
          payload: { fileKeys: ["attachment-1"] },
          type: OUTBOX_JOB_TYPES.accountStorageCleanup,
        },
      ],
      restores,
    );
    patchMethod(prisma.outboxJob, "count", async () => 0, restores);
    patchMethod(prisma.outboxJob, "findFirst", async () => null, restores);
    patchMethod(prisma.outboxJob, "update", async () => ({}), restores);
    patchMethod(
      prisma.outboxJob,
      "updateMany",
      async (args: { data?: { status?: string } }) => {
        if (args.data?.status) statuses.push(args.data.status);
        return { count: 1 };
      },
      restores,
    );

    try {
      await drainOutboxJobs({ limit: 1, workerId: "worker-a" });
      assert.deepEqual(statuses, ["PENDING"]);
    } finally {
      if (previousToken === undefined) delete process.env.UPLOADTHING_TOKEN;
      else process.env.UPLOADTHING_TOKEN = previousToken;
      for (const restore of restores.reverse()) restore();
    }
  });

  it("continues the batch when recording one job failure also fails", async () => {
    const restores: Restore[] = [];
    let completed = 0;

    patchMethod(
      prisma,
      "$queryRaw",
      async () => [
        {
          attempts: 1,
          id: "job-bad",
          maxAttempts: 8,
          payload: {},
          type: OUTBOX_JOB_TYPES.campaignSend,
        },
        {
          attempts: 1,
          id: "job-good",
          maxAttempts: 8,
          payload: { adminUserId: "admin-1", campaignId: "campaign-1" },
          type: OUTBOX_JOB_TYPES.campaignSend,
        },
      ],
      restores,
    );
    patchMethod(
      prisma.notificationCampaign,
      "findUnique",
      async () => ({ status: "CANCELLED" }),
      restores,
    );
    patchMethod(prisma.outboxJob, "count", async () => 0, restores);
    patchMethod(prisma.outboxJob, "findFirst", async () => null, restores);
    patchMethod(
      prisma.outboxJob,
      "update",
      async (args: { data?: { status?: string } }) => {
        if (args.data?.status === "COMPLETED") {
          completed += 1;
          return {};
        }
        throw new Error("failure update unavailable");
      },
      restores,
    );
    patchMethod(
      prisma.outboxJob,
      "updateMany",
      async (args: { data?: { lastError?: string; status?: string } }) => {
        if (args.data?.lastError) {
          throw new Error("failure update unavailable");
        }
        if (args.data?.status === "COMPLETED") {
          completed += 1;
        }
        return { count: 1 };
      },
      restores,
    );

    try {
      await drainOutboxJobs({ limit: 2, workerId: "worker-a" });
      assert.equal(completed, 1);
    } finally {
      for (const restore of restores.reverse()) {
        restore();
      }
    }
  });

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

/**
 * The notification row has to be written by the same transaction that writes the
 * message. Enqueueing after the commit meant a process that died — or an enqueue
 * that simply failed, since the call site discarded the promise — committed a
 * message nobody was ever told about.
 */
describe("notification jobs enqueue through the caller's transaction", () => {
  it("writes the channel mention job with the transaction client", async () => {
    const { client, jobs } = outboxClient();

    await enqueueChannelMentionNotificationJob(client, {
      channelId: "channel-1",
      channelName: "genel",
      content: "@ada bak",
      messageId: "message-1",
      senderId: "user-1",
      senderName: "Dogukan",
      serverId: "server-1",
    });

    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.type, OUTBOX_JOB_TYPES.channelMentionNotifications);
  });

  it("writes the thread reply job with the transaction client", async () => {
    const { client, jobs } = outboxClient();

    await enqueueChannelThreadReplyNotificationJob(client, {
      channelId: "channel-1",
      channelName: "genel",
      content: "cevap",
      messageId: "message-2",
      parentMessageId: "message-1",
      senderId: "user-1",
      senderName: "Dogukan",
      serverId: "server-1",
    });

    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.type, OUTBOX_JOB_TYPES.channelThreadReplyNotification);
  });

  it("writes the DM job with the transaction client", async () => {
    const { client, jobs } = outboxClient();

    await enqueueDMMessageNotificationJob(client, {
      attachmentLabelKey: "",
      content: "selam",
      conversationId: "conversation-1",
      mentionedUserIds: [],
      messageId: "message-3",
      participants: [
        {
          muted: false,
          notifyLevel: "ALL" as const,
          user: { locale: "tr", email: "must-not-enter-outbox", username: "hidden" },
          userId: "user-2",
          joinedAt: new Date("2026-08-12T00:00:00.000Z"),
        } as never,
      ],
      senderId: "user-1",
      senderName: "Dogukan",
    });

    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.type, OUTBOX_JOB_TYPES.dmMessageNotifications);
    assert.deepEqual((jobs[0]?.payload as { participants: unknown[] }).participants, [
      {
        muted: false,
        notifyLevel: "ALL",
        user: { locale: "tr" },
        userId: "user-2",
      },
    ]);
  });
});

/**
 * `skipUserIds` used to come from the socket fan-out, which only exists after the
 * commit — so it cannot travel with a job written inside the transaction. The
 * worker resolves it instead, from the read cursors, which is also the more honest
 * question: not "who was connected" but "who has already read this".
 */
describe("resolveOutboxChannelSkipUserIds", () => {
  const sentAt = new Date("2026-07-28T09:00:00.000Z");

  it("skips readers whose cursor is at or past the message", () => {
    assert.deepEqual(
      resolveOutboxChannelSkipUserIds(sentAt, [
        { lastReadAt: new Date("2026-07-28T09:00:00.000Z"), userId: "user-read-exact" },
        { lastReadAt: new Date("2026-07-28T09:00:05.000Z"), userId: "user-read-after" },
        { lastReadAt: new Date("2026-07-28T08:59:59.000Z"), userId: "user-behind" },
      ]),
      ["user-read-exact", "user-read-after"],
    );
  });

  it("keeps the payload's own skip list working for jobs queued before this deploy", () => {
    assert.deepEqual(resolveOutboxChannelSkipUserIds(sentAt, [], ["legacy-user"]), ["legacy-user"]);
  });

  it("returns nothing when nobody has read it", () => {
    assert.deepEqual(resolveOutboxChannelSkipUserIds(sentAt, []), []);
  });
});
