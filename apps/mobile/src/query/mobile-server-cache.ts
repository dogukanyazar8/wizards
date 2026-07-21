import type { QueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { getMobileWorkspaceQueryOptions } from "./mobile-workspace-query";
import { mobileQueryKeys } from "./mobile-query-keys";

function isCanonicalHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function patchMobileServerIconCaches(input: {
  iconUrl: string;
  queryClient: QueryClient;
  serverId: string;
}): void {
  if (!isCanonicalHttpsUrl(input.iconUrl)) {
    return;
  }

  const { iconUrl, queryClient, serverId } = input;

  queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
    if (!current) {
      return current;
    }

    let changed = false;
    const recent = current.home.servers.recent.map((server) => {
      if (server.id !== serverId || server.iconUrl === iconUrl) {
        return server;
      }

      changed = true;
      return { ...server, iconUrl };
    });

    return changed
      ? {
          ...current,
          home: {
            ...current.home,
            servers: { ...current.home.servers, recent },
          },
        }
      : current;
  });

  queryClient.setQueryData<MobileManagedWorkspaceServerDetailResponse>(
    mobileQueryKeys.workspace(serverId),
    (current) => {
      if (
        !current ||
        current.detail.server.id !== serverId ||
        current.detail.server.iconUrl === iconUrl
      ) {
        return current;
      }

      return {
        ...current,
        detail: {
          ...current.detail,
          server: { ...current.detail.server, iconUrl },
        },
      };
    },
  );
}

/**
 * Re-reads the server detail straight from the API (bypassing staleTime, which the
 * optimistic patch above just refreshed) and reports whether the claimed icon actually
 * survived on the backend. Without this read-back a failed persist is indistinguishable
 * from a working one on screen: the local preview keeps showing the picked image.
 */
export async function confirmMobileServerIconPersisted(input: {
  client: MobileApiClient;
  iconUrl: string;
  queryClient: QueryClient;
  serverId: string;
}): Promise<boolean> {
  try {
    const refreshed = await input.queryClient.fetchQuery({
      ...getMobileWorkspaceQueryOptions(input.client, input.serverId),
      staleTime: 0,
    });

    return refreshed.detail.server.iconUrl === input.iconUrl;
  } catch {
    return false;
  }
}
