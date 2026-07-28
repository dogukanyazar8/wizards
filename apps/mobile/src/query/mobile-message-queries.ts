import { infiniteQueryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { MobileChannelMessagesResponse, MobileDMMessagesResponse } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileDMMessages } from "../dm/mobile-dm-client";
import {
  getVisibleMobileChannelTypingUsers,
  type MobileChannelTypingState,
} from "../realtime/mobile-typing-state";
import {
  fetchMobileChannelMessages,
  fetchMobileChannelPinnedMessages,
} from "../workspace/mobile-workspace-client";
import { mobileQueryKeys } from "./mobile-query-keys";

/**
 * Message streams are socket-authoritative: the realtime bridge patches the
 * cache for every send, edit, delete and reaction, and invalidates the stream
 * when it cannot. The global 15s staleness therefore bought nothing and cost a
 * refetch every time a channel was reopened — the reader watched a list they
 * were already looking at reload. A reconnect still refetches, and pull-to-
 * refresh is always available.
 */
export const MOBILE_MESSAGE_STREAM_STALE_TIME_MS = 120_000;

export function getMobileChannelMessagesQueryOptions(client: MobileApiClient, channelId: string) {
  return infiniteQueryOptions({
    enabled: channelId.length > 0,
    getNextPageParam: (page: MobileChannelMessagesResponse) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchMobileChannelMessages(client, { channelId, cursor: pageParam }),
    queryKey: mobileQueryKeys.channelMessages(channelId),
    staleTime: MOBILE_MESSAGE_STREAM_STALE_TIME_MS,
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
    staleTime: MOBILE_MESSAGE_STREAM_STALE_TIME_MS,
  });
}

export function useMobileDMMessagesQuery(client: MobileApiClient, conversationId: string) {
  return useInfiniteQuery(getMobileDMMessagesQueryOptions(client, conversationId));
}

/**
 * 1a's "yazıyor" row, one entry per conversation.
 *
 * The realtime provider already keeps `dmTyping` keyed by conversation id and
 * fills it from `dm:typing:update` regardless of which chat is open, so the list
 * needs no second subscription — only this projection, which drops entries whose
 * TTL has lapsed so a row cannot get stuck mid-sentence.
 *
 * Conversations with nobody typing are absent rather than present-and-empty, so
 * a row can test membership directly.
 */
export type MobileDMConversationTypingMap = Readonly<Record<string, readonly string[]>>;

export function getMobileDMConversationTypingMap(
  state: MobileChannelTypingState,
  now = Date.now(),
): MobileDMConversationTypingMap {
  const map: Record<string, readonly string[]> = {};

  for (const conversationId of Object.keys(state)) {
    const names = getVisibleMobileChannelTypingUsers(state, conversationId, now).map(
      (user) => user.name,
    );
    if (names.length > 0) {
      map[conversationId] = names;
    }
  }

  return map;
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
