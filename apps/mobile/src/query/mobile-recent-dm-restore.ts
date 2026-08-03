import { useEffect } from "react";
import { MobileDMMessagesResponseSchema } from "@wizards/types";
import type { QueryClient } from "@tanstack/react-query";
import { scheduleMobileIdleTask } from "../performance/mobile-idle-task";
import type { MobileMessageStore } from "../storage/mobile-message-store";
import { mobileMessageStore } from "../storage/mobile-message-store-database";
import { selectMobileRecentDMRestoreIds } from "./mobile-message-prefetch";
import { hydrateMobileMessageStream } from "./mobile-message-stream-cache";

/**
 * Restores the newest conversations from the encrypted store before they are
 * opened, rather than after.
 *
 * The stream query mounts the moment a conversation is selected, and the disk
 * read only started in the effect after that — so the encrypted page raced the
 * network from a standing start, behind opening the database and parsing a page,
 * and usually lost. Moving the read to the inbox means the tap opens into memory,
 * and the whole restore is off the open's critical path.
 *
 * The restored page is dated to when it was written, so the stream still refetches
 * on mount and the network still reconciles it; see `hydrateMobileMessageStream`.
 */
export function useMobileRecentDMRestore(input: {
  readonly conversations: readonly { readonly id: string }[];
  readonly enabled: boolean;
  /** The conversation being opened; it is restored first and without waiting. */
  readonly priorityConversationId?: string | null;
  readonly queryClient: QueryClient;
  readonly store?: MobileMessageStore;
  readonly userId: string | null;
}): void {
  const { enabled, queryClient } = input;
  const store = input.store ?? mobileMessageStore;
  const userId = input.userId ?? "";
  const priorityConversationId = input.priorityConversationId ?? "";
  // Joined so the effect re-runs on the ids themselves, not on the array identity
  // the inbox query mints on every fetch.
  const restoreIds = selectMobileRecentDMRestoreIds({
    conversations: input.conversations,
    priorityConversationId,
  }).join(",");

  useEffect(() => {
    if (!enabled || restoreIds.length === 0 || userId.length === 0) {
      return;
    }

    let cancelled = false;
    const restore = (conversationId: string) =>
      hydrateMobileMessageStream({
        parsePage: (page) => {
          const parsed = MobileDMMessagesResponseSchema.safeParse(page);
          return parsed.success ? parsed.data : null;
        },
        queryClient,
        scope: "dm",
        store,
        targetId: conversationId,
        userId,
      }).then(
        () => undefined,
        () => undefined,
      );

    const ids = restoreIds.split(",");
    /**
     * The conversation being opened does not wait for idle.
     *
     * `requestIdleCallback` can be several frames away, and the stream query for
     * this target is already on the wire — the read has to start now or it is
     * only ever going to lose. The speculative ones behind it still wait: they
     * are a guess, and a guess must not compete with the open.
     */
    const opensNow = priorityConversationId.length > 0 && ids[0] === priorityConversationId;
    const chain = opensNow ? restore(ids[0]!) : Promise.resolve();
    const deferred = opensNow ? ids.slice(1) : ids;

    const handle = scheduleMobileIdleTask(() => {
      // One at a time: the encrypted database is a single connection, and a
      // burst of parallel reads only queues behind itself.
      void deferred
        .reduce(
          (queue, conversationId) =>
            queue.then(() => (cancelled ? undefined : restore(conversationId))),
          chain,
        )
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
      handle.cancel();
    };
  }, [enabled, priorityConversationId, queryClient, restoreIds, store, userId]);
}
