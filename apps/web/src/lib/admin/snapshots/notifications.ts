import { prisma } from "@wizards/db";
import type { AdminSnapshotClient, AdminSnapshotInput } from "@/lib/admin/snapshots/client";
import {
  compactText,
  getDisplayName,
  segmentLabel,
  serializeDate,
} from "@/lib/admin/snapshots/shared";

/** Recent notification campaigns behind the Bildirimler module. */
export async function loadAdminNotificationsSnapshot(
  _input: AdminSnapshotInput,
  client: AdminSnapshotClient = prisma,
) {
  const recentCampaigns = await client.notificationCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
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
      segment: true,
      sentCount: true,
      startedAt: true,
      status: true,
      title: true,
      type: true,
    },
  });

  return {
    campaigns: recentCampaigns.map((campaign) => ({
      body: compactText(campaign.body, 120),
      completedAt: serializeDate(campaign.completedAt),
      createdAt: campaign.createdAt.toISOString(),
      creator: campaign.creator
        ? {
            displayName: getDisplayName(campaign.creator),
            id: campaign.creator.id,
            username: campaign.creator.username,
          }
        : null,
      failedCount: campaign.failedCount,
      id: campaign.id,
      segment: segmentLabel(campaign.segment),
      sentCount: campaign.sentCount,
      startedAt: serializeDate(campaign.startedAt),
      status: campaign.status,
      title: campaign.title,
      type: campaign.type,
    })),
  };
}

export type AdminNotificationsSnapshot = Awaited<ReturnType<typeof loadAdminNotificationsSnapshot>>;
