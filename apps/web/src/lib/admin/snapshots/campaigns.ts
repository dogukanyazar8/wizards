import type { PrismaClient } from "@wizards/db";
import { prisma } from "@wizards/db";

const CAMPAIGN_LIST_LIMIT = 25;

export type AdminCampaignClient = Pick<
  PrismaClient,
  "campaignDelivery" | "notification" | "notificationCampaign" | "outboxJob"
>;

export type CampaignDeliveryReport = {
  failedCount: number;
  frequencyCappedCount: number;
  openRatePercent: number | null;
  openedCount: number;
  sentCount: number;
  skippedCount: number;
  targetedCount: number;
};

/**
 * The open rate divides by what was actually sent — dividing by the audience
 * would blame the campaign for people it deliberately skipped.
 */
export function buildDeliveryReport(input: {
  countsByStatus: Array<{ count: number; status: string }>;
  frequencyCappedCount: number;
  openedCount: number;
}): CampaignDeliveryReport {
  const read = (status: string) =>
    input.countsByStatus.find((entry) => entry.status === status)?.count ?? 0;
  const sentCount = read("SENT");

  return {
    failedCount: read("FAILED"),
    frequencyCappedCount: input.frequencyCappedCount,
    openRatePercent:
      sentCount === 0 ? null : Math.round((input.openedCount / sentCount) * 1000) / 10,
    openedCount: input.openedCount,
    sentCount,
    skippedCount: read("SKIPPED"),
    targetedCount: input.countsByStatus.reduce((total, entry) => total + entry.count, 0),
  };
}

export async function listAdminCampaigns(
  now: Date = new Date(),
  client: AdminCampaignClient = prisma,
) {
  const [campaigns, scheduledJobs] = await Promise.all([
    client.notificationCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: CAMPAIGN_LIST_LIMIT,
      select: {
        completedAt: true,
        createdAt: true,
        creator: { select: { displayName: true, id: true, username: true } },
        failedCount: true,
        id: true,
        sentCount: true,
        startedAt: true,
        status: true,
        title: true,
        type: true,
      },
    }),
    client.outboxJob.findMany({
      where: { status: "PENDING", type: "CAMPAIGN_SEND" },
      select: { availableAt: true, payload: true },
    }),
  ]);

  const scheduleByCampaign = new Map<string, { availableAt: Date; late: boolean }>();

  for (const job of scheduledJobs) {
    const payload = job.payload as { campaignId?: unknown } | null;

    if (payload && typeof payload.campaignId === "string") {
      scheduleByCampaign.set(payload.campaignId, {
        availableAt: job.availableAt,
        late: job.availableAt < now,
      });
    }
  }

  return campaigns.map((campaign) => {
    const schedule = scheduleByCampaign.get(campaign.id);

    return {
      completedAt: campaign.completedAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      creator: campaign.creator
        ? {
            displayName: campaign.creator.displayName ?? campaign.creator.username,
            id: campaign.creator.id,
            username: campaign.creator.username,
          }
        : null,
      failedCount: campaign.failedCount,
      id: campaign.id,
      /** A booked job whose moment has passed but that the drain has not run yet. */
      isLate: schedule?.late ?? false,
      scheduledAt: schedule?.availableAt.toISOString() ?? null,
      sentCount: campaign.sentCount,
      startedAt: campaign.startedAt?.toISOString() ?? null,
      status: campaign.status,
      title: campaign.title,
      type: campaign.type,
    };
  });
}

export async function getAdminCampaignDetail(
  campaignId: string,
  client: AdminCampaignClient = prisma,
) {
  const campaign = await client.notificationCampaign.findUnique({
    where: { id: campaignId },
    select: {
      approvedAt: true,
      body: true,
      completedAt: true,
      createdAt: true,
      creator: { select: { displayName: true, id: true, username: true } },
      frozenAt: true,
      id: true,
      segment: true,
      startedAt: true,
      status: true,
      title: true,
      type: true,
    },
  });

  if (!campaign) {
    return null;
  }

  const [statusGroups, frequencyCapped, openedCount] = await Promise.all([
    client.campaignDelivery.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { campaignId },
    }),
    client.campaignDelivery.count({
      where: { campaignId, skipReason: "FREQUENCY_CAP", status: "SKIPPED" },
    }),
    client.notification.count({ where: { campaignId, read: true } }),
  ]);

  return {
    approvedAt: campaign.approvedAt?.toISOString() ?? null,
    body: campaign.body,
    completedAt: campaign.completedAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    creator: campaign.creator
      ? {
          displayName: campaign.creator.displayName ?? campaign.creator.username,
          id: campaign.creator.id,
          username: campaign.creator.username,
        }
      : null,
    frozenAt: campaign.frozenAt?.toISOString() ?? null,
    id: campaign.id,
    report: buildDeliveryReport({
      countsByStatus: statusGroups.map((group) => ({
        count: group._count._all,
        status: group.status,
      })),
      frequencyCappedCount: frequencyCapped,
      openedCount,
    }),
    startedAt: campaign.startedAt?.toISOString() ?? null,
    status: campaign.status,
    title: campaign.title,
    type: campaign.type,
  };
}

export type AdminCampaignListItem = Awaited<ReturnType<typeof listAdminCampaigns>>[number];
export type AdminCampaignDetail = NonNullable<Awaited<ReturnType<typeof getAdminCampaignDetail>>>;
