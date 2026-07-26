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
  fetchMobileServerInviteSheet,
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

/**
 * `overrides` are observer-level only (staleTime and friends): the mention
 * roster reads the same cache entry as the members screen but does not want the
 * screen's 15s freshness, because it walks several pages and a refetch replays
 * every one of them.
 */
export function useMobileServerMembersInfiniteQuery(
  client: MobileApiClient,
  serverId: string,
  overrides?: { readonly staleTime?: number },
) {
  return useInfiniteQuery({
    ...getMobileServerMembersInfiniteQueryOptions(client, serverId),
    ...overrides,
  });
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

export function getMobileServerInviteSheetQueryOptions(
  client: MobileApiClient,
  serverId: string,
  enabled: boolean,
) {
  return queryOptions({
    enabled: enabled && serverId.length > 0,
    queryFn: () => fetchMobileServerInviteSheet(client, { serverId }),
    queryKey: mobileQueryKeys.workspaceInviteSheet(serverId),
    // Presence and pending invites move while the sheet is open, so it always
    // refetches on mount rather than painting a cached list.
    staleTime: 0,
  });
}

/** Backs both tabs of the 2a/2b invite sheet from one cache entry. */
export function useMobileServerInviteSheetQuery(
  client: MobileApiClient,
  serverId: string,
  enabled: boolean,
) {
  return useQuery(getMobileServerInviteSheetQueryOptions(client, serverId, enabled));
}
