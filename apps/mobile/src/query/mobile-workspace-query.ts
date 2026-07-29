import { queryOptions, useQuery } from "@tanstack/react-query";
import { MOBILE_PERSISTED_QUERY_GC_TIME_MS } from "./mobile-query-cache-policy";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileWorkspaceServer } from "../workspace/mobile-workspace-client";
import { mobileQueryKeys } from "./mobile-query-keys";

export function getMobileWorkspaceQueryOptions(client: MobileApiClient, serverId: string) {
  return queryOptions({
    enabled: serverId.length > 0,
    queryFn: () => fetchMobileWorkspaceServer(client, { serverId }),
    queryKey: mobileQueryKeys.workspace(serverId),
    // Persisted root: it is on disk for a day, so dropping it from memory in
    // half an hour would only force a re-read of what the device already has.
    gcTime: MOBILE_PERSISTED_QUERY_GC_TIME_MS,
  });
}

export function useMobileWorkspaceQuery(client: MobileApiClient, serverId: string) {
  return useQuery(getMobileWorkspaceQueryOptions(client, serverId));
}
