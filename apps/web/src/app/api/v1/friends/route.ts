import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { listFriends } from "@/lib/friends/queries";

export async function GET() {
  try {
    const userId = await requireApiUserId();
    const friends = await listFriends(userId);

    return Response.json(friends);
  } catch (error) {
    return jsonError(error);
  }
}
