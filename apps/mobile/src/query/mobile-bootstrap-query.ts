import { queryOptions, useQuery } from "@tanstack/react-query";
import { MOBILE_PERSISTED_QUERY_GC_TIME_MS } from "./mobile-query-cache-policy";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileBootstrap } from "../bootstrap/mobile-bootstrap";
import { mobileQueryKeys } from "./mobile-query-keys";

export function getMobileBootstrapQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    queryFn: ({ signal }) => fetchMobileBootstrap(client, signal),
    queryKey: mobileQueryKeys.bootstrap(),
    // Persisted root: it is on disk for a day, so dropping it from memory in
    // half an hour would only force a re-read of what the device already has.
    gcTime: MOBILE_PERSISTED_QUERY_GC_TIME_MS,
    // Realtime handlers and mutations explicitly invalidate or patch bootstrap.
    // A mount inside that window must not add another large JSON parse wave.
    refetchOnMount: false,
    staleTime: 60_000,
  });
}

export function useMobileBootstrapQuery(client: MobileApiClient, enabled = true) {
  return useQuery(getMobileBootstrapQueryOptions(client, enabled));
}

export function useMobileDMConversationsQuery(client: MobileApiClient, enabled = true) {
  const query = useMobileBootstrapQuery(client, enabled);

  return {
    ...query,
    data: query.data?.home.directMessages ?? null,
  };
}
