import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { sendNotificationCampaign } from "@/lib/admin/notification-campaigns";

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
    const campaign = await sendNotificationCampaign({
      adminUserId: admin.id,
      campaignId,
    });

    return Response.json({ campaign });
  } catch (error) {
    return jsonError(error);
  }
}
