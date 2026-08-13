import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getUnreadCount } from "@/lib/notifications/service";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "notification:unread-count");
    const count = await getUnreadCount(userId);

    return Response.json({ count });
  } catch (error) {
    return jsonError(error);
  }
}
