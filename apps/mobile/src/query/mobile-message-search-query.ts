import { infiniteQueryOptions, useInfiniteQuery } from "@tanstack/react-query";
import type { MessageSearchResponse } from "@wizards/types";
import type { MobileApiClient } from "../api/mobile-api-client";
import {
  MOBILE_MESSAGE_SEARCH_MAX_QUERY_LENGTH,
  MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH,
  searchMobileMessages,
  type MobileMessageSearchInput,
} from "../search/mobile-message-search-client";
import { mobileQueryKeys } from "./mobile-query-keys";

function isMobileMessageSearchEnabled(input: MobileMessageSearchInput): boolean {
  const queryLength = input.query.trim().replace(/\s+/g, " ").length;
  return (
    input.conversationId.trim().length > 0 &&
    queryLength >= MOBILE_MESSAGE_SEARCH_MIN_QUERY_LENGTH &&
    queryLength <= MOBILE_MESSAGE_SEARCH_MAX_QUERY_LENGTH
  );
}

export function getMobileMessageSearchQueryOptions(
  client: MobileApiClient,
  input: MobileMessageSearchInput,
) {
  return infiniteQueryOptions({
    enabled: isMobileMessageSearchEnabled(input),
    getNextPageParam: (page: MessageSearchResponse) => page.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => searchMobileMessages(client, { ...input, cursor: pageParam }),
    queryKey: mobileQueryKeys.messageSearch(input),
  });
}

export function useMobileMessageSearchQuery(
  client: MobileApiClient,
  input: MobileMessageSearchInput,
) {
  return useInfiniteQuery(getMobileMessageSearchQueryOptions(client, input));
}
