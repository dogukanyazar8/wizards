import type { DMConversationDTO } from "@wizards/types";

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
  io.to(toUserRooms(conversation)).emit("dm:conversation:created", { conversation });
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
    conversation: input.conversation,
    conversationId: input.conversation.id,
  });
}

export function evictRemovedGroupMember(
  io: GroupRealtimeServer,
  input: { conversationId: string; userId: string },
): void {
  io.to(`user:${input.userId}`).emit("dm:conversation:removed", {
    conversationId: input.conversationId,
  });

  // `dm:join` gates entry but never removes a socket that is already inside, so
  // an un-evicted socket would keep receiving this group's messages.
  io.in(`user:${input.userId}`).socketsLeave(`dm:${input.conversationId}`);
}
