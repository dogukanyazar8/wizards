import { queryOptions, useQuery } from "@tanstack/react-query";
import { BADGE_QUERY_STALE_TIME_MS } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { fetchOwnBadges, fetchUserBadges } from "./mobile-badges-client";

/**
 * The badge read runs beside the profile read rather than inside it: the two go
 * stale on different clocks (presence in seconds, a badge in days) and the card
 * must not wait on the slower one to draw. The chip row holds its 28px while
 * this is in flight, so a late arrival does not move the card.
 *
 * `BADGE_QUERY_STALE_TIME_MS` comes from the shared package so a phone and a
 * browser refresh on the same schedule.
 */
export function getMobileUserBadgesQueryOptions(
  client: MobileApiClient,
  input: { enabled?: boolean; userId: string },
) {
  return queryOptions({
    enabled: input.enabled ?? true,
    queryFn: () => fetchUserBadges(client, input.userId),
    queryKey: mobileQueryKeys.badges.user(input.userId),
    staleTime: BADGE_QUERY_STALE_TIME_MS,
  });
}

/** Backs the 11b card and the 11c page from one cache entry. */
export function useMobileUserBadgesQuery(
  client: MobileApiClient,
  input: { enabled?: boolean; userId: string },
) {
  return useQuery(getMobileUserBadgesQueryOptions(client, input));
}

export function getMobileOwnBadgesQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    queryFn: () => fetchOwnBadges(client),
    queryKey: mobileQueryKeys.badges.own(),
    staleTime: BADGE_QUERY_STALE_TIME_MS,
  });
}

/** "Rozetlerim" (prompt 06) reads progress rows this query carries. */
export function useMobileOwnBadgesQuery(client: MobileApiClient, enabled = true) {
  return useQuery(getMobileOwnBadgesQueryOptions(client, enabled));
}
