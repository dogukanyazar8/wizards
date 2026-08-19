import assert from "node:assert/strict";
import { it } from "node:test";

import { jsonError } from "@/lib/api";
import { deleteBanRoute } from "./route-logic";

it("authenticates, rate limits, then removes the selected server ban", async () => {
  const calls: string[] = [];
  const response = await deleteBanRoute(
    new Request("https://whispr.test/api/v1/servers/server-1/bans/user-1", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ serverId: "server-1", userId: "user-1" }) },
    {
      enforceApiRateLimit: async (userId, action) => {
        calls.push(`rate:${userId}:${action}`);
      },
      jsonError,
      requireApiUserId: async () => {
        calls.push("auth");
        return "moderator-1";
      },
      unbanWorkspaceMember: async (actorId, serverId, userId) => {
        calls.push(`unban:${actorId}:${serverId}:${userId}`);
        return { success: true };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "auth",
    "rate:moderator-1:member:unban",
    "unban:moderator-1:server-1:user-1",
  ]);
});
