import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import { MOBILE_PERSISTED_QUERY_GC_TIME_MS } from "./mobile-query-cache-policy";
import type { InfiniteData } from "@tanstack/react-query";
import type { MobileDMConversationListItem, MobileDMConversationsResponse } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileDMConversations } from "../dm/mobile-dm-client";
import { mobileQueryKeys } from "./mobile-query-keys";

export function getMobileDMConversationsQueryOptions(client: MobileApiClient, enabled: boolean) {
  return infiniteQueryOptions({
    enabled,
    getNextPageParam: (page: MobileDMConversationsResponse) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMobileDMConversations(client, { cursor: pageParam }),
    queryKey: mobileQueryKeys.dmConversations(),
    // Persisted root: it is on disk for a day, so dropping it from memory in
    // half an hour would only force a re-read of what the device already has.
    gcTime: MOBILE_PERSISTED_QUERY_GC_TIME_MS,
  });
}

export function useMobileDMConversationsQuery(client: MobileApiClient, enabled: boolean) {
  return useInfiniteQuery(getMobileDMConversationsQueryOptions(client, enabled));
}

export function flattenMobileDMConversationPages(
  data: InfiniteData<MobileDMConversationsResponse, unknown> | undefined,
): MobileDMConversationListItem[] {
  const conversations = new Map<string, MobileDMConversationListItem>();
  for (const page of data?.pages ?? []) {
    for (const conversation of page.conversations) {
      if (!conversations.has(conversation.id)) {
        conversations.set(conversation.id, conversation);
      }
    }
  }
  return [...conversations.values()];
}

export function getMobileDMUnreadCount(
  data: InfiniteData<MobileDMConversationsResponse, unknown> | undefined,
): number {
  return data?.pages[0]?.totalUnreadCount ?? 0;
}
