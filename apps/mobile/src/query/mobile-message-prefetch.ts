import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { beginMobileNavigationSpan } from "../performance/mobile-navigation-timing";
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
 * Hit rate for the warming: how much of what was warmed the reader actually
 * opened. A rate that stays low is the signal to delete the feature rather than
 * tune it.
 */
type MobileRecentDMPrefetchStats = {
  readonly hitRate: number;
  readonly hits: number;
  readonly warmed: number;
};

const warmedConversationIds = new Set<string>();
const openedWarmConversationIds = new Set<string>();
const settledWarmConversationIds = new Set<string>();
const prefetchReadinessListeners = new Set<() => void>();

function notifyMobileRecentDMPrefetchReadiness(): void {
  for (const listener of prefetchReadinessListeners) {
    listener();
  }
}

export function subscribeMobileRecentDMPrefetchReadiness(listener: () => void): () => void {
  prefetchReadinessListeners.add(listener);
  return () => {
    prefetchReadinessListeners.delete(listener);
  };
}

export function recordMobileRecentDMPrefetch(conversationIds: readonly string[]): void {
  let changed = false;
  for (const conversationId of conversationIds) {
    if (!warmedConversationIds.has(conversationId)) {
      warmedConversationIds.add(conversationId);
      changed = true;
    }
  }
  if (changed) {
    notifyMobileRecentDMPrefetchReadiness();
  }
}

/**
 * A warming request only makes a cache hit possible after its first page has
 * actually arrived. Keeping this separate from `warmed` lets device automation
 * wait for a real cache rather than racing the fire-and-forget request.
 */
export function recordMobileRecentDMPrefetchSettled(conversationId: string): void {
  if (
    warmedConversationIds.has(conversationId) &&
    !settledWarmConversationIds.has(conversationId)
  ) {
    settledWarmConversationIds.add(conversationId);
    notifyMobileRecentDMPrefetchReadiness();
  }
}

export function getMobileRecentDMPrefetchReadiness(): {
  readonly completed: number;
  readonly ready: boolean;
  readonly warmed: number;
} {
  const warmed = warmedConversationIds.size;
  const completed = [...warmedConversationIds].filter((id) =>
    settledWarmConversationIds.has(id),
  ).length;
  return { completed, ready: warmed > 0 && completed === warmed, warmed };
}

export function recordMobileRecentDMPrefetchOpen(conversationId: string): void {
  if (warmedConversationIds.has(conversationId)) {
    openedWarmConversationIds.add(conversationId);
  }
}

export function getMobileRecentDMPrefetchStats(): MobileRecentDMPrefetchStats {
  const warmed = warmedConversationIds.size;
  const hits = openedWarmConversationIds.size;
  return { hitRate: warmed === 0 ? 0 : hits / warmed, hits, warmed };
}

export function resetMobileRecentDMPrefetchStatsForTests(): void {
  warmedConversationIds.clear();
  openedWarmConversationIds.clear();
  settledWarmConversationIds.clear();
  notifyMobileRecentDMPrefetchReadiness();
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
