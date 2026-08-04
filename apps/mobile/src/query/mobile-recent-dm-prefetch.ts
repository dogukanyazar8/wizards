import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";
import type { MobileApiClient } from "../api/mobile-api-client";
import { isMobileNetworkMetered } from "../network/mobile-network-events";
import { scheduleMobileIdleTask } from "../performance/mobile-idle-task";
import {
  prefetchMobileDMMessagesPage,
  recordMobileRecentDMPrefetch,
  recordMobileRecentDMPrefetchSettled,
  selectMobileRecentDMPrefetchIds,
  shouldWarmMobileRecentDMs,
} from "./mobile-message-prefetch";
import { mobileQueryKeys } from "./mobile-query-keys";

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

    const conversationIds = prefetchIds.split(",");
    let cancelled = false;
    const handle = scheduleMobileIdleTask(() => {
      recordMobileRecentDMPrefetch(conversationIds);
      // One at a time: a burst of speculative reads competes with the fetch the
      // reader is actually waiting for.
      void (async () => {
        for (const conversationId of conversationIds) {
          if (cancelled) {
            return;
          }
          try {
            const fetched = await prefetchMobileDMMessagesPage(
              queryClient,
              apiClient,
              conversationId,
            );
            if (!cancelled && fetched) {
              recordMobileRecentDMPrefetchSettled(conversationId);
            }
          } catch {
            if (cancelled) {
              return;
            }
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      handle.cancel();
      for (const conversationId of conversationIds) {
        const queryKey = mobileQueryKeys.dmMessages(conversationId);
        const query = queryClient.getQueryCache().find({ exact: true, queryKey });
        if ((query?.getObserversCount() ?? 0) === 0) {
          void queryClient.cancelQueries({ exact: true, queryKey });
        }
      }
    };
  }, [apiClient, enabled, prefetchIds, queryClient]);
}
