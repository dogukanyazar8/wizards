import { queryOptions, useQuery } from "@tanstack/react-query";
import { MOBILE_PERSISTED_QUERY_GC_TIME_MS } from "./mobile-query-cache-policy";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileWorkspaceServer } from "../workspace/mobile-workspace-client";
import { mobileQueryKeys } from "./mobile-query-keys";

/** Matches bootstrap: the two roots move together and are refreshed together. */
export const MOBILE_WORKSPACE_STALE_TIME_MS = 60_000;

export function getMobileWorkspaceQueryOptions(client: MobileApiClient, serverId: string) {
  return queryOptions({
    enabled: serverId.length > 0,
    queryFn: ({ signal }) => fetchMobileWorkspaceServer(client, { serverId, signal }),
    queryKey: mobileQueryKeys.workspace(serverId),
    // Persisted root: it is on disk for a day, so dropping it from memory in
    // half an hour would only force a re-read of what the device already has.
    gcTime: MOBILE_PERSISTED_QUERY_GC_TIME_MS,
    /**
     * The other half of the request storm bootstrap was already fixed for.
     *
     * A thirty-open run that never restarted the app issued sixty of these,
     * against three in a run that cold-started thirty times: every screen that
     * mounted an observer refetched a payload the device had just read. Explicit
     * invalidation still refreshes it, and so does the resume path.
     */
    refetchOnMount: false,
    staleTime: MOBILE_WORKSPACE_STALE_TIME_MS,
  });
}

export function useMobileWorkspaceQuery(client: MobileApiClient, serverId: string) {
  return useQuery(getMobileWorkspaceQueryOptions(client, serverId));
}
