import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { markAllRead } from "@/lib/notifications/service";

export async function PATCH() {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "notification:mark-read");
    await markAllRead(userId);

    return Response.json({});
  } catch (error) {
    return jsonError(error);
  }
}
