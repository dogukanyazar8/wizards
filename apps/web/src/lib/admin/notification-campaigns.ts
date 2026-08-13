import type { NotificationCampaignStatus, NotificationType } from "@wizards/db";
import { Prisma, prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import type { NotificationSocketPayload } from "@/lib/socket/events";
import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import {
  freezeCampaignRecipients,
  type CampaignDeliveryCounts,
} from "@/lib/admin/campaign-delivery";

export type CampaignSegment =
  | { type: "ALL_USERS" }
  | { type: "ONLINE_USERS" }
  | { type: "RECENTLY_ACTIVE"; days: number }
  | { type: "CLIENT_TYPE"; clientType: "WEB" | "DESKTOP" | "MOBILE" }
  | { type: "COUNTRY"; countryCode: string }
  | { type: "USER_IDS"; userIds: string[] };

export type CreateCampaignInput = {
  actionUrl?: string | null;
  body: string;
  imageUrl?: string | null;
  segment: CampaignSegment;
  title: string;
  type?: NotificationType;
};

type NotificationRow = {
  actionUrl: string | null;
  body: string;
  createdAt: Date;
  id: string;
  imageUrl: string | null;
  metadata: Prisma.JsonValue | null;
  read: boolean;
  readAt: Date | null;
  title: string;
  type: NotificationType;
  userId: string;
};

const CAMPAIGN_BATCH_SIZE = 500;

/** Above this audience a campaign needs a second pair of eyes before it goes out. */
export const CAMPAIGN_APPROVAL_THRESHOLD = 1000;

const DELIVERY_ERROR_MAX_LENGTH = 280;

const SENDABLE_CAMPAIGN_STATUSES = new Set<NotificationCampaignStatus>([
  "DRAFT",
  "FAILED",
  "PENDING_APPROVAL",
  "SENDING",
]);

export type CampaignSendableCampaign = {
  actionUrl: string | null;
  approvedAt: Date | null;
  body: string;
  id: string;
  imageUrl: string | null;
  status: NotificationCampaignStatus;
  title: string;
  type: NotificationType;
};

export type CampaignNotificationInput = {
  actionUrl: string | null;
  body: string;
  campaignId: string;
  dedupeKey: string;
  imageUrl: string | null;
  metadata: Record<string, unknown>;
  title: string;
  type: NotificationType;
  userId: string;
};

export type CampaignSendDependencies = {
  completeCampaign(
    campaignId: string,
    data: {
      completedAt: Date;
      failedCount: number;
      sentCount: number;
      status: NotificationCampaignStatus;
    },
  ): Promise<unknown>;
  countDeliveries(campaignId: string): Promise<CampaignDeliveryCounts>;
  createNotification(input: CampaignNotificationInput): Promise<NotificationRow>;
  createNotificationsBatch?(inputs: CampaignNotificationInput[]): Promise<NotificationRow[]>;
  emitNotification(notification: NotificationRow): void;
  findCampaign(campaignId: string): Promise<CampaignSendableCampaign | null>;
  freezeRecipients(campaignId: string, now: Date): Promise<CampaignDeliveryCounts>;
  listPendingUserIds(campaignId: string, take: number): Promise<string[]>;
  markCampaignApprovalRequired(campaignId: string): Promise<void>;
  markCampaignSending(campaignId: string, startedAt: Date): Promise<void>;
  markDeliveryFailed(campaignId: string, userId: string, error: string): Promise<void>;
  markDeliveriesFailed?(campaignId: string, userIds: string[], error: string): Promise<void>;
  markDeliveriesSent?(campaignId: string, userIds: string[], sentAt: Date): Promise<void>;
  markDeliverySent(campaignId: string, userId: string, sentAt: Date): Promise<void>;
  requeueFailedDeliveries(campaignId: string): Promise<void>;
  writeAuditLog: typeof writeAdminAuditLog;
};

export function buildCampaignDedupeKey(campaignId: string, userId: string) {
  return `campaign:${campaignId}:${userId}`;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function describeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown delivery error";

  return message.slice(0, DELIVERY_ERROR_MAX_LENGTH);
}

function validateCampaignCopy(input: CreateCampaignInput) {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title || title.length > 140) {
    throw new ApiError("Notification title must be between 1 and 140 characters.", 400);
  }

  if (!body || body.length > 800) {
    throw new ApiError("Notification body must be between 1 and 800 characters.", 400);
  }

  return { title, body };
}

