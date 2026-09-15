import assert from "node:assert/strict";
import { it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateEventQueries } from "@/lib/events/invalidate-event-queries";
import { eventsQueryKeys } from "@/lib/events/client";
import { homeQueryKeys } from "@/lib/home/client";
import { workspaceQueryKeys } from "@/lib/workspace/client";

it("refreshes all event projections without dropping cached content or unrelated queries", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const affected = [
    eventsQueryKeys.counts,
    eventsQueryKeys.lists,
    homeQueryKeys.upcoming(3),
    homeQueryKeys.upcoming(5),
    workspaceQueryKeys.serverEvents("s1"),
    workspaceQueryKeys.server("s1"),
  ];
  const unaffected = [homeQueryKeys.summary, workspaceQueryKeys.serverEvents("s2")];
  try {
    for (const key of [...affected, ...unaffected]) client.setQueryData(key, { retained: true });
    await invalidateEventQueries(client, "s1");
    for (const key of affected) {
      assert.equal(client.getQueryState(key)?.isInvalidated, true, JSON.stringify(key));
      assert.deepEqual(client.getQueryData(key), { retained: true });
    }
    for (const key of unaffected) assert.equal(client.getQueryState(key)?.isInvalidated, false);
  } finally {
    client.clear();
  }
});
