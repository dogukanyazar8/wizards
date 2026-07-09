import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import type { MobileChannelMessagesResponse, MobileDMMessagesResponse } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileDMMessages } from "../dm/mobile-dm-client";
import { fetchMobileChannelMessages } from "../workspace/mobile-workspace-client";
import { mobileQueryKeys } from "./mobile-query-keys";

export function getMobileChannelMessagesQueryOptions(client: MobileApiClient, channelId: string) {
  return infiniteQueryOptions({
    enabled: channelId.length > 0,
    getNextPageParam: (page: MobileChannelMessagesResponse) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchMobileChannelMessages(client, { channelId, cursor: pageParam }),
    queryKey: mobileQueryKeys.channelMessages(channelId),
  });
}

export function useMobileChannelMessagesQuery(client: MobileApiClient, channelId: string) {
  return useInfiniteQuery(getMobileChannelMessagesQueryOptions(client, channelId));
}

export function getMobileDMMessagesQueryOptions(client: MobileApiClient, conversationId: string) {
  return infiniteQueryOptions({
    enabled: conversationId.length > 0,
    getNextPageParam: (page: MobileDMMessagesResponse) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchMobileDMMessages(client, { conversationId, cursor: pageParam }),
    queryKey: mobileQueryKeys.dmMessages(conversationId),
  });
}

export function useMobileDMMessagesQuery(client: MobileApiClient, conversationId: string) {
  return useInfiniteQuery(getMobileDMMessagesQueryOptions(client, conversationId));
}