export function normalizeCampaignSegment(segment: CampaignSegment): CampaignSegment {
  switch (segment.type) {
    case "RECENTLY_ACTIVE":
      return {
        type: "RECENTLY_ACTIVE",
        days: Math.min(Math.max(Math.trunc(segment.days), 1), 90),
      };
    case "COUNTRY":
      return {
        type: "COUNTRY",
        countryCode: segment.countryCode.trim().toUpperCase().slice(0, 2),
      };
    case "USER_IDS":
      return {
        type: "USER_IDS",
        userIds: Array.from(new Set(segment.userIds.filter(Boolean))).slice(0, 10_000),
      };
    default:
      return segment;
  }
}

export async function getCampaignRecipientIds(segment: CampaignSegment) {
  const users = await prisma.user.findMany({
    where: buildCampaignRecipientWhere(segment),
    select: { id: true },
  });
  return users.map((user) => user.id);
}

function buildCampaignRecipientWhere(
  segment: CampaignSegment,
  now = new Date(),
): Prisma.UserWhereInput {
  const eligible: Prisma.UserWhereInput = { emailVerified: true, isBanned: false };

  switch (segment.type) {
    case "ALL_USERS":
      return eligible;
    case "ONLINE_USERS":
      return {
        ...eligible,
        appSessions: {
          some: { endedAt: null, lastSeenAt: { gte: new Date(now.getTime() - 2 * 60_000) } },
        },
      };
    case "RECENTLY_ACTIVE":
      return {
        ...eligible,
        appSessions: {
          some: {
            lastSeenAt: { gte: new Date(now.getTime() - segment.days * 24 * 60 * 60_000) },
          },
        },
      };
    case "CLIENT_TYPE":
      return { ...eligible, appSessions: { some: { clientType: segment.clientType } } };
    case "COUNTRY":
      return { ...eligible, appSessions: { some: { countryCode: segment.countryCode } } };
    case "USER_IDS":
      return { ...eligible, id: { in: segment.userIds } };
  }
}

export function countCampaignRecipients(segment: CampaignSegment) {
  return prisma.user.count({ where: buildCampaignRecipientWhere(segment) });
}

function serializeNotification(notification: NotificationRow): NotificationSocketPayload {
  return {
    actionUrl: notification.actionUrl,
    body: notification.body,
    createdAt: notification.createdAt.toISOString(),
    id: notification.id,
    imageUrl: notification.imageUrl,
    metadata: notification.metadata as Record<string, unknown> | null,
    read: notification.read,
    readAt: notification.readAt?.toISOString() ?? null,
    title: notification.title,
    type: notification.type,
    userId: notification.userId,
  };
}

export type CampaignCreateDependencies = {
  countRecipients(segment: CampaignSegment): Promise<number>;
  createCampaign(data: {
    actionUrl: string | null;
    body: string;
    createdById: string;
    imageUrl: string | null;
    segment: CampaignSegment;
    status: NotificationCampaignStatus;
    title: string;
    type: NotificationType;
  }): Promise<{ id: string; status: NotificationCampaignStatus }>;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultCampaignCreateDependencies: CampaignCreateDependencies = {
  countRecipients: countCampaignRecipients,
  createCampaign: (data) =>
    prisma.notificationCampaign.create({
      data: {
        ...data,
        segment: data.segment as unknown as Prisma.InputJsonValue,
      },
    }),
  writeAuditLog: writeAdminAuditLog,
};

export async function createNotificationCampaign(
  adminUserId: string,
  input: CreateCampaignInput,
  dependencies: CampaignCreateDependencies = defaultCampaignCreateDependencies,
) {
  const copy = validateCampaignCopy(input);
  const segment = normalizeCampaignSegment(input.segment);
  const recipientCount = await dependencies.countRecipients(segment);

  // The threshold follows the audience, not the segment type: hand-picking 5000
  // user ids reaches as many people as broadcasting to everybody.
  const status: NotificationCampaignStatus =
    recipientCount > CAMPAIGN_APPROVAL_THRESHOLD ? "PENDING_APPROVAL" : "DRAFT";

  const campaign = await dependencies.createCampaign({
    actionUrl: input.actionUrl ?? null,
    body: copy.body,
    createdById: adminUserId,
    imageUrl: input.imageUrl ?? null,
    segment,
    status,
    title: copy.title,
    type: input.type ?? "SYSTEM",
  });

  await dependencies.writeAuditLog({
    action: "notification_campaign.create",
    adminUserId,
    metadata: { recipientCount, segment, status },
    targetId: campaign.id,
    targetType: "NotificationCampaign",
  });

  return campaign;
}

export type CampaignApproveDependencies = {
  approve(campaignId: string, data: { approvedAt: Date; approvedById: string }): Promise<unknown>;
  findCampaign(campaignId: string): Promise<{
    approvedAt: Date | null;
    createdById: string | null;
    id: string;
    status: NotificationCampaignStatus;
  } | null>;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultCampaignApproveDependencies: CampaignApproveDependencies = {
  approve: (campaignId, data) =>
    prisma.notificationCampaign.update({ where: { id: campaignId }, data }),
  findCampaign: (campaignId) =>
    prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      select: { approvedAt: true, createdById: true, id: true, status: true },
    }),
  writeAuditLog: writeAdminAuditLog,
};

