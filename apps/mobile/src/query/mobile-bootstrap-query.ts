import { queryOptions, useQuery } from "@tanstack/react-query";
import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileBootstrap } from "../bootstrap/mobile-bootstrap";
import { mobileQueryKeys } from "./mobile-query-keys";

export function getMobileBootstrapQueryOptions(client: MobileApiClient, enabled = true) {
  return queryOptions({
    enabled,
    queryFn: () => fetchMobileBootstrap(client),
    queryKey: mobileQueryKeys.bootstrap(),
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
