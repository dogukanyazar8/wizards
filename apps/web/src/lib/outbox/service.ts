import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@wizards/db";
import type { DMNotifyLevel } from "@wizards/types";
import { z } from "zod";

import { recordMessageCreated } from "@/lib/analytics/service";
import type { ClientAttribution } from "@/lib/analytics/client-attribution";
import { processAttachmentScanJob } from "@/lib/attachments/scanner";
import { createDMMessageNotifications } from "@/lib/dm/notification-service";
import { deleteUploadThingFileKeys } from "@/lib/account/uploadthing-cleanup";
import {
  processScheduledEventCreatedNotificationsJob,
  processScheduledEventReminderJob,
  ScheduledEventCreatedNotificationsPayloadSchema,
  ScheduledEventReminderPayloadSchema,
} from "@/lib/events/notifications";
import { logError } from "@/lib/logger";
import { sendNotificationCampaign } from "@/lib/admin/notification-campaigns";
import { getSocketServer } from "@/lib/socket/runtime";
import { publishPermissionCacheRevision } from "@/lib/workspace/permission-cache";
import { PERMISSION_CACHE_REVISION_JOB_TYPE } from "@/lib/workspace/authorization-revision";
import {
  createChannelEveryoneNotifications,
  createChannelMentionNotifications,
  createChannelThreadReplyNotification,
} from "@/lib/workspace/message-notification-service";
import { createRoleMentionNotifications } from "@/lib/workspace/role-mention-service";

const OUTBOX_STATUS_PENDING = "PENDING";
const OUTBOX_STATUS_PROCESSING = "PROCESSING";
const OUTBOX_STATUS_COMPLETED = "COMPLETED";
const OUTBOX_STATUS_FAILED = "FAILED";
const OUTBOX_STALE_PROCESSING_MS = 5 * 60 * 1000;
const OUTBOX_MAX_ERROR_LENGTH = 1000;
const OUTBOX_COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const OUTBOX_FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const OUTBOX_CLEANUP_BATCH_SIZE = 500;
export const ACCOUNT_STORAGE_CLEANUP_KEYS_PER_JOB = 500;

export const OUTBOX_JOB_TYPES = {
  accountStorageCleanup: "ACCOUNT_STORAGE_CLEANUP",
  attachmentScan: "ATTACHMENT_SCAN",
  campaignSend: "CAMPAIGN_SEND",
  channelMentionNotifications: "CHANNEL_MENTION_NOTIFICATIONS",
  channelThreadReplyNotification: "CHANNEL_THREAD_REPLY_NOTIFICATION",
  dmMessageNotifications: "DM_MESSAGE_NOTIFICATIONS",
  /** Bahsedilmeler Ş2 / K2 — `@herkes` yalnız bildirim üretir, `MessageMention` satırı yazmaz. */
  everyoneMentionNotifications: "EVERYONE_MENTION_NOTIFICATIONS",
  messageCreatedAnalytics: "MESSAGE_CREATED_ANALYTICS",
  permissionCacheRevision: PERMISSION_CACHE_REVISION_JOB_TYPE,
  /** Bahsedilmeler Ş2 / K1 — rol üyelerine fan-out. */
  roleMentionNotifications: "ROLE_MENTION_NOTIFICATIONS",
  /**
   * Etkinlikler Ş3 / §3 — `POST /events` sunucu üyelerine bildirim yazar. Fan-out senkron
   * yazılmaz: 2.000 üyeli bir sunucuda oluşturma isteği bildirimlerin altında kalırdı.
   */
  scheduledEventCreatedNotifications: "SCHEDULED_EVENT_CREATED_NOTIFICATIONS",
  /**
   * Etkinlikler Ş3 / K5 — `availableAt = startsAt − minutesBefore`. Kuyruğun kendisi
   * zamanlayıcıdır; ayrı bir timer süreci yok.
   */
  scheduledEventReminder: "SCHEDULED_EVENT_REMINDER",
} as const;

