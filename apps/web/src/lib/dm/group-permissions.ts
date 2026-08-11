import {
  canMemberDo,
  type DMNotifyLevel,
  type DMParticipantRole,
  type GroupAction,
  type GroupHistoryVisibility,
  type GroupPermissionLevel,
  type GroupPermissions,
} from "@wizards/types";
import { prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

/**
 * Faz 1 §B4 / §C.1. The one gate every group write goes through. Faz 2 and Faz 5
 * call this module; neither writes its own check, because a second check is a
 * second place for the rules to drift — and the socket path proved once already
 * that a guard living in a route is a guard the socket skips (§4.12).
 */

export type { GroupAction };

export type GroupAuthParticipantRow = {
  readonly historyFromAt: Date | null;
  readonly joinedAt: Date;
  readonly notifyLevel: DMNotifyLevel;
  readonly pinnedStripDismissedId: string | null;
  readonly role: DMParticipantRole;
  readonly userId: string;
};

/**
 * The projection `loadConversation` returns: the conversation's own settings
 * plus *only* the caller's membership row. The participant list is filtered
 * inside the query, so a 32-person group costs the same as a 1:1.
 */
export type GroupAuthConversationRow = {
  readonly historyVisibility: GroupHistoryVisibility;
  readonly id: string;
  readonly ownerId: string | null;
  readonly participants: readonly GroupAuthParticipantRow[];
  readonly permAddMembers: GroupPermissionLevel;
  readonly permEditInfo: GroupPermissionLevel;
  readonly permPinMessage: GroupPermissionLevel;
  readonly permSendMessage: GroupPermissionLevel;
  readonly pinnedMessageId: string | null;
  readonly type: string;
};

export type GroupAuthContext = {
  readonly conversationId: string;
  readonly historyFromAt: Date | null;
  readonly historyVisibility: GroupHistoryVisibility;
  readonly isGroup: boolean;
  readonly joinedAt: Date;
  readonly notifyLevel: DMNotifyLevel;
  readonly ownerId: string | null;
  readonly permissions: GroupPermissions;
  readonly pinnedMessageId: string | null;
  readonly pinnedStripDismissedId: string | null;
  readonly role: DMParticipantRole;
  readonly userId: string;
};

export type GroupAuthDependencies = {
  loadConversation(
    conversationId: string,
    userId: string,
  ): Promise<GroupAuthConversationRow | null>;
};

export const groupAuthSelect = {
  historyVisibility: true,
  id: true,
  ownerId: true,
  permAddMembers: true,
  permEditInfo: true,
  permPinMessage: true,
  permSendMessage: true,
  pinnedMessageId: true,
  type: true,
} as const;

const defaultDependencies: GroupAuthDependencies = {
  loadConversation: (conversationId, userId) =>
    prisma.dMConversation.findUnique({
      where: { id: conversationId },
      select: {
        ...groupAuthSelect,
        // One query, not two: the caller's membership is a filtered relation on
        // the same read rather than a second `findUnique` on DMParticipant.
        participants: {
          where: { userId },
          select: {
            historyFromAt: true,
            joinedAt: true,
            notifyLevel: true,
            pinnedStripDismissedId: true,
            role: true,
            userId: true,
          },
        },
      },
    }),
};

/**
 * Row to context. Split out from the query so the rules can be tested without a
 * database — the web test runner has none.
 */
export function toGroupAuthContext(
  conversation: GroupAuthConversationRow,
  userId: string,
): GroupAuthContext {
  const participant = conversation.participants.find((entry) => entry.userId === userId);

  // Fail closed. An empty relation is exactly what a non-member's query returns,
  // and defaulting the role to MEMBER here would hand a stranger member rights.
  if (!participant) {
    throw new ApiError("You are not a participant in this conversation", 403, "FORBIDDEN");
  }

  return {
    conversationId: conversation.id,
    historyFromAt: participant.historyFromAt,
    historyVisibility: conversation.historyVisibility,
    isGroup: conversation.type === "GROUP_DM",
    joinedAt: participant.joinedAt,
    notifyLevel: participant.notifyLevel,
    ownerId: conversation.ownerId,
    permissions: {
      addMembers: conversation.permAddMembers,
      editInfo: conversation.permEditInfo,
      pinMessage: conversation.permPinMessage,
      sendMessage: conversation.permSendMessage,
    },
    pinnedMessageId: conversation.pinnedMessageId,
    pinnedStripDismissedId: participant.pinnedStripDismissedId,
    role: participant.role,
    userId,
  };
}

export async function loadGroupAuthContext(
  conversationId: string,
  userId: string,
  dependencies: GroupAuthDependencies = defaultDependencies,
): Promise<GroupAuthContext> {
  const conversation = await dependencies.loadConversation(conversationId, userId);

  if (!conversation) {
    throw new ApiError("Conversation not found", 404, "NOT_FOUND");
  }

  return toGroupAuthContext(conversation, userId);
}

export function assertGroupConversation(context: GroupAuthContext): void {
  if (!context.isGroup) {
    throw new ApiError("This conversation is not a group", 400, "NOT_A_GROUP");
  }
}

/**
 * 2f §3. A 1:1 DM always passes: permissions describe who in a *group* may act,
 * and a two-person conversation has no such question to answer.
 */
export function assertGroupPermission(context: GroupAuthContext, action: GroupAction): void {
  if (!context.isGroup) {
    return;
  }

  if (!canMemberDo(context.role, context.permissions[action])) {
    throw new ApiError("You do not have permission to do this", 403, "FORBIDDEN");
  }
}

export function assertGroupAdmin(context: GroupAuthContext): void {
  assertGroupConversation(context);

  if (context.role !== "OWNER" && context.role !== "ADMIN") {
    throw new ApiError("Only group admins can do this", 403, "NOT_GROUP_ADMIN");
  }
}

export function assertGroupOwner(context: GroupAuthContext): void {
  assertGroupConversation(context);

  if (context.role !== "OWNER") {
    throw new ApiError("Only the group owner can do this", 403, "NOT_GROUP_OWNER");
  }
}

/**
 * V8's input: how many people can still administer the group. `exceptUserId`
 * answers the question leaving actually asks — "who is left once I am gone".
 */
export function countGroupAdmins(
  participants: ReadonlyArray<{ readonly role: DMParticipantRole; readonly userId: string }>,
  exceptUserId?: string,
): number {
  return participants.filter(
    (participant) =>
      participant.userId !== exceptUserId &&
      (participant.role === "OWNER" || participant.role === "ADMIN"),
  ).length;
}
