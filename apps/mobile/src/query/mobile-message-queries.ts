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

/**
 * The channel transcript, live by default and anchored when a search hit names
 * a message: page one is then the window around it, and every page after that
 * walks backwards exactly like the live stream.
 *
 * One builder rather than two, because the anchored read is the same shape with
 * a different first request — and a caller that had to choose between two
 * hooks could not switch back to live without remounting the list.
 */
export function getMobileChannelMessagesQueryOptions(
  client: MobileApiClient,
  channelId: string,
  enabled = true,
  aroundMessageId: string | null = null,
) {
  return infiniteQueryOptions({
    enabled: enabled && channelId.length > 0,
    getNextPageParam: (page: MobileChannelMessagesResponse) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchMobileChannelMessages(client, {
        ...(pageParam === null && aroundMessageId !== null ? { around: aroundMessageId } : {}),
        channelId,
        cursor: pageParam,
        signal,
      }),
    /**
     * A sibling cache entry, never the live one: the realtime bridge patches
     * `channelMessages(channelId)` and must not be taught a second shape of the
     * same transcript, and the offline stream must keep holding the tail rather
     * than whatever slice was last searched.
     */
    queryKey:
      aroundMessageId === null
        ? mobileQueryKeys.channelMessages(channelId)
        : mobileQueryKeys.channelMessagesAround(channelId, aroundMessageId),
    staleTime: MOBILE_MESSAGE_STREAM_STALE_TIME_MS,
  });
}

export function getMobileDMMessagesQueryOptions(
  client: MobileApiClient,
  conversationId: string,
  enabled = true,
) {
  return infiniteQueryOptions({
    enabled: enabled && conversationId.length > 0,
    getNextPageParam: (page: MobileDMMessagesResponse) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchMobileDMMessages(client, { conversationId, cursor: pageParam, signal }),
    queryKey: mobileQueryKeys.dmMessages(conversationId),
    staleTime: MOBILE_MESSAGE_STREAM_STALE_TIME_MS,
  });
}

export function useMobileDMMessagesQuery(
  client: MobileApiClient,
  conversationId: string,
  enabled = true,
) {
  return useInfiniteQuery(getMobileDMMessagesQueryOptions(client, conversationId, enabled));
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
