import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireAdminUser } from "@/lib/admin/access";
import { previewNotificationCampaignRecipients } from "@/lib/admin/notification-campaigns";
import { NotificationCampaignPreviewRequestSchema } from "@/lib/admin/notification-campaign-input";

export async function POST(request: Request) {
  try {
    const admin = await requireAdminUser({ roles: ["OWNER", "ADMIN"] });
    await enforceApiRateLimit(admin.id, "admin:campaign:preview");

    const input = await parseJsonBody(request, NotificationCampaignPreviewRequestSchema);
    const preview = await previewNotificationCampaignRecipients(input.segment);

    return Response.json(preview);
  } catch (error) {
    return jsonError(error);
  }
}
