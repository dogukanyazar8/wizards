import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type { MobileServerMembersResponse } from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import {
  fetchMobileAssignableRoles,
  fetchMobileServerRoleOverview,
  fetchMobileServerInvites,
  fetchMobileServerMembers,
} from "./mobile-server-management-client";

export function getMobileServerMembersInfiniteQueryOptions(
  client: MobileApiClient,
  serverId: string,
) {
  return infiniteQueryOptions<
    MobileServerMembersResponse,
    Error,
    InfiniteData<MobileServerMembersResponse>,
    ReturnType<typeof mobileQueryKeys.workspaceMembers>,
    string | null
  >({
    enabled: serverId.length > 0,
    getNextPageParam: (lastPage) => lastPage.memberPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMobileServerMembers(client, { cursor: pageParam, serverId }),
    queryKey: mobileQueryKeys.workspaceMembers(serverId),
  });
}

export function useMobileServerMembersInfiniteQuery(client: MobileApiClient, serverId: string) {
  return useInfiniteQuery(getMobileServerMembersInfiniteQueryOptions(client, serverId));
}

export function getMobileAssignableRolesQueryOptions(
  client: MobileApiClient,
  serverId: string,
  enabled: boolean,
) {
  return queryOptions({
    enabled: enabled && serverId.length > 0,
    queryFn: () => fetchMobileAssignableRoles(client, { serverId }),
    queryKey: mobileQueryKeys.workspaceRoles(serverId),
  });
}

export function useMobileAssignableRolesQuery(
  client: MobileApiClient,
  serverId: string,
  enabled: boolean,
) {
  return useQuery(getMobileAssignableRolesQueryOptions(client, serverId, enabled));
}

export function getMobileServerRoleOverviewQueryOptions(
  client: MobileApiClient,
  serverId: string,
  enabled: boolean,
) {
  return queryOptions({
    enabled: enabled && serverId.length > 0,
    queryFn: () => fetchMobileServerRoleOverview(client, { serverId }),
    queryKey: mobileQueryKeys.workspaceRoleOverview(serverId),
  });
}

export function useMobileServerRoleOverviewQuery(
  client: MobileApiClient,
  serverId: string,
  enabled: boolean,
) {
  return useQuery(getMobileServerRoleOverviewQueryOptions(client, serverId, enabled));
}

export function getMobileServerInvitesQueryOptions(
  client: MobileApiClient,
  serverId: string,
  enabled: boolean,
) {
  return queryOptions({
    enabled: enabled && serverId.length > 0,
    queryFn: () => fetchMobileServerInvites(client, { serverId }),
    queryKey: mobileQueryKeys.workspaceInvites(serverId),
  });
}

export function useMobileServerInvitesQuery(
  client: MobileApiClient,
  serverId: string,
  enabled: boolean,
) {
  return useQuery(getMobileServerInvitesQueryOptions(client, serverId, enabled));
}
