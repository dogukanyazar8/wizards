import type { CampaignDeliveryStatus, CampaignSkipReason, NotificationType } from "@wizards/db";
import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import {
  getCampaignRecipientIds,
  normalizeCampaignSegment,
  type CampaignSegment,
} from "@/lib/admin/notification-campaigns";

/** A person may receive at most two campaign notifications per rolling day. */
export const CAMPAIGN_FREQUENCY_LIMIT = 2;
export const CAMPAIGN_FREQUENCY_WINDOW_MS = 24 * 60 * 60_000;

export type CampaignDeliveryCounts = {
  failed: number;
  pending: number;
  sent: number;
  skipped: number;
};

export type CampaignDeliveryDraft = {
  campaignId: string;
  skipReason?: CampaignSkipReason;
  status: CampaignDeliveryStatus;
  userId: string;
};

export type CampaignDeliveryDependencies = {
  countDeliveries(campaignId: string): Promise<CampaignDeliveryCounts>;
  countRecentDeliveries(
    userIds: string[],
    since: Date,
  ): Promise<Array<{ count: number; userId: string }>>;
  findCampaign(campaignId: string): Promise<{
    frozenAt: Date | null;
    segment: unknown;
    type: NotificationType;
  } | null>;
  freeze(campaignId: string, rows: CampaignDeliveryDraft[], frozenAt: Date): Promise<void>;
  resolveRecipientIds(segment: CampaignSegment): Promise<string[]>;
};

export function selectFrequencyCappedUserIds(
  recentSendCounts: Array<{ count: number; userId: string }>,
) {
  return new Set(
    recentSendCounts
      .filter((entry) => entry.count >= CAMPAIGN_FREQUENCY_LIMIT)
      .map((entry) => entry.userId),
  );
}

const defaultCampaignDeliveryDependencies: CampaignDeliveryDependencies = {
  countDeliveries: async (campaignId) => {
    const grouped = await prisma.campaignDelivery.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: { _all: true },
    });

    const read = (status: CampaignDeliveryStatus) =>
      grouped.find((row) => row.status === status)?._count._all ?? 0;

    return {
      failed: read("FAILED"),
      pending: read("PENDING"),
      sent: read("SENT"),
      skipped: read("SKIPPED"),
    };
  },
  countRecentDeliveries: async (userIds, since) => {
    const grouped = await prisma.campaignDelivery.groupBy({
      by: ["userId"],
      where: {
        sentAt: { gte: since },
        status: "SENT",
        userId: { in: userIds },
      },
      _count: { _all: true },
    });

    return grouped.map((row) => ({ count: row._count._all, userId: row.userId }));
  },
  findCampaign: (campaignId) =>
    prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      select: { frozenAt: true, segment: true, type: true },
    }),
  freeze: async (campaignId, rows, frozenAt) => {
    await prisma.$transaction([
      prisma.campaignDelivery.createMany({ data: rows, skipDuplicates: true }),
      prisma.notificationCampaign.update({ where: { id: campaignId }, data: { frozenAt } }),
    ]);
  },
  resolveRecipientIds: (segment) => getCampaignRecipientIds(normalizeCampaignSegment(segment)),
};

/**
 * Resolves the audience exactly once and stores it as `CampaignDelivery` rows.
 * Everything after this point reads the frozen list, so a retry can never reach
 * somebody who was not in the preview and can never send twice.
 */
export async function freezeCampaignRecipients(
  campaignId: string,
  options: { dependencies?: CampaignDeliveryDependencies; now?: Date } = {},
): Promise<CampaignDeliveryCounts> {
  const dependencies = options.dependencies ?? defaultCampaignDeliveryDependencies;
  const now = options.now ?? new Date();
  const campaign = await dependencies.findCampaign(campaignId);

  if (!campaign) {
    throw new ApiError("Notification campaign not found", 404, "NOT_FOUND");
  }

  if (campaign.frozenAt) {
    return dependencies.countDeliveries(campaignId);
  }

  const recipientIds = await dependencies.resolveRecipientIds(
    normalizeCampaignSegment((campaign.segment as CampaignSegment | null) ?? { type: "ALL_USERS" }),
  );

  // A moderation notice is a safety message: it is never silenced by the cap.
  const capped =
    campaign.type === "MODERATION"
      ? new Set<string>()
      : selectFrequencyCappedUserIds(
          await dependencies.countRecentDeliveries(
            recipientIds,
            new Date(now.getTime() - CAMPAIGN_FREQUENCY_WINDOW_MS),
          ),
        );

  await dependencies.freeze(
    campaignId,
    recipientIds.map((userId) =>
      capped.has(userId)
        ? { campaignId, skipReason: "FREQUENCY_CAP" as const, status: "SKIPPED" as const, userId }
        : { campaignId, status: "PENDING" as const, userId },
    ),
    now,
  );

  return dependencies.countDeliveries(campaignId);
}
