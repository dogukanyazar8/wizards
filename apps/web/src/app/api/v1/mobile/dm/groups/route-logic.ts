import { GroupDMConversationResponseSchema } from "@wizards/types";

import {
  groupAddMembersRoute,
  groupCreateRoute,
  groupMemberRoleRoute,
  groupPinDismissRoute,
  groupPinRoute,
  groupRemoveMemberRoute,
  groupSettingsRoute,
  groupUnpinRoute,
  groupUpdateRoute,
  type GroupRouteDependencies,
} from "@/app/api/v1/dm/groups/route-logic";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import {
  emitGroupConversationCreated,
  emitGroupMembersChanged,
  emitGroupPinChanged,
  emitGroupRoleChanged,
  emitGroupSettingsChanged,
  evictRemovedGroupMember,
} from "@/lib/dm/group-realtime";
import {
  addGroupMembers,
  createGroupConversation,
  dismissPinnedStrip,
  removeGroupMember,
  setPinnedMessage,
  updateGroupConversation,
  updateGroupSettings,
  updateMemberRole,
} from "@/lib/dm/group-service";
import { getDirectMessageConversationForUser } from "@/lib/dm/service";
import { getSocketServer } from "@/lib/socket/runtime";

export const mobileGroupDefaults: GroupRouteDependencies = {
  addMembers: addGroupMembers,
  authenticate: (request) => requireMobileApiUserId(request),
  createGroup: createGroupConversation,
  dismissPin: dismissPinnedStrip,
  emitCreated: emitGroupConversationCreated,
  emitMembersChanged: emitGroupMembersChanged,
  emitPinChanged: emitGroupPinChanged,
  emitRoleChanged: emitGroupRoleChanged,
  emitSettingsChanged: emitGroupSettingsChanged,
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
  setPin: setPinnedMessage,
  updateGroup: updateGroupConversation,
  updateMemberRole,
  updateSettings: updateGroupSettings,
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

export async function mobileGroupSettingsRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await parseGroupResponse(
    await groupSettingsRoute(request, conversationId, toMobileDependencies(dependencies, "update")),
  );
}

export async function mobileGroupMemberRoleRoute(
  request: Request,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await parseGroupResponse(
    await groupMemberRoleRoute(
      request,
      conversationId,
      targetUserId,
      toMobileDependencies(dependencies, "update"),
    ),
  );
}

export async function mobileGroupPinRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await parseGroupResponse(
    await groupPinRoute(request, conversationId, toMobileDependencies(dependencies, "update")),
  );
}

export async function mobileGroupUnpinRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await parseGroupResponse(
    await groupUnpinRoute(request, conversationId, toMobileDependencies(dependencies, "update")),
  );
}

/** No conversation body to re-validate — the answer is `{ success: true }`. */
export async function mobileGroupPinDismissRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = mobileGroupDefaults,
): Promise<Response> {
  return await groupPinDismissRoute(
    request,
    conversationId,
    toMobileDependencies(dependencies, "update"),
  );
}
