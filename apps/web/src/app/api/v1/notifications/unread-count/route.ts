import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { getUnreadCount } from "@/lib/notifications/service";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    const count = await getUnreadCount(userId);

    return Response.json({ count });
  } catch (error) {
    return jsonError(error);
  }
}
