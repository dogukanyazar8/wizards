import { useEffect, useRef } from "react";

import { getMobileDMReadTarget } from "../../dm/mobile-dm-client";

/** Marks an open DM read once, then only for new inbound messages. */
export function useMobileDMReadEffect({
  conversationId,
  currentUserId,
  isSignedIn,
  latestMessage,
  markRead,
}: {
  readonly conversationId: string | null;
  readonly currentUserId: string | null;
  readonly isSignedIn: boolean;
  readonly latestMessage: {
    readonly deliveryStatus?: "sending" | "failed" | undefined;
    readonly id: string;
    readonly userId: string;
  } | null;
  readonly markRead: (input: { readonly conversationId: string }) => void;
}) {
  const readConversationId = getMobileDMReadTarget({
    conversationId,
    isSignedIn,
    latestMessageId: latestMessage?.id ?? null,
  });
  const lastMarkedRef = useRef<{ conversationId: string; messageId: string } | null>(null);

  useEffect(() => {
    if (!readConversationId || !latestMessage) return;

    const alreadyMarked = lastMarkedRef.current;
    const isNewConversation = alreadyMarked?.conversationId !== readConversationId;
    const isInboundArrival =
      !latestMessage.deliveryStatus &&
      latestMessage.userId !== currentUserId &&
      alreadyMarked?.messageId !== latestMessage.id;

    if (!isNewConversation && !isInboundArrival) return;

    lastMarkedRef.current = {
      conversationId: readConversationId,
      messageId: latestMessage.id,
    };
    markRead({ conversationId: readConversationId });
  }, [currentUserId, latestMessage, markRead, readConversationId]);
}
