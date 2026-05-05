import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { actOnFriendRequest, cancelFriendRequest } from "@/lib/friends/service";
import { FriendRequestActionSchema, FriendRequestIdParamsSchema } from "@/lib/friends/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "friend:request-action");
    const { id } = FriendRequestIdParamsSchema.parse(await context.params);
    const input = await parseJsonBody(request, FriendRequestActionSchema);
    const friendRequest = await actOnFriendRequest(userId, id, input.action);

    return Response.json({ request: friendRequest });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "friend:request-action");
    const { id } = FriendRequestIdParamsSchema.parse(await context.params);
    await cancelFriendRequest(userId, id);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
