import { prisma } from "@wizards/db";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { enqueueCampaignSendJob } from "@/lib/outbox/service";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  createNotificationCampaign,
  listNotificationCampaigns,
  sendNotificationCampaign,
} from "@/lib/admin/notification-campaigns";
import {
  NotificationCampaignCreateRequestSchema,
  toCreateCampaignInput,
} from "@/lib/admin/notification-campaign-input";

export async function GET() {
  try {
    await requireAdminCapability("campaign.read");
    const campaigns = await listNotificationCampaigns();

    return Response.json({ campaigns });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminCapability("campaign.create");
    await enforceApiRateLimit(admin.id, "admin:campaign:create");

    const input = await parseJsonBody(request, NotificationCampaignCreateRequestSchema);
    const campaign = await createNotificationCampaign(admin.id, toCreateCampaignInput(input));

    // A booked campaign never sends inline: the outbox drain picks it up when
    // `availableAt` arrives, and freezes the audience at that moment.
    if (input.scheduledAt && campaign.status !== "PENDING_APPROVAL") {
      await enqueueCampaignSendJob(prisma, {
        adminUserId: admin.id,
        campaignId: campaign.id,
        scheduledAt: input.scheduledAt,
      });

      return Response.json(
        { campaign, scheduledAt: input.scheduledAt.toISOString() },
        { status: 201 },
      );
    }

    // An oversized audience parks in PENDING_APPROVAL: the composer surfaces
    // the gate instead of the send failing behind a 409.
    if (!input.sendNow || campaign.status === "PENDING_APPROVAL") {
      return Response.json({ campaign }, { status: 201 });
    }

    await enforceApiRateLimit(admin.id, "admin:campaign:send");
    const sentCampaign = await sendNotificationCampaign({
      adminUserId: admin.id,
      campaignId: campaign.id,
    });

    return Response.json({ campaign: sentCampaign }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
