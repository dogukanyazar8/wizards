import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { listPendingFriendRequests } from "@/lib/friends/service";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    const pending = await listPendingFriendRequests(userId);

    return Response.json(pending);
  } catch (error) {
    return jsonError(error);
  }
}
