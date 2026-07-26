import {
  MobileFriendBlockResponseSchema,
  MobileFriendMutationResponseSchema,
  MobileFriendRequestActionResponseSchema,
  MobileFriendRequestCreateSchema,
  MobileFriendRequestParamsSchema,
  MobileFriendUserParamsSchema,
  MobileFriendsOverviewResponseSchema,
  MobileUserSearchQuerySchema,
  MobileUserSearchResponseSchema,
} from "@wizards/types";

import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  actOnFriendRequest,
  blockUser,
  cancelFriendRequest,
  listBlockedUsers,
  listFriends,
  listPendingFriendRequests,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockUser,
} from "@/lib/friends/service";

export type MobileFriendRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileFriendsRouteDependencies = {
  actOnFriendRequest: typeof actOnFriendRequest;
  authenticate: (request: Request) => Promise<string>;
  blockUser: typeof blockUser;
  cancelFriendRequest: typeof cancelFriendRequest;
  enforceRateLimit: (userId: string, action: ApiRateLimitAction) => Promise<void>;
  listBlockedUsers: typeof listBlockedUsers;
  listFriends: typeof listFriends;
  listPendingFriendRequests: typeof listPendingFriendRequests;
  parseBody: typeof parseJsonBody;
  removeFriend: typeof removeFriend;
  searchUsers: typeof searchUsers;
  sendFriendRequest: typeof sendFriendRequest;
  unblockUser: typeof unblockUser;
};

const defaultDependencies: MobileFriendsRouteDependencies = {
  actOnFriendRequest,
  authenticate: (request) => requireMobileApiUserId(request),
  blockUser,
  cancelFriendRequest,
  enforceRateLimit: enforceApiRateLimit,
  listBlockedUsers,
  listFriends,
  listPendingFriendRequests,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockUser,
};

export async function mobileFriendsListRoute(
  request: Request,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:friends:list");
    const [friends, pending, blocked] = await Promise.all([
      dependencies.listFriends(userId),
      dependencies.listPendingFriendRequests(userId),
      dependencies.listBlockedUsers(userId),
    ]);

    return Response.json(MobileFriendsOverviewResponseSchema.parse({ blocked, friends, pending }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileFriendUserSearchRoute(
  request: Request,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:friends:search");
    const searchParams = new URL(request.url).searchParams;
    const input = MobileUserSearchQuerySchema.parse({
      limit: searchParams.get("limit") ?? undefined,
      q: searchParams.get("q") ?? "",
      // Invite sheet 2b scopes the same search to one server; global search omits it.
      serverId: searchParams.get("serverId") ?? undefined,
    });
    const results = await dependencies.searchUsers(userId, input.q, input.limit, input.serverId);
    return Response.json(MobileUserSearchResponseSchema.parse({ results }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileFriendRequestCreateRoute(
  request: Request,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:friends:request");
    const input = await dependencies.parseBody(request, MobileFriendRequestCreateSchema);
    const friendRequest = await dependencies.sendFriendRequest(userId, input.username);
    return Response.json(
      MobileFriendRequestActionResponseSchema.parse({ request: friendRequest }),
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

async function friendRequestActionRoute(
  request: Request,
  context: MobileFriendRouteContext,
  action: "accept" | "decline",
  dependencies: MobileFriendsRouteDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:friends:request-action");
    const { id } = MobileFriendRequestParamsSchema.parse(await context.params);
    const friendRequest = await dependencies.actOnFriendRequest(userId, id, action);
    return Response.json(MobileFriendRequestActionResponseSchema.parse({ request: friendRequest }));
  } catch (error) {
    return jsonError(error);
  }
}

export function mobileFriendRequestAcceptRoute(
  request: Request,
  context: MobileFriendRouteContext,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  return friendRequestActionRoute(request, context, "accept", dependencies);
}

export function mobileFriendRequestRejectRoute(
  request: Request,
  context: MobileFriendRouteContext,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  return friendRequestActionRoute(request, context, "decline", dependencies);
}

export async function mobileFriendRequestCancelRoute(
  request: Request,
  context: MobileFriendRouteContext,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:friends:request-action");
    const { id } = MobileFriendRequestParamsSchema.parse(await context.params);
    await dependencies.cancelFriendRequest(userId, id);
    return Response.json(MobileFriendMutationResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}

async function getTargetUserId(context: MobileFriendRouteContext) {
  return (await MobileFriendUserParamsSchema.parseAsync(await context.params)).userId;
}

export async function mobileFriendRemoveRoute(
  request: Request,
  context: MobileFriendRouteContext,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:friends:remove");
    await dependencies.removeFriend(userId, await getTargetUserId(context));
    return Response.json(MobileFriendMutationResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileFriendBlockRoute(
  request: Request,
  context: MobileFriendRouteContext,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:friends:block");
    const blocked = await dependencies.blockUser(userId, await getTargetUserId(context));
    return Response.json(MobileFriendBlockResponseSchema.parse({ blocked }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileFriendUnblockRoute(
  request: Request,
  context: MobileFriendRouteContext,
  dependencies: MobileFriendsRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:friends:block");
    await dependencies.unblockUser(userId, await getTargetUserId(context));
    return Response.json(MobileFriendMutationResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}