type OutboxJobType = (typeof OUTBOX_JOB_TYPES)[keyof typeof OUTBOX_JOB_TYPES];

type OutboxClient = {
  outboxJob: {
    updateMany?(args: Prisma.OutboxJobUpdateManyArgs): Promise<{ count: number }>;
    upsert(args: Prisma.OutboxJobUpsertArgs): Promise<unknown>;
  };
};

type EnqueueOutboxJobInput = {
  /** When the drain may first pick the job up. Defaults to immediately. */
  availableAt?: Date;
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

export const MessageCreatedAnalyticsPayloadSchema = z.object({
  // Defaults, not required fields: jobs already queued when this deploys must
  // keep parsing. They simply land in the UNKNOWN bucket.
  appVersion: z.string().max(32).optional(),
  attachmentCount: z.number().int().min(0).default(0),
  clientType: z.enum(["WEB", "DESKTOP", "MOBILE", "UNKNOWN"]).default("UNKNOWN"),
  isDm: z.boolean().default(false),
  uploadedBytes: z.string().regex(/^\d+$/).default("0"),
  userId: z.string().min(1),
});

const AttachmentScanPayloadSchema = z.object({
  attachmentId: z.string().min(1),
});

export const PermissionCacheRevisionPayloadSchema = z
  .object({
    memberVersion: z.string().regex(/^\d+$/).optional(),
    serverId: z.string().min(1),
    serverVersion: z.string().regex(/^\d+$/),
    userId: z.string().min(1).optional(),
  })
  .refine(
    (payload) =>
      (payload.memberVersion === undefined && payload.userId === undefined) ||
      (payload.memberVersion !== undefined && payload.userId !== undefined),
    "memberVersion and userId must be provided together",
  );

const AccountStorageCleanupPayloadSchema = z
  .object({
    fileKeys: z.array(z.string().min(1).max(512)).max(ACCOUNT_STORAGE_CLEANUP_KEYS_PER_JOB),
  })
  .strict();

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

const EveryoneMentionNotificationsPayloadSchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string(),
  content: z.string(),
  messageId: z.string().min(1),
  senderId: z.string().min(1),
  senderName: z.string(),
  serverId: z.string().min(1),
  skipUserIds: z.array(z.string()).default([]),
});

const RoleMentionNotificationsPayloadSchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string(),
  content: z.string(),
  messageId: z.string().min(1),
  /**
   * `Role.mentionable = false` bir rol için gönderenin `MENTION_EVERYONE` izni **gönderim
   * anında** ölçülür; drenaj anında ölçülseydi arada kaldırılmış bir izin, kullanıcının
   * yazarken sahip olduğu bir bahsetmeyi sessizce yutardı. `null` = gönderim yolunda izin
   * bitleri elde yoktu, worker kendisi okur.
   */
  senderCanMentionRestrictedRoles: z.boolean().nullable().default(null),
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
  // Defaulted, not required: jobs queued by the previous deploy carry neither
  // field and must still drain rather than fail their way to the dead letter.
  mentionedUserIds: z.array(z.string().min(1)).default([]),
  messageId: z.string().min(1),
  participants: z.array(
    z.object({
      muted: z.boolean().default(false),
      notifyLevel: z.enum(["ALL", "MENTIONS", "NONE"]).optional(),
      userId: z.string().min(1),
      user: z.object({
        locale: z.string().nullable(),
      }),
    }),
  ),
  replyToAuthorId: z.string().min(1).optional(),
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
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      type: input.type,
    },
    update: {},
  });
}

export const CampaignSendPayloadSchema = z.object({
  adminUserId: z.string().min(1),
  campaignId: z.string().min(1),
});

/**
 * A scheduled campaign is one outbox job with a future `availableAt` — the
 * existing drain loop is the scheduler, so there is no second timer to keep
 * alive or to lose jobs behind.
 */
