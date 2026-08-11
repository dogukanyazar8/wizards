import { z } from "zod";
import {
  GroupDMAddMembersRequestSchema,
  GroupDMCreateRequestSchema,
  GroupDMSettingsUpdateRequestSchema,
  GroupDMUpdateRequestSchema,
  GroupMemberRoleUpdateRequestSchema,
  GroupPinDismissRequestSchema,
  GroupPinMessageRequestSchema,
  type DMConversationDTO,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit, type ApiRateLimitAction } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import {
  emitGroupConversationCreated,
  emitGroupMembersChanged,
  emitGroupPinChanged,
  emitGroupRoleChanged,
  emitGroupSettingsChanged,
  evictRemovedGroupMember,
  type GroupRealtimeServer,
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

/**
 * V8. Carried on the existing DELETE rather than a second endpoint: leaving and
 * handing the group over are one user action, and two requests would let the
 * handover land without the departure.
 */
export const GroupLeaveRequestSchema = z
  .object({ transferOwnershipTo: z.string().trim().min(1).max(128).optional() })
  .strict();

export type GroupRouteDependencies = {
  addMembers: typeof addGroupMembers;
  authenticate(request: Request): Promise<string>;
  createGroup: typeof createGroupConversation;
  dismissPin: typeof dismissPinnedStrip;
  emitCreated: typeof emitGroupConversationCreated;
  emitMembersChanged: typeof emitGroupMembersChanged;
  emitPinChanged: typeof emitGroupPinChanged;
  emitRoleChanged: typeof emitGroupRoleChanged;
  emitSettingsChanged: typeof emitGroupSettingsChanged;
  enforceRateLimit(userId: string, action: ApiRateLimitAction): Promise<void>;
  evictRemoved: typeof evictRemovedGroupMember;
  getIo(): GroupRealtimeServer | null;
  /** Null once the group is gone — the last member left and it was deleted. */
  loadConversationForBroadcast(
    conversationId: string,
    userId: string,
  ): Promise<DMConversationDTO | null>;
  removeMember: typeof removeGroupMember;
  setPin: typeof setPinnedMessage;
  updateGroup: typeof updateGroupConversation;
  updateMemberRole: typeof updateMemberRole;
  updateSettings: typeof updateGroupSettings;
};

const defaults: GroupRouteDependencies = {
  addMembers: addGroupMembers,
  authenticate: () => requireApiUserId(),
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
      ...(input.avatarColor === undefined ? {} : { avatarColor: input.avatarColor }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.historyVisibility === undefined
        ? {}
        : { historyVisibility: input.historyVisibility }),
      ...(input.iconUrl === undefined ? {} : { iconUrl: input.iconUrl }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.permAddMembers === undefined ? {} : { permAddMembers: input.permAddMembers }),
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
    // A bodyless DELETE parses as `{}`, so removing somebody else stays a plain
    // request and only a departing last admin has to say anything.
    const { transferOwnershipTo } = await parseJsonBody(request, GroupLeaveRequestSchema);
    const { broadcastViewerId } = await dependencies.removeMember(
      userId,
      conversationId,
      targetUserId,
      // The service's own default dependency set; only the options after it are
      // the route's business.
      undefined,
      transferOwnershipTo === undefined ? {} : { transferOwnershipTo },
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

/**
 * 2f §3 / 2c §5. Permissions, history window, description and colour. The
 * response is the whole conversation because every one of those fields is drawn
 * somewhere the client already holds a conversation for.
 */
export async function groupSettingsRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");
    const patch = await parseJsonBody(request, GroupDMSettingsUpdateRequestSchema);
    const conversation = await dependencies.updateSettings(userId, conversationId, patch);
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitSettingsChanged(io, conversation);
    }

    return Response.json({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}

/** 2e §7. Promote, demote, or hand the group over. */
export async function groupMemberRoleRoute(
  request: Request,
  conversationId: string,
  targetUserId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");
    const input = await parseJsonBody(request, GroupMemberRoleUpdateRequestSchema);
    const conversation = await dependencies.updateMemberRole(
      userId,
      conversationId,
      targetUserId,
      input,
    );
    const io = dependencies.getIo();

    if (io) {
      dependencies.emitRoleChanged(io, {
        conversation,
        role: input.transferOwnership === true ? "OWNER" : input.role,
        userId: targetUserId,
      });
    }

    return Response.json({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}

/** 2d §2. PUT pins, DELETE unpins; both answer with the updated conversation. */
export async function groupPinRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");
    const { messageId } = await parseJsonBody(request, GroupPinMessageRequestSchema);

    return await respondWithPin(
      await dependencies.setPin(userId, conversationId, messageId),
      dependencies,
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function groupUnpinRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");

    return await respondWithPin(
      await dependencies.setPin(userId, conversationId, null),
      dependencies,
    );
  } catch (error) {
    return jsonError(error);
  }
}

async function respondWithPin(
  conversation: DMConversationDTO,
  dependencies: GroupRouteDependencies,
): Promise<Response> {
  const io = dependencies.getIo();

  if (io) {
    dependencies.emitPinChanged(io, {
      conversation,
      pinnedMessage: conversation.pinnedMessage ?? null,
    });
  }

  return Response.json({ conversation });
}

/**
 * 2d §2, "kapatma yalnız o kullanıcı için gizler". Nothing is broadcast: the
 * dismissal is one person's view state, and the client that sent it already
 * closed the strip.
 */
export async function groupPinDismissRoute(
  request: Request,
  conversationId: string,
  dependencies: GroupRouteDependencies = defaults,
): Promise<Response> {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "dm:group:update");
    const { messageId } = await parseJsonBody(request, GroupPinDismissRequestSchema);
    await dependencies.dismissPin(userId, conversationId, messageId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
