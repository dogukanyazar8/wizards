import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { markAllRead } from "@/lib/notifications/service";

export async function PATCH() {
  try {
    const userId = await requireApiUserId();
    await markAllRead(userId);

    return Response.json({});
  } catch (error) {
    return jsonError(error);
  }
}
