import type { QueryClient } from "@tanstack/react-query";

import { eventsQueryKeys } from "@/lib/events/client";
import { homeQueryKeys } from "@/lib/home/client";
import { workspaceQueryKeys } from "@/lib/workspace/client";

/** Refresh every event projection after a local write, even without a socket connection. */
export async function invalidateEventQueries(
  queryClient: QueryClient,
  serverId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: eventsQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: homeQueryKeys.upcomingPrefix }),
    queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.serverEvents(serverId) }),
    queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.server(serverId) }),
  ]);
}
