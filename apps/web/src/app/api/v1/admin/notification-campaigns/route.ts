import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireAdminUser } from "@/lib/admin/access";
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
    await requireAdminUser();
    const campaigns = await listNotificationCampaigns();

    return Response.json({ campaigns });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminUser({ roles: ["OWNER", "ADMIN"] });
    await enforceApiRateLimit(admin.id, "admin:campaign:create");

    const input = await parseJsonBody(request, NotificationCampaignCreateRequestSchema);
    const campaign = await createNotificationCampaign(admin.id, toCreateCampaignInput(input));

    if (!input.sendNow) {
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
