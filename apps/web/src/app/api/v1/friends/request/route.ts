import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { sendFriendRequest } from "@/lib/friends/service";
import { FriendRequestBodySchema } from "@/lib/friends/types";

export async function POST(request: Request) {
  try {
    const userId = await requireApiUserId();
    const input = await parseJsonBody(request, FriendRequestBodySchema);
    const friendRequest = await sendFriendRequest(userId, input.username);

    return Response.json({ request: friendRequest }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
