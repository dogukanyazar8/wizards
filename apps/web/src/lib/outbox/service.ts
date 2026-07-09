import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@wizards/db";
import { z } from "zod";

import { recordMessageCreated } from "@/lib/analytics/service";
import { processAttachmentScanJob } from "@/lib/attachments/scanner";
import { createDMMessageNotifications } from "@/lib/dm/notification-service";
import { logError } from "@/lib/logger";
import { getSocketServer } from "@/lib/socket/runtime";
import {
  createChannelMentionNotifications,
  createChannelThreadReplyNotification,
} from "@/lib/workspace/message-notification-service";

const OUTBOX_STATUS_PENDING = "PENDING";
const OUTBOX_STATUS_PROCESSING = "PROCESSING";
const OUTBOX_STATUS_COMPLETED = "COMPLETED";
const OUTBOX_STATUS_FAILED = "FAILED";
const OUTBOX_STALE_PROCESSING_MS = 5 * 60 * 1000;
const OUTBOX_MAX_ERROR_LENGTH = 1000;
const OUTBOX_COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const OUTBOX_FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const OUTBOX_ENQUEUE_RETRY_DELAYS_MS = [50, 150, 500] as const;

export const OUTBOX_JOB_TYPES = {
  attachmentScan: "ATTACHMENT_SCAN",
  channelMentionNotifications: "CHANNEL_MENTION_NOTIFICATIONS",
  channelThreadReplyNotification: "CHANNEL_THREAD_REPLY_NOTIFICATION",
  dmMessageNotifications: "DM_MESSAGE_NOTIFICATIONS",
  messageCreatedAnalytics: "MESSAGE_CREATED_ANALYTICS",
} as const;

type OutboxJobType = (typeof OUTBOX_JOB_TYPES)[keyof typeof OUTBOX_JOB_TYPES];

type OutboxClient = {
  outboxJob: {
    upsert(args: Prisma.OutboxJobUpsertArgs): Promise<unknown>;
  };
};

type EnqueueOutboxJobInput = {
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
  type: OutboxJobType;
};

type ClaimedOutboxJob = {
  attempts: number;
  id: string;
  maxAttempts: number;
  payload: Prisma.JsonValue;
  type: string;
};

type OutboxMetricsClient = {
  outboxJob: {
    count(args: unknown): Promise<number>;
    findFirst(args: unknown): Promise<{ createdAt: Date } | null>;
  };
};

type OutboxDrainMetricsOptions = {
  client?: OutboxMetricsClient;
  logger?: (message: string, payload: OutboxDrainLogPayload) => void;
  now?: Date;
  processedJobs: number;
};

type OutboxDrainLogPayload = {
  failedJobCount: number;
  oldestPendingAgeMs: number;
  processedJobs: number;
  type: "outbox_drain";
};

const MessageCreatedAnalyticsPayloadSchema = z.object({
  attachmentCount: z.number().int().min(0).default(0),
  isDm: z.boolean().default(false),
  uploadedBytes: z.string().regex(/^\d+$/).default("0"),
  userId: z.string().min(1),
});

const AttachmentScanPayloadSchema = z.object({
  attachmentId: z.string().min(1),
});

const ChannelMentionNotificationsPayloadSchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string(),
  content: z.string(),
  messageId: z.string().min(1),
  senderId: z.string().min(1),
  senderName: z.string(),
  serverId: z.string().min(1),
  skipUserIds: z.array(z.string()).default([]),
});

const ChannelThreadReplyNotificationPayloadSchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string(),
  content: z.string(),
  messageId: z.string().min(1),
  parentMessageId: z.string().min(1),
  senderId: z.string().min(1),
  senderName: z.string(),
  serverId: z.string().min(1),
});

const DMMessageNotificationsPayloadSchema = z.object({
  attachmentLabelKey: z.string().min(1),
  content: z.string(),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  participants: z.array(
    z.object({
      muted: z.boolean().default(false),
      userId: z.string().min(1),
      user: z.object({
        locale: z.string().nullable(),
      }),
    }),
  ),
  senderId: z.string().min(1),
  senderName: z.string(),
});

function toJsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function truncateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, OUTBOX_MAX_ERROR_LENGTH);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

export function getOutboxRetryDelayMs(attempts: number) {
  const boundedAttempts = Math.max(1, Math.min(attempts, 8));
  return Math.min(60_000, 1000 * 2 ** (boundedAttempts - 1));
}

