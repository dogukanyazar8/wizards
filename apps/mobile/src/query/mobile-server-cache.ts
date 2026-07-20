import type { QueryClient } from "@tanstack/react-query";
import type {
  MobileBootstrapPayload,
  MobileManagedWorkspaceServerDetailResponse,
} from "@wizards/types";

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
