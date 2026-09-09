import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { jsonError, parseJsonBody } from "@/lib/api";
import { postBanMemberRoute } from "./route-logic";

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/servers/server-1/members/member-1/ban", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("server member ban API", () => {
  it("authenticates, rate limits, validates, then bans the selected member", async () => {
    const calls: string[] = [];
    const response = await postBanMemberRoute(
      request({ reason: "spam" }),
      { params: Promise.resolve({ memberId: "member-1", serverId: "server-1" }) },
      {
        banWorkspaceMember: async (actorId, serverId, memberId, input) => {
          calls.push(`ban:${actorId}:${serverId}:${memberId}:${input.reason}`);
          return { deletedMessageCount: 0, success: true, userId: "user-1" };
        },
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        jsonError,
        parseJsonBody,
        requireApiUserId: async () => {
          calls.push("auth");
          return "moderator-1";
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "auth",
      "rate:moderator-1:member:ban",
      "ban:moderator-1:server-1:member-1:spam",
    ]);
  });

  it("carries the delete window into the service and the count back to the caller", async () => {
    let received: number | undefined;
    const response = await postBanMemberRoute(
      request({ deleteMessageSeconds: 604_800, reason: "spam" }),
      { params: Promise.resolve({ memberId: "member-1", serverId: "server-1" }) },
      {
        banWorkspaceMember: async (_actorId, _serverId, _memberId, input) => {
          received = input.deleteMessageSeconds;
          return { deletedMessageCount: 12, success: true, userId: "user-1" };
        },
        enforceApiRateLimit: async () => undefined,
        jsonError,
        parseJsonBody,
        requireApiUserId: async () => "moderator-1",
      },
    );

    assert.equal(received, 604_800);
    assert.deepEqual(await response.json(), { deletedMessageCount: 12, success: true });
  });

  it("refuses a delete window wider than seven days before mutation", async () => {
    let mutated = false;
    const response = await postBanMemberRoute(
      request({ deleteMessageSeconds: 604_801 }),
      { params: Promise.resolve({ memberId: "member-1", serverId: "server-1" }) },
      {
        banWorkspaceMember: async () => {
          mutated = true;
          return { deletedMessageCount: 0, success: true, userId: "user-1" };
        },
        enforceApiRateLimit: async () => undefined,
        jsonError,
        parseJsonBody,
        requireApiUserId: async () => "moderator-1",
      },
    );

    assert.equal(response.status, 400);
    assert.equal(mutated, false);
  });

  it("rejects oversized reasons before mutation", async () => {
    let mutated = false;
    const response = await postBanMemberRoute(
      request({ reason: "x".repeat(201) }),
      { params: Promise.resolve({ memberId: "member-1", serverId: "server-1" }) },
      {
        banWorkspaceMember: async () => {
          mutated = true;
          return { deletedMessageCount: 0, success: true, userId: "user-1" };
        },
        enforceApiRateLimit: async () => undefined,
        jsonError,
        parseJsonBody,
        requireApiUserId: async () => "moderator-1",
      },
    );

    assert.equal(response.status, 400);
    assert.equal(mutated, false);
  });
});