/** The second pair of eyes an oversized campaign needs; never the author's own. */
export async function approveNotificationCampaign(
  adminUserId: string,
  campaignId: string,
  dependencies: CampaignApproveDependencies = defaultCampaignApproveDependencies,
) {
  const campaign = await dependencies.findCampaign(campaignId);

  if (!campaign) {
    throw new ApiError("Notification campaign not found", 404, "NOT_FOUND");
  }

  if (campaign.status !== "PENDING_APPROVAL") {
    throw new ApiError("Notification campaign is not waiting for approval.", 409);
  }

  if (campaign.approvedAt) {
    throw new ApiError("Notification campaign is already approved.", 409);
  }

  if (campaign.createdById === adminUserId) {
    throw new ApiError("A campaign cannot be approved by the admin who created it.", 400);
  }

  const approvedAt = new Date();
  const approved = await dependencies.approve(campaignId, {
    approvedAt,
    approvedById: adminUserId,
  });

  await dependencies.writeAuditLog({
    action: "notification_campaign.approve",
    adminUserId,
    metadata: { createdById: campaign.createdById },
    targetId: campaignId,
    targetType: "NotificationCampaign",
  });

  return approved;
}

export async function previewNotificationCampaignRecipients(segment: CampaignSegment) {
  return {
    recipientCount: await countCampaignRecipients(normalizeCampaignSegment(segment)),
  };
}

export async function listNotificationCampaigns(limit = 20) {
  return prisma.notificationCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(Math.trunc(limit), 1), 100),
    select: {
      actionUrl: true,
      body: true,
      completedAt: true,
      createdAt: true,
      creator: {
        select: {
          displayName: true,
          id: true,
          username: true,
        },
      },
      failedCount: true,
      id: true,
      imageUrl: true,
      segment: true,
      sentCount: true,
      startedAt: true,
      status: true,
      title: true,
      type: true,
      updatedAt: true,
    },
  });
}

