import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MessageCreatedAnalyticsPayloadSchema,
  OUTBOX_JOB_TYPES,
  enqueueAttachmentScanJob,
  enqueueChannelMentionNotificationJob,
  enqueueChannelThreadReplyNotificationJob,
  enqueueDMMessageNotificationJob,
  enqueueMessageCreatedAnalyticsJob,
  resolveOutboxChannelSkipUserIds,
  getOutboxRetryDelayMs,
  logOutboxDrainMetrics,
} from "./service";

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
        { muted: false, notifyLevel: "ALL" as const, user: { locale: "tr" }, userId: "user-2" },
      ],
      senderId: "user-1",
      senderName: "Dogukan",
    });

    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.type, OUTBOX_JOB_TYPES.dmMessageNotifications);
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
