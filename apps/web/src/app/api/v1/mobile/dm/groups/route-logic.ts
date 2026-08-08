import { GroupDMConversationResponseSchema } from "@wizards/types";

import {
  groupAddMembersRoute,
  groupCreateRoute,
  groupRemoveMemberRoute,
  groupUpdateRoute,
  type GroupRouteDependencies,
} from "@/app/api/v1/dm/groups/route-logic";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  emitGroupConversationCreated,
  emitGroupMembersChanged,
  evictRemovedGroupMember,
} from "@/lib/dm/group-realtime";
import {
  addGroupMembers,
  createGroupConversation,
  removeGroupMember,
  updateGroupConversation,
} from "@/lib/dm/group-service";
import { getDirectMessageConversationForUser } from "@/lib/dm/service";
import { getSocketServer } from "@/lib/socket/runtime";

export const mobileGroupDefaults: GroupRouteDependencies = {
  addMembers: addGroupMembers,
  authenticate: (request) => requireMobileApiUserId(request),
  createGroup: createGroupConversation,
  emitCreated: emitGroupConversationCreated,
  emitMembersChanged: emitGroupMembersChanged,
  enforceRateLimit: enforceApiRateLimit,
  evictRemoved: evictRemovedGroupMember,
  getIo: () => getSocketServer(),
  loadConversationForBroadcast: async (conversationId, userId) => {
    try {
      return await getDirectMessageConversationForUser(conversationId, userId);
    } catch {
      return null;
    }
  },
  removeMember: removeGroupMember,
  updateGroup: updateGroupConversation,
};

/**
 * The mobile client is a separate release train, so its bodies are re-parsed
 * against the shared schema before they leave: a server-side shape drift must
 * fail here, not on a phone that cannot be hot-fixed.
 */
async function parseGroupResponse(response: Response): Promise<Response> {
  if (response.status !== 200 && response.status !== 201) {
    return response;
  }

  const body = GroupDMConversationResponseSchema.parse(await response.json());
  return Response.json(body, { status: response.status });
}

/**
 * Only the rate-limit bucket is rewritten here. `authenticate` is left as the
 * caller supplied it, because overriding it would silently ignore the bearer
 * identity a shell already resolved and re-authenticate a second time.
 */
function toMobileDependencies(
  dependencies: GroupRouteDependencies,
  action: "create" | "members" | "update",
): GroupRouteDependencies {
  return {
    ...dependencies,
    enforceRateLimit: (userId) =>
      dependencies.enforceRateLimit(userId, `mobile:dm:group:${action}`),
  };
}

export async function mobileGroupCreateRoute(
  request: Request,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await parseGroupResponse(
    await groupCreateRoute(request, toMobileDependencies(dependencies, "create")),
  );
}

export async function mobileGroupUpdateRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await parseGroupResponse(
    await groupUpdateRoute(request, conversationId, toMobileDependencies(dependencies, "update")),
  );
}

export async function mobileGroupAddMembersRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await parseGroupResponse(
    await groupAddMembersRoute(
      request,
      conversationId,
      toMobileDependencies(dependencies, "members"),
    ),
  );
}

export async function mobileGroupRemoveMemberRoute(
  request: Request,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await groupRemoveMemberRoute(
    request,
    conversationId,
    targetUserId,
    toMobileDependencies(dependencies, "members"),
  );
}
