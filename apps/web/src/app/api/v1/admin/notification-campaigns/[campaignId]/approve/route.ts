import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { approveNotificationCampaign } from "@/lib/admin/notification-campaigns";

type RouteContext = {
  params: Promise<{
    campaignId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("campaign.approve");
    await enforceApiRateLimit(admin.id, "admin:campaign:approve");

    const { campaignId } = await context.params;
    const campaign = await approveNotificationCampaign(admin.id, campaignId);

    return Response.json({ campaign });
  } catch (error) {
    return jsonError(error);
  }
}
