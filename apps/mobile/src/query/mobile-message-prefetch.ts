import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { beginMobileNavigationSpan } from "../performance/mobile-navigation-timing";
import { markMobileMessageStreamPrefetched } from "./mobile-message-stream-source";
import { mobileQueryKeys } from "./mobile-query-keys";
import type { MobileApiClient } from "../api/mobile-api-client";
import {
  getMobileChannelMessagesQueryOptions,
  getMobileDMMessagesQueryOptions,
} from "./mobile-message-queries";

/**
 * Warms one message stream's newest page.
 *
 * The stream query only mounts once the screen is on the stack and the root
 * selection state has committed, so the request used to leave the device a full
 * render cycle after the tap. Prefetching on the tap itself puts the fetch on
 * the same frame as the navigation, and `prefetchInfiniteQuery` is a no-op while
 * the cached page is still inside its stale time — a reopen costs nothing.
 */
export function prefetchMobileChannelMessagesPage(
  queryClient: QueryClient,
  client: MobileApiClient,
  channelId: string,
): Promise<void> {
  if (channelId.length === 0) {
    return Promise.resolve();
  }

  return queryClient.prefetchInfiniteQuery({
    ...getMobileChannelMessagesQueryOptions(client, channelId),
    pages: 1,
  });
}

export function prefetchMobileDMMessagesPage(
  queryClient: QueryClient,
  client: MobileApiClient,
  conversationId: string,
): Promise<void> {
  if (conversationId.length === 0) {
    return Promise.resolve();
  }

  return queryClient.prefetchInfiniteQuery({
    ...getMobileDMMessagesQueryOptions(client, conversationId),
    pages: 1,
  });
}

/**
 * How many conversations get warmed after the inbox lands.
 *
 * Message bodies deliberately never reach disk, so a cold start has nothing local
 * to draw and every first open waits on the network. Warming the few conversations
 * the reader is most likely to open next buys most of the "already there" feel
 * without persisting anything — and it is bounded, because each one is a real read
 * on the backend.
 */
export const MOBILE_RECENT_DM_PREFETCH_LIMIT = 3;

/**
 * Whether speculation is welcome right now.
 *
 * Warming conversations nobody asked for costs a real backend read and the
 * reader's bytes, so it happens only while the app is in front of them and only
 * on a link that is not metered.
 */
export function shouldWarmMobileRecentDMs(input: {
  readonly appState: "active" | "background" | "inactive";
  readonly isMetered: boolean;
  readonly isSignedIn: boolean;
}): boolean {
  return input.isSignedIn && input.appState === "active" && !input.isMetered;
}

/**
 * Whether the warming did anything, told apart from whether it was attempted.
 *
 * The panel reported 4/4 warmed on a device run and it meant nothing: the count
 * was incremented before the request chain started, so it measured the
 * *intention* to warm. A conversation whose read never completed before the tap
 * is not a warm one — the reader waited for the same request either way.
 *
 * `openedAfterSettled` is the only one of these that is a win.
 */
type MobileRecentDMPrefetchStats = {
  readonly attempted: number;
  readonly hitRate: number;
  readonly openedAfterSettled: number;
  readonly settled: number;
};

const attemptedConversationIds = new Set<string>();
const settledConversationIds = new Set<string>();
const openedAfterSettledConversationIds = new Set<string>();

export function recordMobileRecentDMPrefetch(conversationIds: readonly string[]): void {
  for (const conversationId of conversationIds) {
    attemptedConversationIds.add(conversationId);
  }
}

/** Called when a warming read resolves, which is the moment it is worth anything. */
export function recordMobileRecentDMPrefetchSettled(conversationId: string): void {
  if (attemptedConversationIds.has(conversationId)) {
    settledConversationIds.add(conversationId);
    // The panel reports where an open's first screenful came from, and a warmed
    // stream is neither "already in memory" nor "restored from disk".
    markMobileMessageStreamPrefetched("dm", conversationId);
  }
}

export function recordMobileRecentDMPrefetchOpen(conversationId: string): void {
  // Only counted when the warm had already landed: opening a conversation whose
  // prefetch is still in flight is an ordinary open with an extra request.
  if (settledConversationIds.has(conversationId)) {
    openedAfterSettledConversationIds.add(conversationId);
  }
}

