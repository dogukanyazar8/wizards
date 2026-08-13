import { prisma } from "@wizards/db";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { enqueueCampaignSendJob } from "@/lib/outbox/service";

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("campaign.send");
    await enforceApiRateLimit(admin.id, "admin:campaign:send");

    const { campaignId } = await context.params;
    await enqueueCampaignSendJob(prisma, {
      adminUserId: admin.id,
      campaignId,
      scheduledAt: new Date(),
    });

    return Response.json({ campaignId, queued: true }, { status: 202 });
  } catch (error) {
    return jsonError(error);
  }
}
