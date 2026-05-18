import type { NotificationCampaignStatus, NotificationType, Prisma } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { getSocketServer } from "@/lib/socket/runtime";
import type { NotificationSocketPayload } from "@/lib/socket/events";
import { writeAdminAuditLog } from "@/lib/admin/access";

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

async function getCampaignRecipientIds(segment: CampaignSegment) {
  switch (segment.type) {
    case "ALL_USERS": {
      const users = await prisma.user.findMany({
        where: {
          emailVerified: true,
          isBanned: false,
        },
        select: { id: true },
      });
      return users.map((user) => user.id);
    }
    case "ONLINE_USERS": {
      const sessions = await prisma.appSession.findMany({
        distinct: ["userId"],
        where: {
          endedAt: null,
          lastSeenAt: { gte: new Date(Date.now() - 2 * 60_000) },
          user: {
            emailVerified: true,
            isBanned: false,
          },
        },
        select: { userId: true },
      });
      return sessions.map((session) => session.userId);
    }
    case "RECENTLY_ACTIVE": {
      const sessions = await prisma.appSession.findMany({
        distinct: ["userId"],
        where: {
          lastSeenAt: { gte: new Date(Date.now() - segment.days * 24 * 60 * 60_000) },
          user: {
            emailVerified: true,
            isBanned: false,
          },
        },
        select: { userId: true },
      });
      return sessions.map((session) => session.userId);
    }
    case "CLIENT_TYPE": {
      const sessions = await prisma.appSession.findMany({
        distinct: ["userId"],
        where: {
          clientType: segment.clientType,
          user: {
            emailVerified: true,
            isBanned: false,
          },
        },
        select: { userId: true },
      });
      return sessions.map((session) => session.userId);
    }
    case "COUNTRY": {
      const sessions = await prisma.appSession.findMany({
        distinct: ["userId"],
        where: {
          countryCode: segment.countryCode,
          user: {
            emailVerified: true,
            isBanned: false,
          },
        },
        select: { userId: true },
      });
      return sessions.map((session) => session.userId);
    }
    case "USER_IDS": {
      const users = await prisma.user.findMany({
        where: {
          emailVerified: true,
          id: { in: segment.userIds },
          isBanned: false,
        },
        select: { id: true },
      });
      return users.map((user) => user.id);
    }
  }
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

export async function createNotificationCampaign(adminUserId: string, input: CreateCampaignInput) {
  const copy = validateCampaignCopy(input);
  const segment = normalizeCampaignSegment(input.segment);

  const campaign = await prisma.notificationCampaign.create({
    data: {
      actionUrl: input.actionUrl ?? null,
      body: copy.body,
      createdById: adminUserId,
      imageUrl: input.imageUrl ?? null,
      segment: segment as unknown as Prisma.InputJsonValue,
      title: copy.title,
      type: input.type ?? "SYSTEM",
    },
  });

  await writeAdminAuditLog({
    action: "notification_campaign.create",
    adminUserId,
    metadata: { segment },
    targetId: campaign.id,
    targetType: "NotificationCampaign",
  });

  return campaign;
}

export async function previewNotificationCampaignRecipients(segment: CampaignSegment) {
  const recipientIds = await getCampaignRecipientIds(normalizeCampaignSegment(segment));

  return {
    recipientCount: recipientIds.length,
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

export async function sendNotificationCampaign(args: { adminUserId: string; campaignId: string }) {
  const campaign = await prisma.notificationCampaign.findUnique({
    where: { id: args.campaignId },
  });

  if (!campaign) {
    throw new ApiError("Notification campaign not found", 404, "NOT_FOUND");
  }

  if (campaign.status !== "DRAFT" && campaign.status !== "FAILED") {
    throw new ApiError("Notification campaign cannot be sent in its current state.", 409);
  }

  const segment = normalizeCampaignSegment(
    (campaign.segment as CampaignSegment | null) ?? { type: "ALL_USERS" },
  );
  const recipientIds = await getCampaignRecipientIds(segment);

  await prisma.notificationCampaign.update({
    where: { id: campaign.id },
    data: {
      failedCount: 0,
      sentCount: 0,
      startedAt: new Date(),
      status: "SENDING" satisfies NotificationCampaignStatus,
    },
  });

  let sentCount = 0;
  const io = getSocketServer();

  for (let index = 0; index < recipientIds.length; index += CAMPAIGN_BATCH_SIZE) {
    const batch = recipientIds.slice(index, index + CAMPAIGN_BATCH_SIZE);
    const notifications = await prisma.$transaction(
      batch.map((userId) =>
        prisma.notification.create({
          data: {
            actionUrl: campaign.actionUrl,
            body: campaign.body,
            campaignId: campaign.id,
            imageUrl: campaign.imageUrl,
            metadata: {
              campaignId: campaign.id,
              senderId: args.adminUserId,
              system: true,
            },
            title: campaign.title,
            type: campaign.type,
            userId,
          },
        }),
      ),
    );

    sentCount += notifications.length;

    for (const notification of notifications) {
      io?.to(`user:${notification.userId}`).emit(
        "notification:new",
        serializeNotification(notification),
      );
    }
  }

  const status: NotificationCampaignStatus = sentCount === recipientIds.length ? "SENT" : "FAILED";
  const updated = await prisma.notificationCampaign.update({
    where: { id: campaign.id },
    data: {
      completedAt: new Date(),
      failedCount: Math.max(0, recipientIds.length - sentCount),
      sentCount,
      status,
    },
  });

  await writeAdminAuditLog({
    action: "notification_campaign.send",
    adminUserId: args.adminUserId,
    metadata: { recipientCount: recipientIds.length, sentCount },
    targetId: campaign.id,
    targetType: "NotificationCampaign",
  });

  return updated;
}