export function getMobileRecentDMPrefetchStats(): MobileRecentDMPrefetchStats {
  const settled = settledConversationIds.size;
  const openedAfterSettled = openedAfterSettledConversationIds.size;

  return {
    attempted: attemptedConversationIds.size,
    hitRate: settled === 0 ? 0 : openedAfterSettled / settled,
    openedAfterSettled,
    settled,
  };
}

export function resetMobileRecentDMPrefetchStatsForTests(): void {
  attemptedConversationIds.clear();
  settledConversationIds.clear();
  openedAfterSettledConversationIds.clear();
}

export function selectMobileRecentDMPrefetchIds(input: {
  readonly conversations: readonly { readonly id: string }[];
  readonly limit?: number;
  readonly selectedConversationId: string | null;
}): string[] {
  const limit = input.limit ?? MOBILE_RECENT_DM_PREFETCH_LIMIT;
  if (limit <= 0) {
    return [];
  }

  const ids = new Set<string>();
  for (const conversation of input.conversations) {
    if (conversation.id.length === 0 || conversation.id === input.selectedConversationId) {
      continue;
    }

    ids.add(conversation.id);
    if (ids.size >= limit) {
      break;
    }
  }

  return [...ids];
}

/**
 * How many conversations are drawn off disk once the inbox lands.
 *
 * Higher than the network warm above it because it is a different cost: a local
 * decrypt rather than a real backend read, bounded by the eight targets per scope
 * the encrypted store keeps at all.
 */
export const MOBILE_RECENT_DM_RESTORE_LIMIT = 5;

/**
 * Lives beside the prefetch selector rather than with the restore hook: that hook
 * reaches the encrypted store, which reaches Expo, and the node test runner
 * cannot transform any of it.
 */
export function selectMobileRecentDMRestoreIds(input: {
  readonly conversations: readonly { readonly id: string }[];
  readonly limit?: number;
}): string[] {
  const limit = input.limit ?? MOBILE_RECENT_DM_RESTORE_LIMIT;
  if (limit <= 0) {
    return [];
  }

  const ids = new Set<string>();
  for (const conversation of input.conversations) {
    if (conversation.id.length === 0) {
      continue;
    }

    ids.add(conversation.id);
    if (ids.size >= limit) {
      break;
    }
  }

  return [...ids];
}

export interface MobileMessagePrefetchActions {
  prefetchChannelMessages(channelId: string): void;
  prefetchDMMessages(conversationId: string): void;
}

/** Fire-and-forget wrappers for the tap handlers that open a chat. */
export function useMobileMessagePrefetch(client: MobileApiClient): MobileMessagePrefetchActions {
  const queryClient = useQueryClient();

  // The span opens here rather than in the container: this is the only place that
  // knows whether the stream the reader tapped was already cached, and that flag
  // decides which budget the open is measured against.
  const prefetchChannelMessages = useCallback(
    (channelId: string) => {
      const cacheHit =
        queryClient.getQueryData(mobileQueryKeys.channelMessages(channelId)) !== undefined;
      beginMobileNavigationSpan("ChannelChat", globalThis.performance.now(), cacheHit);
      void prefetchMobileChannelMessagesPage(queryClient, client, channelId).catch(() => undefined);
    },
    [client, queryClient],
  );

  const prefetchDMMessages = useCallback(
    (conversationId: string) => {
      const cacheHit =
        queryClient.getQueryData(mobileQueryKeys.dmMessages(conversationId)) !== undefined;
      beginMobileNavigationSpan("DirectMessage", globalThis.performance.now(), cacheHit);
      // The tap is the moment a warmed conversation becomes a hit. Nothing
      // recorded this before, so the panel's hit rate could only ever read 0%
      // however well the background warming was doing.
      recordMobileRecentDMPrefetchOpen(conversationId);
      void prefetchMobileDMMessagesPage(queryClient, client, conversationId).catch(() => undefined);
    },
    [client, queryClient],
  );

  return { prefetchChannelMessages, prefetchDMMessages };
}
