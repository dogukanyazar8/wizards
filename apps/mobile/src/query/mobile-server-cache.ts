import type { QueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileManagedWorkspaceServerDetailResponse,
  ServerNotificationLevel,
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

/** The subset of 6c's per-user preferences a single toggle can move. */
export type MobileServerUserSettingsPatch = {
  readonly muted?: boolean;
  readonly notificationLevel?: ServerNotificationLevel;
  readonly starred?: boolean;
};

/**
 * 6c reads its toggles off the bootstrap rail summary and 6d/6e read the same
 * three fields off the profile read model. One write, both caches — otherwise
 * the star flips in the menu and the profile keeps claiming it is off until
 * something else refetches.
 *
 * Only the keys the caller actually sent are applied: `muted` and
 * `notificationLevel` are separate concepts and neither derives from the other.
 */
export function patchMobileServerUserSettingsCaches(input: {
  queryClient: QueryClient;
  serverId: string;
  settings: MobileServerUserSettingsPatch;
}): void {
  const { queryClient, serverId, settings } = input;

  queryClient.setQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap(), (current) => {
    if (!current) {
      return current;
    }

    let changed = false;
    const recent = current.home.servers.recent.map((server) => {
      if (server.id !== serverId) {
        return server;
      }

      const next = { ...server, ...settings };
      if (
        next.muted === server.muted &&
        next.notificationLevel === server.notificationLevel &&
        next.starred === server.starred
      ) {
        return server;
      }

      changed = true;
      return next;
    });

    return changed
      ? {
          ...current,
          home: { ...current.home, servers: { ...current.home.servers, recent } },
        }
      : current;
  });

  // Typed loosely on purpose: the profile entry is only present once the
  // profile route has been read, and the patch touches three fields of it.
  queryClient.setQueryData<MobileServerUserSettingsPatch>(
    mobileQueryKeys.serverProfile(serverId),
    (current) => (current ? { ...current, ...settings } : current),
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