const defaultCampaignSendDependencies: CampaignSendDependencies = {
  completeCampaign: (campaignId, data) =>
    prisma.notificationCampaign.update({ where: { id: campaignId }, data }),
  countDeliveries: async (campaignId) => {
    const grouped = await prisma.campaignDelivery.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: { _all: true },
    });

    const read = (status: "FAILED" | "PENDING" | "SENT" | "SKIPPED") =>
      grouped.find((row) => row.status === status)?._count._all ?? 0;

    return {
      failed: read("FAILED"),
      pending: read("PENDING"),
      sent: read("SENT"),
      skipped: read("SKIPPED"),
    };
  },
  createNotification: (input) =>
    prisma.notification.create({
      data: {
        actionUrl: input.actionUrl,
        body: input.body,
        campaignId: input.campaignId,
        dedupeKey: input.dedupeKey,
        imageUrl: input.imageUrl,
        metadata: input.metadata as Prisma.InputJsonValue,
        title: input.title,
        type: input.type,
        userId: input.userId,
      },
    }),
  createNotificationsBatch: async (inputs) => {
    await prisma.notification.createMany({
      data: inputs.map((input) => ({
        actionUrl: input.actionUrl,
        body: input.body,
        campaignId: input.campaignId,
        dedupeKey: input.dedupeKey,
        imageUrl: input.imageUrl,
        metadata: input.metadata as Prisma.InputJsonValue,
        title: input.title,
        type: input.type,
        userId: input.userId,
      })),
    });
    return prisma.notification.findMany({
      where: { dedupeKey: { in: inputs.map((input) => input.dedupeKey) } },
    });
  },
  emitNotification: (notification) => {
    getSocketServer()
      ?.to(`user:${notification.userId}`)
      .emit("notification:new", serializeNotification(notification));
  },
  findCampaign: (campaignId) =>
    prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      select: {
        actionUrl: true,
        approvedAt: true,
        body: true,
        id: true,
        imageUrl: true,
        status: true,
        title: true,
        type: true,
      },
    }),
  freezeRecipients: (campaignId, now) => freezeCampaignRecipients(campaignId, { now }),
  listPendingUserIds: async (campaignId, take) => {
    const rows = await prisma.campaignDelivery.findMany({
      where: { campaignId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take,
      select: { userId: true },
    });

    return rows.map((row) => row.userId);
  },
  markCampaignApprovalRequired: async (campaignId) => {
    await prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: { status: "PENDING_APPROVAL" satisfies NotificationCampaignStatus },
    });
  },
  markCampaignSending: async (campaignId, startedAt) => {
    await prisma.notificationCampaign.update({
      where: { id: campaignId },
      data: { startedAt, status: "SENDING" satisfies NotificationCampaignStatus },
    });
  },
  markDeliveryFailed: async (campaignId, userId, error) => {
    await prisma.campaignDelivery.update({
      where: { campaignId_userId: { campaignId, userId } },
      data: { error, status: "FAILED" },
    });
  },
  markDeliveriesFailed: async (campaignId, userIds, error) => {
    await prisma.campaignDelivery.updateMany({
      where: { campaignId, status: "PENDING", userId: { in: userIds } },
      data: { error, status: "FAILED" },
    });
  },
  markDeliveriesSent: async (campaignId, userIds, sentAt) => {
    await prisma.campaignDelivery.updateMany({
      where: { campaignId, status: "PENDING", userId: { in: userIds } },
      data: { error: null, sentAt, status: "SENT" },
    });
  },
  markDeliverySent: async (campaignId, userId, sentAt) => {
    await prisma.campaignDelivery.update({
      where: { campaignId_userId: { campaignId, userId } },
      data: { error: null, sentAt, status: "SENT" },
    });
  },
  requeueFailedDeliveries: async (campaignId) => {
    await prisma.campaignDelivery.updateMany({
      where: { campaignId, status: "FAILED" },
      data: { error: null, status: "PENDING" },
    });
  },
  writeAuditLog: writeAdminAuditLog,
};

/**
 * Delivery is driven by the frozen `CampaignDelivery` ledger: the loop only ever
 * consumes `PENDING` rows, so retrying a failed campaign resumes where it broke
 * instead of notifying everybody a second time.
 */