export async function logOutboxDrainMetrics({
  client = prisma,
  logger = console.info,
  now = new Date(),
  processedJobs,
}: OutboxDrainMetricsOptions) {
  const [oldestPendingJob, failedJobCount] = await Promise.all([
    client.outboxJob.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
      where: {
        availableAt: { lte: now },
        status: OUTBOX_STATUS_PENDING,
      },
    }),
    client.outboxJob.count({
      where: {
        status: OUTBOX_STATUS_FAILED,
      },
    }),
  ]);

  logger("[outbox]", {
    failedJobCount,
    oldestPendingAgeMs: oldestPendingJob
      ? Math.max(0, now.getTime() - oldestPendingJob.createdAt.getTime())
      : 0,
    processedJobs,
    type: "outbox_drain",
  });
}

export async function enqueueOutboxJob(client: OutboxClient, input: EnqueueOutboxJobInput) {
  await client.outboxJob.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      type: input.type,
    },
    update: {},
  });
}

async function enqueueOutboxJobWithRetry(input: EnqueueOutboxJobInput) {
  for (const retryDelayMs of [0, ...OUTBOX_ENQUEUE_RETRY_DELAYS_MS]) {
    if (retryDelayMs > 0) {
      await wait(retryDelayMs);
    }

    try {
      await enqueueOutboxJob(prisma, input);
      return;
    } catch (error) {
      if (retryDelayMs === OUTBOX_ENQUEUE_RETRY_DELAYS_MS.at(-1)) {
        throw error;
      }
    }
  }
}

export async function enqueueMessageCreatedAnalyticsJob(
  client: OutboxClient,
  args: {
    attachmentCount?: number;
    idempotencyKey: string;
    isDm?: boolean;
    uploadedBytes?: bigint | number;
    userId: string;
  },
) {
  await enqueueOutboxJob(client, {
    idempotencyKey: args.idempotencyKey,
    payload: toJsonValue({
      attachmentCount: args.attachmentCount ?? 0,
      isDm: args.isDm ?? false,
      uploadedBytes: String(args.uploadedBytes ?? 0),
      userId: args.userId,
    }),
    type: OUTBOX_JOB_TYPES.messageCreatedAnalytics,
  });
}

export async function enqueueAttachmentScanJob(
  client: OutboxClient,
  args: {
    attachmentId: string;
  },
) {
  await enqueueOutboxJob(client, {
    idempotencyKey: `attachment-scan:${args.attachmentId}`,
    payload: toJsonValue({
      attachmentId: args.attachmentId,
    }),
    type: OUTBOX_JOB_TYPES.attachmentScan,
  });
}

export async function enqueueChannelMentionNotificationJob(args: {
  channelId: string;
  channelName: string;
  content: string;
  messageId: string;
  senderId: string;
  senderName: string;
  serverId: string;
  skipUserIds?: string[];
}) {
  await enqueueOutboxJobWithRetry({
    idempotencyKey: `channel-mention-notifications:${args.messageId}`,
    payload: toJsonValue({
      ...args,
      skipUserIds: args.skipUserIds ?? [],
    }),
    type: OUTBOX_JOB_TYPES.channelMentionNotifications,
  });
}

export async function enqueueChannelThreadReplyNotificationJob(args: {
  channelId: string;
  channelName: string;
  content: string;
  messageId: string;
  parentMessageId: string;
  senderId: string;
  senderName: string;
  serverId: string;
}) {
  await enqueueOutboxJobWithRetry({
    idempotencyKey: `channel-thread-reply-notification:${args.messageId}`,
    payload: toJsonValue(args),
    type: OUTBOX_JOB_TYPES.channelThreadReplyNotification,
  });
}

export async function enqueueDMMessageNotificationJob(args: {
  attachmentLabelKey: string;
  content: string;
  conversationId: string;
  messageId: string;
  participants: Array<{
    muted: boolean;
    userId: string;
    user: {
      locale: string | null;
    };
  }>;
  senderId: string;
  senderName: string;
}) {
  await enqueueOutboxJobWithRetry({
    idempotencyKey: `dm-message-notifications:${args.messageId}`,
    payload: toJsonValue(args),
    type: OUTBOX_JOB_TYPES.dmMessageNotifications,
  });
}

async function claimOutboxJobs(limit: number, workerId: string) {
  const staleBefore = new Date(Date.now() - OUTBOX_STALE_PROCESSING_MS);

  return prisma.$queryRaw<ClaimedOutboxJob[]>(Prisma.sql`
    WITH picked AS (
      SELECT "id"
      FROM "OutboxJob"
      WHERE
        (
          "status" = ${OUTBOX_STATUS_PENDING}
          AND "availableAt" <= NOW()
          AND "attempts" < "maxAttempts"
        )
        OR (
          "status" = ${OUTBOX_STATUS_PROCESSING}
          AND "lockedAt" < ${staleBefore}
          AND "attempts" < "maxAttempts"
        )
      ORDER BY "availableAt" ASC, "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "OutboxJob" job
    SET
      "status" = ${OUTBOX_STATUS_PROCESSING},
      "attempts" = job."attempts" + 1,
      "lockedAt" = NOW(),
      "lockedBy" = ${workerId},
      "updatedAt" = NOW()
    FROM picked
    WHERE job."id" = picked."id"
    RETURNING
      job."id",
      job."type",
      job."payload",
      job."attempts",
      job."maxAttempts"
  `);
}

