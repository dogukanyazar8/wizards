import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ServerBansResponseSchema } from "@wizards/types";
import { jsonError } from "@/lib/api";
import { getServerBansRoute } from "./route-logic";

function request(query = "") {
  return new Request(`https://whispr.test/api/v1/servers/server-1/bans${query}`);
}

const page = {
  bans: [
    {
      avatarUrl: null,
      bannedAt: "2026-08-25T10:00:00.000Z",
      bannedByDisplayName: "Ada",
      bannedByUserId: "user-owner",
      displayName: "Spam Bot",
      reason: "spam",
      userId: "user-banned",
      username: "spambot",
    },
  ],
  nextCursor: null,
  total: 1,
};

describe("server bans API", () => {
  it("authenticates, rate limits, then answers with the contract shape", async () => {
    const calls: string[] = [];
    const response = await getServerBansRoute(
      request(),
      { params: Promise.resolve({ serverId: "server-1" }) },
      {
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        jsonError,
        listWorkspaceServerBans: async (actorId, serverId) => {
          calls.push(`list:${actorId}:${serverId}`);
          return page;
        },
        requireApiUserId: async () => {
          calls.push("auth");
          return "moderator-1";
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "auth",
      "rate:moderator-1:server:bans:list",
      "list:moderator-1:server-1",
    ]);
    assert.deepEqual(ServerBansResponseSchema.parse(await response.json()), page);
  });

  it("passes the cursor and the limit through, and omits what was not asked", async () => {
    let received: unknown;
    await getServerBansRoute(
      request("?cursor=ban-9&limit=10"),
      { params: Promise.resolve({ serverId: "server-1" }) },
      {
        enforceApiRateLimit: async () => undefined,
        jsonError,
        listWorkspaceServerBans: async (_actorId, _serverId, options) => {
          received = options;
          return page;
        },
        requireApiUserId: async () => "moderator-1",
      },
    );

    assert.deepEqual(received, { cursor: "ban-9", limit: 10 });

    await getServerBansRoute(
      request(),
      { params: Promise.resolve({ serverId: "server-1" }) },
      {
        enforceApiRateLimit: async () => undefined,
        jsonError,
        listWorkspaceServerBans: async (_actorId, _serverId, options) => {
          received = options;
          return page;
        },
        requireApiUserId: async () => "moderator-1",
      },
    );

    // Sayfa boyu istenmediyse servis kendi sabitine düşer; rota `NaN` göndermez.
    assert.deepEqual(received, {});
  });
});
