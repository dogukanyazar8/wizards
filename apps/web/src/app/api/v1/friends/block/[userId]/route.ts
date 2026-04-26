import { requireApiUserId } from "@/lib/auth/api";
import { jsonError } from "@/lib/api";
import { blockUser, unblockUser } from "@/lib/friends/service";
import { FriendUserIdParamsSchema } from "@/lib/friends/types";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { userId: blockedUserId } = FriendUserIdParamsSchema.parse(await context.params);
    const blockedUser = await blockUser(userId, blockedUserId);

    return Response.json({ blockedUser });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { userId: blockedUserId } = FriendUserIdParamsSchema.parse(await context.params);
    await unblockUser(userId, blockedUserId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
