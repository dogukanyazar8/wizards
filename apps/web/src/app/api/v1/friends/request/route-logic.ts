import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { sendFriendRequest } from "@/lib/friends/service";
import { FriendRequestBodySchema } from "@/lib/friends/types";

export type FriendRequestRouteDependencies = {
  enforceApiRateLimit: typeof enforceApiRateLimit;
  jsonError: typeof jsonError;
  parseJsonBody: typeof parseJsonBody;
  requireApiUserId: typeof requireApiUserId;
  sendFriendRequest: (senderId: string, username: string) => Promise<unknown>;
};

const defaultFriendRequestRouteDependencies: FriendRequestRouteDependencies = {
  enforceApiRateLimit,
  jsonError,
  parseJsonBody,
  requireApiUserId,
  sendFriendRequest,
};

export async function postFriendRequestRoute(
  request: Request,
  dependencies: FriendRequestRouteDependencies = defaultFriendRequestRouteDependencies,
) {
  try {
    const userId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(userId, "friend:request");
    const input = await dependencies.parseJsonBody(request, FriendRequestBodySchema);
    const friendRequest = await dependencies.sendFriendRequest(userId, input.username);

    return Response.json({ request: friendRequest }, { status: 201 });
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
