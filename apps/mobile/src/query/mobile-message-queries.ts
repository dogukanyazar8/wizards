import { infiniteQueryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { MobileChannelMessagesResponse, MobileDMMessagesResponse } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileDMMessages } from "../dm/mobile-dm-client";
import {
  fetchMobileChannelMessages,
  fetchMobileChannelPinnedMessages,
} from "../workspace/mobile-workspace-client";
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

/** 8c pinned-message banner and pins sheet for the active text channel. */
export function useMobileChannelPinsQuery(client: MobileApiClient, channelId: string) {
  return useQuery({
    enabled: channelId.length > 0,
    queryFn: () => fetchMobileChannelPinnedMessages(client, { channelId }),
    queryKey: mobileQueryKeys.channelPins(channelId),
    staleTime: 30_000,
  });
}
