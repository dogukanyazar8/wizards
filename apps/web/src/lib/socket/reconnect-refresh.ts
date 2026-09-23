import type { QueryClient } from "@tanstack/react-query";
import { dmQueryKeys } from "@/lib/dm/client";
import { homeQueryKeys } from "@/lib/home/client";
import { workspaceQueryKeys } from "@/lib/workspace/client";

/**
 * The `connect` handler that catches lists up on events missed while offline.
 * The first connection is not a catch-up: the page's own queries are loading or
 * just loaded, and invalidating them would cancel and restart those requests.
 */
export function createReconnectRefresh(queryClient: QueryClient) {
  let connectedBefore = false;
  return () => {
    if (!connectedBefore) {
      connectedBefore = true;
      return;
    }
    // Active message histories refresh after their room join acknowledgement.
    // Inactive histories must be stale when the reader opens them later.
    void queryClient.invalidateQueries({ queryKey: ["messages"], refetchType: "none" });
    for (const queryKey of [
      dmQueryKeys.list,
      workspaceQueryKeys.servers,
      ["workspace", "server"],
      homeQueryKeys.summary,
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}
