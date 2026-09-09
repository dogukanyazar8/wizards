import type { MobileDMDeliveredUpdatedEvent } from "@wizards/types";

import {
  getDirectMessageParticipantReadStates,
  markDirectMessagesDelivered,
  type DirectMessageDeliveryMark,
} from "@/lib/dm/service";
import { canPublishReadReceipt } from "@/lib/messages/typing-visibility";
import { getSocketServer } from "@/lib/socket/runtime";

/**
 * Messaging redesign §2 "1a".6.4 — the "iletildi" tick.
 *
 * Two things mark a delivery, and both land here: the recipient's socket
 * acknowledging a `dm:message:new`, and the recipient's app pulling the
 * conversation list (which covers the cold start, where the socket is not up
 * yet and a push did the waking).
 *
 * The update is fanned out to every participant's personal room, not the
 * `dm:<id>` room: the sender is usually sitting on the conversation list, which
 * never joins that room, and that is exactly where the tick has to change.
 */
export function emitDirectMessageDeliveryMarks(
  userId: string,
  marks: readonly DirectMessageDeliveryMark[],
): void {
  if (marks.length === 0) {
    return;
  }

  const io = getSocketServer();
  if (!io) {
    return;
  }

  for (const mark of marks) {
    const event: MobileDMDeliveredUpdatedEvent = {
      conversationId: mark.conversationId,
      lastDeliveredAt: mark.lastDeliveredAt.toISOString(),
      userId,
    };
    for (const participantUserId of mark.participantUserIds) {
      io.to(`user:${participantUserId}`).emit("dm:conversation:delivered", event);
    }
  }
}

/** Marks and broadcasts in one call; failures never break the caller's response. */
export async function recordDirectMessageDelivery(
  userId: string,
  conversationIds: readonly string[],
): Promise<readonly DirectMessageDeliveryMark[]> {
  const marks = await markDirectMessagesDelivered(userId, conversationIds);
  emitDirectMessageDeliveryMarks(userId, marks);
  return marks;
}

/**
 * Third tick. Same personal-room reasoning as the delivery fan-out: whoever sent
 * the message is usually on the conversation list, not inside the chat, so the
 * `dm:<id>` room alone never reaches them.
 *
 * The web client marks read through its own route, and the person waiting for
 * the tick is frequently on mobile, so this lives beside the mobile emitter
 * rather than inside either route.
 */
export type BroadcastDirectMessageReadDependencies = {
  canPublishReadReceipt(userId: string): Promise<boolean>;
  getReadStates(
    conversationId: string,
  ): Promise<readonly { readonly lastReadAt: Date | null; readonly userId: string }[]>;
};

const broadcastReadDefaults: BroadcastDirectMessageReadDependencies = {
  canPublishReadReceipt,
  getReadStates: getDirectMessageParticipantReadStates,
};

export async function broadcastDirectMessageRead(
  userId: string,
  conversationId: string,
  dependencies: BroadcastDirectMessageReadDependencies = broadcastReadDefaults,
): Promise<void> {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  // §15.5's `Okundu bilgisi` switch, enforced where the stamp is published
  // rather than where it lands. Suppressing the whole event — not just the leg
  // that reaches the counterpart — is the point: the conversation room holds
  // the other side, so any emit at all would put the stamp on the wire. The
  // reader's own unread count is a column, untouched by this.
  if (!(await dependencies.canPublishReadReceipt(userId))) {
    return;
  }

  const states = await dependencies.getReadStates(conversationId);
  const reader = states.find((state) => state.userId === userId);
  if (!reader) {
    return;
  }

  let emitter = io.to(`dm:${conversationId}`);
  for (const state of states) {
    emitter = emitter.to(`user:${state.userId}`);
  }
  emitter.emit("dm:conversation:read", {
    conversationId,
    lastReadAt: reader.lastReadAt?.toISOString() ?? null,
    userId,
  });
}
