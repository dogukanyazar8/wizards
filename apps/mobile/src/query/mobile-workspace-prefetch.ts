import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapServerSummary,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { getMobileChannelMessagesQueryOptions } from "./mobile-message-queries";
import { getMobileWorkspaceQueryOptions } from "./mobile-workspace-query";

/**
 * Server detail is one of the heaviest reads the backend serves, so warming it
 * is deliberately shallow: only the servers directly above and below the one the
 * user is looking at, which is where the next tap almost always lands.
 */
export const MOBILE_WORKSPACE_PREFETCH_SERVER_LIMIT = 2;

export function selectMobileWorkspacePrefetchServerIds(input: {
  readonly limit?: number;
  readonly recent: readonly Pick<MobileBootstrapServerSummary, "id">[];
  readonly selectedServerId: string | null;
}): string[] {
  const limit = input.limit ?? MOBILE_WORKSPACE_PREFETCH_SERVER_LIMIT;
  if (limit <= 0) {
    return [];
  }

  const ids = input.recent.map((server) => server.id).filter((id) => id.length > 0);
  const selectedIndex = ids.indexOf(input.selectedServerId ?? "");
  const neighbours =
    selectedIndex < 0
      ? ids
      : [...ids.slice(selectedIndex + 1), ...ids.slice(0, selectedIndex).reverse()];

  return [...new Set(neighbours)].slice(0, limit);
}

export function getMobileWorkspacePrefetchChannelId(
  detail: MobileManagedWorkspaceServerDetailResponse | undefined,
): string | null {
  return detail?.detail.server.defaultChannelId ?? null;
}

/**
 * Removes one leg of the bootstrap -> server -> channel waterfall. The default
 * channel is fetched as soon as the server resolves rather than when the user
 * taps it, so the message list is already cached by the time the screen mounts.
 */
export function useMobileWorkspacePrefetch({
  apiClient,
  enabled,
  queryClient,
  recentServers,
  selectedServerId,
  workspaceDetail,
}: {
  readonly apiClient: MobileApiClient;
  readonly enabled: boolean;
  readonly queryClient: QueryClient;
  readonly recentServers: readonly Pick<MobileBootstrapServerSummary, "id">[] | undefined;
  readonly selectedServerId: string | null;
  readonly workspaceDetail: MobileManagedWorkspaceServerDetailResponse | undefined;
}): void {
  const defaultChannelId = getMobileWorkspacePrefetchChannelId(workspaceDetail);

  useEffect(() => {
    if (!enabled || !defaultChannelId) {
      return;
    }

    void queryClient.prefetchInfiniteQuery({
      ...getMobileChannelMessagesQueryOptions(apiClient, defaultChannelId),
      pages: 1,
    });
  }, [apiClient, defaultChannelId, enabled, queryClient]);

  // Gated on the visible server having resolved: warming neighbours earlier
  // would put two heavy detail reads in front of the one the user is waiting on.
  const canWarmNeighbours = enabled && workspaceDetail !== undefined;
  const prefetchServerIds = selectMobileWorkspacePrefetchServerIds({
    recent: recentServers ?? [],
    selectedServerId,
  }).join(",");

  useEffect(() => {
    if (!canWarmNeighbours || prefetchServerIds.length === 0) {
      return;
    }

    for (const serverId of prefetchServerIds.split(",")) {
      void queryClient.prefetchQuery(getMobileWorkspaceQueryOptions(apiClient, serverId));
    }
  }, [apiClient, canWarmNeighbours, prefetchServerIds, queryClient]);
}
