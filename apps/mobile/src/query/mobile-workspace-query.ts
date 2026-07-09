import { queryOptions, useQuery } from "@tanstack/react-query";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileWorkspaceServer } from "../workspace/mobile-workspace-client";
import { mobileQueryKeys } from "./mobile-query-keys";

export function getMobileWorkspaceQueryOptions(client: MobileApiClient, serverId: string) {
  return queryOptions({
    enabled: serverId.length > 0,
    queryFn: () => fetchMobileWorkspaceServer(client, { serverId }),
    queryKey: mobileQueryKeys.workspace(serverId),
  });
}

export function useMobileWorkspaceQuery(client: MobileApiClient, serverId: string) {
  return useQuery(getMobileWorkspaceQueryOptions(client, serverId));
}
