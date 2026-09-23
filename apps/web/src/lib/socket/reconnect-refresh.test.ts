import assert from "node:assert/strict";
import { it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { dmQueryKeys } from "@/lib/dm/client";
import { homeQueryKeys } from "@/lib/home/client";
import { workspaceQueryKeys } from "@/lib/workspace/client";
import { createReconnectRefresh } from "./reconnect-refresh";

it("leaves the first connection's fresh queries alone and refreshes them after a reconnect", () => {
  const client = new QueryClient();
  const keys = [
    dmQueryKeys.list,
    workspaceQueryKeys.servers,
    ["workspace", "server", "server-1"],
    homeQueryKeys.summary,
    ["messages", "channel", "channel-1"],
  ];
  for (const key of keys) client.setQueryData(key, { seeded: true });
  const invalidated = () => keys.filter((key) => client.getQueryState(key)?.isInvalidated);
  const refresh = createReconnectRefresh(client);

  refresh();
  assert.deepEqual(invalidated(), [], "the page's own first connection is not a reconnect");

  refresh();
  assert.deepEqual(invalidated(), keys);

  client.clear();
});
