import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { jsonError, parseJsonBody } from "@/lib/api";
import { transferServerOwnershipRoute } from "./route-logic";

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/servers/server-1/transfer-ownership", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function dependencies(calls: string[]) {
  return {
    enforceApiRateLimit: async (userId: string, action: string) => {
      calls.push(`rate:${userId}:${action}`);
    },
    jsonError,
    parseJsonBody,
    requireApiUserId: async () => {
      calls.push("auth");
      return "owner-1";
    },
    transferServerOwnership: async (
      actorId: string,
      serverId: string,
      input: { newOwnerUserId: string },
    ) => {
      calls.push(`transfer:${actorId}:${serverId}:${input.newOwnerUserId}`);
      return { newOwnerUserId: input.newOwnerUserId, success: true as const };
    },
  };
}

describe("POST /api/v1/servers/[serverId]/transfer-ownership", () => {
  it("authenticates, spends the server:update budget, then transfers", async () => {
    const calls: string[] = [];
    const response = await transferServerOwnershipRoute(
      request({ acknowledged: true, newOwnerUserId: "user-2" }),
      { params: Promise.resolve({ serverId: "server-1" }) },
      dependencies(calls) as never,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { newOwnerUserId: "user-2", success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:owner-1:server:update",
      "transfer:owner-1:server-1:user-2",
    ]);
  });

  it("rejects an unacknowledged body before the service runs", async () => {
    const calls: string[] = [];
    const response = await transferServerOwnershipRoute(
      request({ acknowledged: false, newOwnerUserId: "user-2" }),
      { params: Promise.resolve({ serverId: "server-1" }) },
      dependencies(calls) as never,
    );

    assert.equal(response.status, 400);
    // Onay kapalıyken düğme pasif; sözleşme `literal(true)` olduğu için istek
    // servise hiç ulaşmaz.
    assert.deepEqual(calls, ["auth", "rate:owner-1:server:update"]);
  });

  it("rejects an unknown field rather than silently ignoring it", async () => {
    const calls: string[] = [];
    const response = await transferServerOwnershipRoute(
      request({ acknowledged: true, newOwnerUserId: "user-2", roleId: "role-1" }),
      { params: Promise.resolve({ serverId: "server-1" }) },
      dependencies(calls) as never,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(calls, ["auth", "rate:owner-1:server:update"]);
  });
});
