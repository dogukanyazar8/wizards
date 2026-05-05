import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { removeFriend } from "@/lib/friends/service";
import { FriendUserIdParamsSchema } from "@/lib/friends/types";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "friend:remove");
    const { userId: friendUserId } = FriendUserIdParamsSchema.parse(await context.params);
    await removeFriend(userId, friendUserId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
