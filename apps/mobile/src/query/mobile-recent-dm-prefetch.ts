import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import type { MobileApiClient } from "../api/mobile-api-client";
import { isMobileNetworkMetered } from "../network/mobile-network-events";
import { scheduleMobileIdleTask } from "../performance/mobile-idle-task";
import {
  prefetchMobileDMMessagesPage,
  recordMobileRecentDMPrefetch,
  selectMobileRecentDMPrefetchIds,
  shouldWarmMobileRecentDMs,
} from "./mobile-message-prefetch";

/**
 * Warms the newest conversations once the inbox has resolved, after the launch
 * work rather than during it.
 */
export function useMobileRecentDMPrefetch(input: {
  readonly apiClient: MobileApiClient;
  readonly conversations: readonly { readonly id: string }[];
  readonly enabled: boolean;
  readonly queryClient: QueryClient;
  readonly selectedConversationId: string | null;
}): void {
  const { apiClient, enabled, queryClient } = input;
  // Joined so the effect re-runs on the ids themselves, not on the array identity
  // the inbox query mints on every fetch.
  const prefetchIds = selectMobileRecentDMPrefetchIds({
    conversations: input.conversations,
    selectedConversationId: input.selectedConversationId,
  }).join(",");

  useEffect(() => {
    if (prefetchIds.length === 0) {
      return;
    }

    const appState = AppState.currentState;
    if (
      !shouldWarmMobileRecentDMs({
        appState:
          appState === "active" ? "active" : appState === "inactive" ? "inactive" : "background",
        isMetered: isMobileNetworkMetered(),
        isSignedIn: enabled,
      })
    ) {
      return;
    }

    const handle = scheduleMobileIdleTask(() => {
      const conversationIds = prefetchIds.split(",");
      recordMobileRecentDMPrefetch(conversationIds);
      // One at a time: a burst of speculative reads competes with the fetch the
      // reader is actually waiting for.
      void conversationIds
        .reduce(
          (chain, conversationId) =>
            chain.then(() =>
              prefetchMobileDMMessagesPage(queryClient, apiClient, conversationId).catch(
                () => undefined,
              ),
            ),
          Promise.resolve(),
        )
        .catch(() => undefined);
    });

    return () => {
      handle.cancel();
    };
  }, [apiClient, enabled, prefetchIds, queryClient]);
}
