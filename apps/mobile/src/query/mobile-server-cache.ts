import type { QueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileWorkspaceServer } from "../workspace/mobile-workspace-client";
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
 * Re-reads the server detail straight from the API and reports whether the claimed icon
 * actually survived on the backend. Without this read-back a failed persist is
 * indistinguishable from a working one on screen: the local preview keeps showing the
 * picked image.
 *
 * The request deliberately bypasses `queryClient.fetchQuery`. TanStack dedupes by query
 * key and hands back the promise of an already running fetch, and returning from the OS
 * image picker refocuses the app, which starts a workspace refetch that left the device
 * before the claim committed. Joining that request makes the read-back adopt a pre-upload
 * response and report a stored icon as lost, which is exactly how a working upload ends
 * up reverting on screen. A direct request always observes post-claim state.
 */
export async function confirmMobileServerIconPersisted(input: {
  client: MobileApiClient;
  iconUrl: string;
  queryClient: QueryClient;
  serverId: string;
}): Promise<boolean> {
  try {
    const refreshed = await fetchMobileWorkspaceServer(input.client, {
      serverId: input.serverId,
    });

    // The verified read is newer than whatever the cache holds, including the optimistic
    // patch above, so publish it either way.
    input.queryClient.setQueryData(mobileQueryKeys.workspace(input.serverId), refreshed);

    return refreshed.detail.server.iconUrl === input.iconUrl;
  } catch {
    return false;
  }
}