export async function enqueueCampaignSendJob(
  client: OutboxClient,
  input: { adminUserId: string; campaignId: string; scheduledAt: Date },
) {
  const idempotencyKey = `campaign-send:${input.campaignId}`;
  const payload = toJsonValue({
    adminUserId: input.adminUserId,
    campaignId: input.campaignId,
  });
  const requeued = await client.outboxJob.updateMany?.({
    where: {
      idempotencyKey,
      status: { in: [OUTBOX_STATUS_COMPLETED, OUTBOX_STATUS_FAILED] },
    },
    data: {
      attempts: 0,
      availableAt: input.scheduledAt,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      payload,
      status: OUTBOX_STATUS_PENDING,
    },
  });

  if ((requeued?.count ?? 0) > 0) {
    return;
  }

  await enqueueOutboxJob(client, {
    availableAt: input.scheduledAt,
    idempotencyKey,
    payload,
    type: OUTBOX_JOB_TYPES.campaignSend,
  });
}

export async function enqueueMessageCreatedAnalyticsJob(
  client: OutboxClient,
  args: {
    attachmentCount?: number;
    attribution: ClientAttribution;
    idempotencyKey: string;
    isDm?: boolean;
    uploadedBytes?: bigint | number;
    userId: string;
  },
) {
  await enqueueOutboxJob(client, {
    idempotencyKey: args.idempotencyKey,
    payload: toJsonValue({
      ...(args.attribution.appVersion === null ? {} : { appVersion: args.attribution.appVersion }),
      attachmentCount: args.attachmentCount ?? 0,
      clientType: args.attribution.clientType,
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

export async function enqueueAccountStorageCleanupJob(
  client: OutboxClient,
  args: { fileKeys: readonly string[]; userId: string },
) {
  if (args.fileKeys.length === 0) return;
  for (let index = 0; index < args.fileKeys.length; index += ACCOUNT_STORAGE_CLEANUP_KEYS_PER_JOB) {
    const chunk = args.fileKeys.slice(index, index + ACCOUNT_STORAGE_CLEANUP_KEYS_PER_JOB);
    await enqueueOutboxJob(client, {
      idempotencyKey: `account-storage-cleanup:${args.userId}:${index / ACCOUNT_STORAGE_CLEANUP_KEYS_PER_JOB}`,
      payload: toJsonValue({ fileKeys: chunk }),
      type: OUTBOX_JOB_TYPES.accountStorageCleanup,
    });
  }
}

/**
 * The three notification jobs take the caller's client so they can be written by
 * the transaction that writes the message.
 *
 * They used to be enqueued after the commit, on their own connection, with the
 * promise discarded — so a process that died between the two writes, or an
 * enqueue that simply failed, committed a message that nobody was ever told
 * about. There is no retry wrapper here for the same reason: the transaction is
 * the retry. If the enqueue fails, the message is not written either.
 */
export async function enqueueChannelMentionNotificationJob(
  client: OutboxClient,
  args: {
    channelId: string;
    channelName: string;
    content: string;
    messageId: string;
    senderId: string;
    senderName: string;
    serverId: string;
  },
) {
  await enqueueOutboxJob(client, {
    idempotencyKey: `channel-mention-notifications:${args.messageId}`,
    // No `skipUserIds`: the fan-out that produced it happens after this
    // transaction commits. The worker resolves it from the read cursors instead.
    payload: toJsonValue(args),
    type: OUTBOX_JOB_TYPES.channelMentionNotifications,
  });
}

export async function enqueueRoleMentionNotificationJob(
  client: OutboxClient,
  args: {
    channelId: string;
    channelName: string;
    content: string;
    messageId: string;
    senderCanMentionRestrictedRoles: boolean | null;
    senderId: string;
    senderName: string;
    serverId: string;
  },
) {
  await enqueueOutboxJob(client, {
    idempotencyKey: `role-mention-notifications:${args.messageId}`,
    payload: toJsonValue(args),
    type: OUTBOX_JOB_TYPES.roleMentionNotifications,
  });
}

export async function enqueueEveryoneMentionNotificationJob(
  client: OutboxClient,
  args: {
    channelId: string;
    channelName: string;
    content: string;
    messageId: string;
    senderId: string;
    senderName: string;
    serverId: string;
  },
) {
  await enqueueOutboxJob(client, {
    idempotencyKey: `everyone-mention-notifications:${args.messageId}`,
    payload: toJsonValue(args),
    type: OUTBOX_JOB_TYPES.everyoneMentionNotifications,
  });
}

export async function enqueueChannelThreadReplyNotificationJob(
  client: OutboxClient,
  args: {
    channelId: string;
    channelName: string;
    content: string;
    messageId: string;
    parentMessageId: string;
    senderId: string;
    senderName: string;
    serverId: string;
  },
) {
  await enqueueOutboxJob(client, {
    idempotencyKey: `channel-thread-reply-notification:${args.messageId}`,
    payload: toJsonValue(args),
    type: OUTBOX_JOB_TYPES.channelThreadReplyNotification,
  });
}

export async function enqueueDMMessageNotificationJob(
  client: OutboxClient,
  args: {
    attachmentLabelKey: string;
    content: string;
    conversationId: string;
    mentionedUserIds: readonly string[];
    messageId: string;
    participants: Array<{
      muted: boolean;
      notifyLevel: DMNotifyLevel;
      userId: string;
      user: {
        locale: string | null;
      };
    }>;
    replyToAuthorId?: string;
    senderId: string;
    senderName: string;
  },
) {
  await enqueueOutboxJob(client, {
    idempotencyKey: `dm-message-notifications:${args.messageId}`,
    // Callers often hold a richer roster projection. Persist only fields the
    // worker reads; a TypeScript cast never trims an object at runtime.
    payload: toJsonValue({
      ...args,
      participants: args.participants.map((participant) => ({
        muted: participant.muted,
        notifyLevel: participant.notifyLevel,
        userId: participant.userId,
        user: { locale: participant.user.locale },
      })),
    }),
    type: OUTBOX_JOB_TYPES.dmMessageNotifications,
  });
}

/**
 * Who not to notify about a channel message: everyone whose read cursor already
 * covers it.
 *
 * The payload's own `skipUserIds` is still honoured so jobs queued by the
 * previous deploy — where the list came from the socket fan-out — keep behaving
 * as they did.
 */
export function resolveOutboxChannelSkipUserIds(
  sentAt: Date,
  readStates: readonly { readonly lastReadAt: Date; readonly userId: string }[],
  payloadSkipUserIds: readonly string[] = [],
): string[] {
  const skip = new Set(payloadSkipUserIds);
  for (const state of readStates) {
    if (state.lastReadAt.getTime() >= sentAt.getTime()) {
      skip.add(state.userId);
    }
  }

  return [...skip];
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

async function renewOutboxJobLease(jobId: string, workerId: string) {
  const result = await prisma.outboxJob.updateMany({
    where: { id: jobId, lockedBy: workerId, status: OUTBOX_STATUS_PROCESSING },
    data: { lockedAt: new Date() },
  });
  return result.count > 0;
}

async function markOutboxJobCompleted(jobId: string, workerId: string) {
  await prisma.outboxJob.updateMany({
    // The worker id is the lease fence. An expired worker must not complete a
    // claim that another replica has already recovered.
    where: { id: jobId, lockedBy: workerId, status: OUTBOX_STATUS_PROCESSING },
    data: {
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      status: OUTBOX_STATUS_COMPLETED,
    },
  });
}

async function markOutboxJobFailed(job: ClaimedOutboxJob, error: unknown, workerId: string) {
  const willRetry = job.attempts < job.maxAttempts;
  await prisma.outboxJob.updateMany({
    where: { id: job.id, lockedBy: workerId, status: OUTBOX_STATUS_PROCESSING },
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

async function processMessageCreatedAnalytics(job: ClaimedOutboxJob, workerId: string) {
  const payload = MessageCreatedAnalyticsPayloadSchema.parse(job.payload);
  await prisma.$transaction(async (tx) => {
    await recordMessageCreated(
      {
        attachmentCount: payload.attachmentCount,
        isDm: payload.isDm,
        uploadedBytes: BigInt(payload.uploadedBytes),
        userId: payload.userId,
      },
      { appVersion: payload.appVersion ?? null, clientType: payload.clientType },
      tx,
    );
    const completion = await tx.outboxJob.updateMany({
      where: { id: job.id, lockedBy: workerId, status: OUTBOX_STATUS_PROCESSING },
      data: {
        lastError: null,
        lockedAt: null,
        lockedBy: null,
        status: OUTBOX_STATUS_COMPLETED,
      },
    });
    if (completion.count === 0) {
      throw new Error("Outbox lease was lost before analytics completion");
    }
  });
}

async function processNotificationJob(job: ClaimedOutboxJob) {
  const io = getSocketServer() ?? undefined;
  const withSocketServer = <T extends object>(payload: T) => (io ? { ...payload, io } : payload);

  if (job.type === OUTBOX_JOB_TYPES.channelMentionNotifications) {
    const payload = ChannelMentionNotificationsPayloadSchema.parse(job.payload);
    // The sender's fan-out no longer travels with the job, so the readers are
    // resolved here — from the cursors, which by now also cover anyone who had
    // the channel open when it landed.
    const message = await prisma.message.findUnique({
      where: { id: payload.messageId },
      select: { createdAt: true },
    });
    const readStates = message
      ? await prisma.channelReadState.findMany({
          where: { channelId: payload.channelId, lastReadAt: { gte: message.createdAt } },
          select: { lastReadAt: true, userId: true },
        })
      : [];

    await createChannelMentionNotifications(
      withSocketServer({
        ...payload,
        skipUserIds: resolveOutboxChannelSkipUserIds(
          message?.createdAt ?? new Date(),
          readStates,
          payload.skipUserIds,
        ),
      }),
    );
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.roleMentionNotifications) {
    const payload = RoleMentionNotificationsPayloadSchema.parse(job.payload);
    await createRoleMentionNotifications(withSocketServer(payload));
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.everyoneMentionNotifications) {
    const payload = EveryoneMentionNotificationsPayloadSchema.parse(job.payload);
    // Aynı okuma imleci kuralı: mesaj indiğinde kanalı açık tutan kimse bildirim almaz.
    const message = await prisma.message.findUnique({
      where: { id: payload.messageId },
      select: { createdAt: true },
    });
    const readStates = message
      ? await prisma.channelReadState.findMany({
          where: { channelId: payload.channelId, lastReadAt: { gte: message.createdAt } },
          select: { lastReadAt: true, userId: true },
        })
      : [];

    await createChannelEveryoneNotifications(
      withSocketServer({
        ...payload,
        skipUserIds: resolveOutboxChannelSkipUserIds(
          message?.createdAt ?? new Date(),
          readStates,
          payload.skipUserIds,
        ),
      }),
    );
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

export type CampaignSendJobDependencies = {
  findCampaignStatus(campaignId: string): Promise<{ status: string } | null>;
  sendCampaign(args: { adminUserId: string; campaignId: string }): Promise<unknown>;
};

const defaultCampaignSendJobDependencies: CampaignSendJobDependencies = {
  findCampaignStatus: (campaignId) =>
    prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    }),
  sendCampaign: (args) => sendNotificationCampaign(args),
};

/**
 * The audience is frozen when the job runs, not when it was scheduled: a
 * campaign booked for tomorrow reaches the people who match tomorrow.
 */
export async function processCampaignSendJob(
  payload: { adminUserId: string; campaignId: string },
  dependencies: CampaignSendJobDependencies = defaultCampaignSendJobDependencies,
) {
  const campaign = await dependencies.findCampaignStatus(payload.campaignId);

  if (!campaign || campaign.status === "CANCELLED") {
    return { skipped: true };
  }

  await dependencies.sendCampaign(payload);
  return { skipped: false };
}

async function processOutboxJob(job: ClaimedOutboxJob, workerId: string) {
  if (job.type === OUTBOX_JOB_TYPES.accountStorageCleanup) {
    const payload = AccountStorageCleanupPayloadSchema.parse(job.payload);
    await deleteUploadThingFileKeys(payload.fileKeys);
    await markOutboxJobCompleted(job.id, workerId);
    return;
  }
  if (job.type === OUTBOX_JOB_TYPES.campaignSend) {
    await processCampaignSendJob(CampaignSendPayloadSchema.parse(job.payload));
    await markOutboxJobCompleted(job.id, workerId);
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.attachmentScan) {
    const payload = AttachmentScanPayloadSchema.parse(job.payload);
    await processAttachmentScanJob(payload);
    await markOutboxJobCompleted(job.id, workerId);
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.messageCreatedAnalytics) {
    await processMessageCreatedAnalytics(job, workerId);
    return;
  }

  /**
   * Etkinlikler Ş3. Gövdeler `lib/events/notifications.ts`te: bu dosya bugün dokuz iş
   * tipinin gövdesini taşıyor ve etkinlik metinleriyle birlikte büyümesin diye ayrıldı.
   */
  if (job.type === OUTBOX_JOB_TYPES.scheduledEventReminder) {
    await processScheduledEventReminderJob(ScheduledEventReminderPayloadSchema.parse(job.payload));
    await markOutboxJobCompleted(job.id, workerId);
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.scheduledEventCreatedNotifications) {
    await processScheduledEventCreatedNotificationsJob(
      ScheduledEventCreatedNotificationsPayloadSchema.parse(job.payload),
    );
    await markOutboxJobCompleted(job.id, workerId);
    return;
  }

  if (job.type === OUTBOX_JOB_TYPES.permissionCacheRevision) {
    const payload = PermissionCacheRevisionPayloadSchema.parse(job.payload);
    const revision = {
      serverId: payload.serverId,
      serverVersion: payload.serverVersion,
      ...(payload.memberVersion !== undefined ? { memberVersion: payload.memberVersion } : {}),
      ...(payload.userId !== undefined ? { userId: payload.userId } : {}),
    };
    if (!(await publishPermissionCacheRevision(revision))) {
      throw new Error("Redis is unavailable for permission-cache revision publication");
    }
    await markOutboxJobCompleted(job.id, workerId);
    return;
  }

  await processNotificationJob(job);
  await markOutboxJobCompleted(job.id, workerId);
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
      if (!(await renewOutboxJobLease(job.id, workerId))) {
        logError("[outbox] Job lease lost before processing", { jobId: job.id, workerId });
        continue;
      }
    } catch (error) {
      logError("[outbox] Job lease renewal failed", { error, jobId: job.id, workerId });
      continue;
    }

    try {
      await processOutboxJob(job, workerId);
    } catch (error) {
      logError("[outbox] Job failed", {
        attempts: job.attempts,
        error,
        jobId: job.id,
        type: job.type,
      });
      try {
        await markOutboxJobFailed(job, error, workerId);
      } catch (markError) {
        // Failure bookkeeping must not abandon the rest of the claimed batch.
        logError("[outbox] Failed to record job failure", {
          error: markError,
          jobId: job.id,
          workerId,
        });
      }
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

  const jobs = await prisma.outboxJob.findMany({
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
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: OUTBOX_CLEANUP_BATCH_SIZE,
  });

  if (jobs.length === 0) {
    return;
  }

  await prisma.outboxJob.deleteMany({ where: { id: { in: jobs.map((job) => job.id) } } });
}
