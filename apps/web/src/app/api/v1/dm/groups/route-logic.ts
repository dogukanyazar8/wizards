import {
  GroupDMAddMembersRequestSchema,
  GroupDMCreateRequestSchema,
  GroupDMUpdateRequestSchema,
  type DMConversationDTO,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  emitGroupConversationCreated,
  emitGroupMembersChanged,
  evictRemovedGroupMember,
  type GroupRealtimeServer,
} from "@/lib/dm/group-realtime";
import {
  addGroupMembers,
  createGroupConversation,
  removeGroupMember,
  updateGroupConversation,
} from "@/lib/dm/group-service";
import { getDirectMessageConversationForUser } from "@/lib/dm/service";
import { getSocketServer } from "@/lib/socket/runtime";

export type GroupRouteDependencies = {
  addMembers: typeof addGroupMembers;
  authenticate(request: Request): Promise<string>;
  createGroup: typeof createGroupConversation;
  emitCreated: typeof emitGroupConversationCreated;
  emitMembersChanged: typeof emitGroupMembersChanged;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  evictRemoved: typeof evictRemovedGroupMember;
  getIo(): GroupRealtimeServer | null;
  /** Null once the group is gone — the last member left and it was deleted. */
  loadConversationForBroadcast(
    conversationId: string,
    userId: string,
  ): Promise<DMConversationDTO | null>;
  removeMember: typeof removeGroupMember;
  updateGroup: typeof updateGroupConversation;
};

const defaults: GroupRouteDependencies = {
  addMembers: addGroupMembers,
  authenticate: () => requireApiUserId(),
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

export async function groupCreateRoute(
  request: Request,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:create");
    const input = await parseJsonBody(request, GroupDMCreateRequestSchema);
    // Absent stays absent: the service reads `undefined` as "not supplied", and
    // spreading the key with an undefined value would not survive the strict
    // optional property types.
    const conversation = await dependencies.createGroup(userId, {
      ...(input.iconUrl === undefined ? {} : { iconUrl: input.iconUrl }),
      ...(input.name === undefined ? {} : { name: input.name }),
      userIds: input.userIds,
    });
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitCreated(io, conversation);
    }

    return Response.json({ conversation }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function groupUpdateRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");
    const patch = await parseJsonBody(request, GroupDMUpdateRequestSchema);
    // `undefined` means "leave it alone" and `null` means "clear it", so the keys
    // are only forwarded when the client actually sent them.
    const conversation = await dependencies.updateGroup(userId, conversationId, {
      ...(patch.iconUrl === undefined ? {} : { iconUrl: patch.iconUrl }),
      ...(patch.name === undefined ? {} : { name: patch.name }),
    });
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitMembersChanged(io, { conversation });
    }

    return Response.json({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}

export async function groupAddMembersRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:members");
    const { userIds } = await parseJsonBody(request, GroupDMAddMembersRequestSchema);
    const conversation = await dependencies.addMembers(userId, conversationId, userIds);
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitMembersChanged(io, { addedUserIds: userIds, conversation });
    }

    return Response.json({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}

export async function groupRemoveMemberRoute(
  request: Request,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:members");
    const { broadcastViewerId } = await dependencies.removeMember(
      userId,
      conversationId,
      targetUserId,
    );
    const io = dependencies.getIo();

    if (io) {
      dependencies.evictRemoved(io, { conversationId, userId: targetUserId });

      // The service names somebody still inside, because the read requires
      // participation: on a leave the actor is the person who just left, and
      // reading as them would come back empty and silently skip the broadcast.
      // Null means the group itself is gone and there is nobody left to tell.
      if (broadcastViewerId) {
        const conversation = await dependencies.loadConversationForBroadcast(
          conversationId,
          broadcastViewerId,
        );

        if (conversation) {
          dependencies.emitMembersChanged(io, { conversation });
        }
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
