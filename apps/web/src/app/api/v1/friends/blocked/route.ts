import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { listBlockedUsers } from "@/lib/friends/service";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    const blocked = await listBlockedUsers(userId);

    return Response.json(blocked);
  } catch (error) {
    return jsonError(error);
  }
}