export async function sendNotificationCampaign(
  args: { adminUserId: string; campaignId: string },
  dependencies: CampaignSendDependencies = defaultCampaignSendDependencies,
) {
  const campaign = await dependencies.findCampaign(args.campaignId);

  if (!campaign) {
    throw new ApiError("Notification campaign not found", 404, "NOT_FOUND");
  }

  if (
    !SENDABLE_CAMPAIGN_STATUSES.has(campaign.status) ||
    (campaign.status === "PENDING_APPROVAL" && !campaign.approvedAt)
  ) {
    throw new ApiError("Notification campaign cannot be sent in its current state.", 409);
  }

  const now = new Date();
  const frozen = await dependencies.freezeRecipients(args.campaignId, now);
  const audienceSize = frozen.failed + frozen.pending + frozen.sent + frozen.skipped;

  if (audienceSize > CAMPAIGN_APPROVAL_THRESHOLD && !campaign.approvedAt) {
    // A draft can grow between creation and its actual send. Persisting the
    // gate keeps the frozen delivery ledger recoverable by the approver rather
    // than leaving a DRAFT that no route can approve.
    await dependencies.markCampaignApprovalRequired(args.campaignId);
    await dependencies.writeAuditLog({
      action: "notification_campaign.approval_required",
      adminUserId: args.adminUserId,
      metadata: { audienceSize },
      targetId: campaign.id,
      targetType: "NotificationCampaign",
    });
    throw new ApiError(
      "Notification campaign needs a second approval before it can be sent.",
      409,
      "APPROVAL_REQUIRED",
    );
  }

  // A retry picks the broken rows back up; delivered and frequency-capped rows
  // keep their state, which is what stops the second notification.
  await dependencies.requeueFailedDeliveries(args.campaignId);
  await dependencies.markCampaignSending(args.campaignId, now);

  const processed = new Set<string>();

  const deliverOne = async (userId: string) => {
    try {
      const notification = await dependencies.createNotification({
        actionUrl: campaign.actionUrl,
        body: campaign.body,
        campaignId: campaign.id,
        dedupeKey: buildCampaignDedupeKey(campaign.id, userId),
        imageUrl: campaign.imageUrl,
        metadata: {
          campaignId: campaign.id,
          senderId: args.adminUserId,
          system: true,
        },
        title: campaign.title,
        type: campaign.type,
        userId,
      });

      await dependencies.markDeliverySent(args.campaignId, userId, new Date());
      dependencies.emitNotification(notification);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        await dependencies.markDeliverySent(args.campaignId, userId, new Date());
        return;
      }

      await dependencies.markDeliveryFailed(args.campaignId, userId, describeDeliveryError(error));
    }
  };

  for (;;) {
    const batch = (
      await dependencies.listPendingUserIds(args.campaignId, CAMPAIGN_BATCH_SIZE)
    ).filter((userId) => !processed.has(userId));

    if (batch.length === 0) {
      break;
    }

    for (const userId of batch) {
      processed.add(userId);
    }

    if (dependencies.createNotificationsBatch && dependencies.markDeliveriesSent) {
      const inputs = batch.map((userId) => ({
        actionUrl: campaign.actionUrl,
        body: campaign.body,
        campaignId: campaign.id,
        dedupeKey: buildCampaignDedupeKey(campaign.id, userId),
        imageUrl: campaign.imageUrl,
        metadata: {
          campaignId: campaign.id,
          senderId: args.adminUserId,
          system: true,
        },
        title: campaign.title,
        type: campaign.type,
        userId,
      }));

      try {
        const notifications = await dependencies.createNotificationsBatch(inputs);
        await dependencies.markDeliveriesSent(args.campaignId, batch, new Date());
        for (const notification of notifications) {
          dependencies.emitNotification(notification);
        }
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          // A duplicate identifies neither recipient in a multi-row insert.
          // Fall back to single inserts only for this recovery path.
          for (const userId of batch) {
            await deliverOne(userId);
          }
          continue;
        }

        const message = describeDeliveryError(error);
        if (dependencies.markDeliveriesFailed) {
          await dependencies.markDeliveriesFailed(args.campaignId, batch, message);
        } else {
          for (const userId of batch) {
            await dependencies.markDeliveryFailed(args.campaignId, userId, message);
          }
        }
      }
      continue;
    }

    for (const userId of batch) {
      await deliverOne(userId);
    }
  }

  const counts = await dependencies.countDeliveries(args.campaignId);
  const status: NotificationCampaignStatus =
    counts.failed > 0 || counts.pending > 0 ? "FAILED" : "SENT";

  const updated = await dependencies.completeCampaign(args.campaignId, {
    completedAt: new Date(),
    failedCount: counts.failed,
    sentCount: counts.sent,
    status,
  });

  await dependencies.writeAuditLog({
    action: "notification_campaign.send",
    adminUserId: args.adminUserId,
    metadata: {
      failed: counts.failed,
      pending: counts.pending,
      sent: counts.sent,
      skipped: counts.skipped,
    },
    targetId: campaign.id,
    targetType: "NotificationCampaign",
  });

  return updated;
}