async function markOutboxJobCompleted(jobId: string) {
  await prisma.outboxJob.update({
    where: { id: jobId },
    data: {
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      status: OUTBOX_STATUS_COMPLETED,
    },
  });
}

async function markOutboxJobFailed(job: ClaimedOutboxJob, error: unknown) {
  const willRetry = job.attempts < job.maxAttempts;
  await prisma.outboxJob.update({
    where: { id: job.id },
    data: {
      availableAt: willRetry
        ? new Date(Date.now() + getOutboxRetryDelayMs(job.attempts))
        : new Date(),
      lastError: truncateError(error),
      lockedAt: null,
      lockedBy: null,
      status: willRetry ? OUTBOX_STATUS_PENDING : OUTBOX_STATUS_FAILED,
    },
  });
}

async function processMessageCreatedAnalytics(job: ClaimedOutboxJob) {
  const payload = MessageCreatedAnalyticsPayloadSchema.parse(job.payload);
  await prisma.$transaction(async (tx) => {
    await recordMessageCreated(
      {
        attachmentCount: payload.attachmentCount,
        isDm: payload.isDm,
        uploadedBytes: BigInt(payload.uploadedBytes),
        userId: payload.userId,
      },
      tx,
    );
    await tx.outboxJob.update({
      where: { id: job.id },
      data: {
        lastError: null,
        lockedAt: null,
        lockedBy: null,
        status: OUTBOX_STATUS_COMPLETED,
      },
    });
  });
}

async function processNotificationJob(job: ClaimedOutboxJob) {
  const io = getSocketServer() ?? undefined;
  const withSocketServer = <T extends object>(payload: T) => (io ? { ...payload, io } : payload);

  if (job.type === OUTBOX_JOB_TYPES.channelMentionNotifications) {
    const payload = ChannelMentionNotificationsPayloadSchema.parse(job.payload);
    await createChannelMentionNotifications(withSocketServer(payload));
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.channelThreadReplyNotification) {
    const payload = ChannelThreadReplyNotificationPayloadSchema.parse(job.payload);
    await createChannelThreadReplyNotification(withSocketServer(payload));
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.dmMessageNotifications) {
    const payload = DMMessageNotificationsPayloadSchema.parse(job.payload);
    await createDMMessageNotifications(withSocketServer(payload));
    return;
  }

  throw new Error(`Unsupported outbox job type: ${job.type}`);
}

async function processOutboxJob(job: ClaimedOutboxJob) {
  if (job.type === OUTBOX_JOB_TYPES.attachmentScan) {
    const payload = AttachmentScanPayloadSchema.parse(job.payload);
    await processAttachmentScanJob(payload);
    await markOutboxJobCompleted(job.id);
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.messageCreatedAnalytics) {
    await processMessageCreatedAnalytics(job);
    return;
  }

  await processNotificationJob(job);
  await markOutboxJobCompleted(job.id);
}

export async function drainOutboxJobs(
  options: {
    limit?: number;
    workerId?: string;
  } = {},
) {
  const workerId = options.workerId ?? `outbox-${randomUUID()}`;
  const jobs = await claimOutboxJobs(options.limit ?? 10, workerId);

  for (const job of jobs) {
    try {
      await processOutboxJob(job);
    } catch (error) {
      logError("[outbox] Job failed", {
        attempts: job.attempts,
        error,
        jobId: job.id,
        type: job.type,
      });
      await markOutboxJobFailed(job, error);
    }
  }

  try {
    await logOutboxDrainMetrics({ processedJobs: jobs.length });
  } catch (error) {
    logError("[outbox] Metrics logging failed", error);
  }

  return jobs.length;
}

export async function cleanupOutboxJobs(now = new Date()) {
  const completedBefore = new Date(now.getTime() - OUTBOX_COMPLETED_RETENTION_MS);
  const failedBefore = new Date(now.getTime() - OUTBOX_FAILED_RETENTION_MS);

  await prisma.outboxJob.deleteMany({
    where: {
      OR: [
        {
          status: OUTBOX_STATUS_COMPLETED,
          updatedAt: { lt: completedBefore },
        },
        {
          status: OUTBOX_STATUS_FAILED,
          updatedAt: { lt: failedBefore },
        },
      ],
    },
  });
}
