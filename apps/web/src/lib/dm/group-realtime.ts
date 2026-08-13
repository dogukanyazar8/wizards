import type { DMConversationDTO, DMNotifyLevel, DMPinnedMessageDTO } from "@wizards/types";
import { leaveGroupCall } from "@/lib/dm/group-call-state";
import { getLiveKitRoomServiceClient } from "@/lib/livekit/server";
import { logError } from "@/lib/logger";

/**
 * The minimum surface of the Socket.IO server this module touches. Depending on
 * the full `Server` type would make the tests need a real socket server.
 */
export type GroupRealtimeServer = {
  in(room: string): { socketsLeave(room: string): void };
  to(rooms: string | string[]): { emit(event: string, ...args: unknown[]): void };
};

function toUserRooms(conversation: DMConversationDTO): string[] {
  return conversation.participants.map((participant) => `user:${participant.userId}`);
}

export function emitGroupConversationCreated(
  io: GroupRealtimeServer,
  conversation: DMConversationDTO,
): void {
  // One viewer's rendered conversation contains private counters and a
  // history-windowed preview. Recipients invalidate and read their own view, so
  // the shared event carries only the stable identity.
  io.to(toUserRooms(conversation)).emit("dm:conversation:created", {
    conversationId: conversation.id,
  });
}

export function emitGroupMembersChanged(
  io: GroupRealtimeServer,
  input: { addedUserIds?: readonly string[]; conversation: DMConversationDTO },
): void {
  // The conversation room covers everyone who has the chat open; the personal
  // rooms cover people who were just added and have never joined it.
  const rooms = [
    `dm:${input.conversation.id}`,
    ...(input.addedUserIds ?? []).map((userId) => `user:${userId}`),
  ];

  io.to(rooms).emit("dm:conversation:members_changed", {
    conversationId: input.conversation.id,
  });
}

/**
 * Faz 1 §B9. 2f's switches change what the group is, so everybody in it needs
 * the new state — a member sitting on the settings screen would otherwise keep
 * showing permissions that stopped being true.
 */
export function emitGroupSettingsChanged(
  io: GroupRealtimeServer,
  conversation: DMConversationDTO,
): void {
  io.to(toUserRooms(conversation)).emit("dm:group:settings", {
    avatarColor: conversation.avatarColor ?? null,
    conversationId: conversation.id,
    description: conversation.description ?? null,
    // K3. Drives the countdown a client draws on new bubbles, so it has to
    // travel with the rest of the settings rather than wait for a refetch.
    disappearingAfter: conversation.disappearingAfter ?? "OFF",
    historyVisibility: conversation.historyVisibility,
    permissions: conversation.permissions,
  });
}

/** 2e §6/§7. Everyone sees the chip change, not only the two people involved. */
export function emitGroupRoleChanged(
  io: GroupRealtimeServer,
  input: { conversation: DMConversationDTO; role: string; userId: string },
): void {
  io.to(toUserRooms(input.conversation)).emit("dm:group:role", {
    conversationId: input.conversation.id,
    ownerId: input.conversation.ownerId,
    role: input.role,
    userId: input.userId,
  });
}

/** 2d §2. `pinnedMessage: null` is an unpin. */
export function emitGroupPinChanged(
  io: GroupRealtimeServer,
  input: { conversation: DMConversationDTO; pinnedMessage: DMPinnedMessageDTO | null },
): void {
  io.to(toUserRooms(input.conversation)).emit("dm:group:pin", {
    conversationId: input.conversation.id,
    // `dismissed` is per-viewer, and this payload goes to everybody at once. The
    // server has just cleared every dismissal anyway, so it is false for all of
    // them — sending one viewer's value would hide the strip from the rest.
    pinnedMessage: input.pinnedMessage ? { ...input.pinnedMessage, dismissed: false } : null,
  });
}

/** 2f §2. Personal state, so it goes to the one person it is about. */
export function emitConversationNotifyChanged(
  io: GroupRealtimeServer,
  input: { conversationId: string; notifyLevel: DMNotifyLevel; userId: string },
): void {
  io.to(`user:${input.userId}`).emit("dm:conversation:notify", {
    conversationId: input.conversationId,
    notifyLevel: input.notifyLevel,
  });
}

/** V3 / 2a §2. Also personal — a pinned conversation is one user's ordering. */
export function emitConversationPinChanged(
  io: GroupRealtimeServer,
  input: { conversationId: string; pinnedAt: string | null; userId: string },
): void {
  io.to(`user:${input.userId}`).emit("dm:conversation:pin", {
    conversationId: input.conversationId,
    pinnedAt: input.pinnedAt,
  });
}

/**
 * Faz 2 §B2 step 10. Somebody redeemed the invite link. Two audiences, two
 * different needs: the joiner's inbox has to gain a conversation it has never
 * seen, and the members already inside only need their roster refreshed.
 *
 * `emitGroupMembersChanged` alone would not do — its conversation-room arm
 * misses the joiner, who has not run `dm:join` yet, and its per-user arm sends
 * a "members changed" for a conversation that client does not have.
 */
export function emitGroupMemberJoined(
  io: GroupRealtimeServer,
  input: { conversation: DMConversationDTO; userId: string },
): void {
  io.to(`user:${input.userId}`).emit("dm:conversation:created", {
    conversationId: input.conversation.id,
  });

  io.to(`dm:${input.conversation.id}`).emit("dm:conversation:members_changed", {
    conversationId: input.conversation.id,
  });
}

/** 2f. The invite switch changed; everybody's settings sheet has to agree. */
export function emitGroupInviteChanged(
  io: GroupRealtimeServer,
  input: { conversationId: string; enabled: boolean; participantUserIds: readonly string[] },
): void {
  // Deliberately without the code: this goes to every member, and a client that
  // is not looking at the settings sheet has no reason to hold a live invite
  // code in memory. The sheet re-reads the route when it opens.
  io.to(input.participantUserIds.map((userId) => `user:${userId}`)).emit("dm:group:invite", {
    conversationId: input.conversationId,
    enabled: input.enabled,
  });
}

type GroupCallEvictionDependencies = {
  leaveCall(conversationId: string, userId: string): Promise<unknown>;
  removeParticipant(roomName: string, userId: string): Promise<void>;
};

const groupCallEvictionDefaults: GroupCallEvictionDependencies = {
  leaveCall: leaveGroupCall,
  removeParticipant: async (roomName, userId) => {
    await getLiveKitRoomServiceClient().removeParticipant(roomName, userId);
  },
};

export async function evictRemovedGroupMember(
  io: GroupRealtimeServer | null,
  input: { conversationId: string; userId: string },
  dependencies: GroupCallEvictionDependencies = groupCallEvictionDefaults,
): Promise<void> {
  if (io) {
    io.to(`user:${input.userId}`).emit("dm:conversation:removed", {
      conversationId: input.conversationId,
    });

    // `dm:join` gates entry but never removes a socket that is already inside, so
    // an un-evicted socket would keep receiving this group's messages.
    io.in(`user:${input.userId}`).socketsLeave(`dm:${input.conversationId}`);
  }

  // Membership removal is already committed when this runs. Cleanup therefore
  // stays best-effort and observable; throwing would make a retry unable to find
  // the former participant while leaving the original response ambiguous.
  await Promise.all([
    dependencies
      .removeParticipant(`dm:${input.conversationId}`, input.userId)
      .catch((error) => logError("[dm] Removed group member LiveKit cleanup failed", error)),
    dependencies
      .leaveCall(input.conversationId, input.userId)
      .catch((error) => logError("[dm] Removed group member call roster cleanup failed", error)),
  ]);
}
