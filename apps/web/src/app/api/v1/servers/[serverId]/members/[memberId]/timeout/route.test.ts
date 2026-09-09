import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { jsonError, parseJsonBody } from "@/lib/api";
import { patchMemberTimeoutRoute } from "./route-logic";

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/servers/server-1/members/member-1/timeout", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

const until = "2099-08-25T18:00:00.000Z";

describe("server member timeout API", () => {
  it("authenticates, rate limits, validates, then writes the column", async () => {
    const calls: string[] = [];
    const response = await patchMemberTimeoutRoute(
      request({ reason: "spam", until }),
      { params: Promise.resolve({ memberId: "member-1", serverId: "server-1" }) },
      {
        enforceApiRateLimit: async (userId, action) => {
          calls.push(`rate:${userId}:${action}`);
        },
        jsonError,
        parseJsonBody,
        requireApiUserId: async () => {
          calls.push("auth");
          return "moderator-1";
        },
        timeoutWorkspaceMember: async (actorId, serverId, memberId, input) => {
          calls.push(`timeout:${actorId}:${serverId}:${memberId}:${input.until}:${input.reason}`);
          return {
            communicationDisabledUntil: until,
            success: true as const,
            userId: "user-1",
          };
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "auth",
      "rate:moderator-1:member:timeout",
      `timeout:moderator-1:server-1:member-1:${until}:spam`,
    ]);
    assert.deepEqual(await response.json(), {
      communicationDisabledUntil: until,
      success: true,
    });
  });

  it("lifts the timeout through the same endpoint with a null date", async () => {
    let received: string | null | undefined;
    const response = await patchMemberTimeoutRoute(
      request({ until: null }),
      { params: Promise.resolve({ memberId: "member-1", serverId: "server-1" }) },
      {
        enforceApiRateLimit: async () => undefined,
        jsonError,
        parseJsonBody,
        requireApiUserId: async () => "moderator-1",
        timeoutWorkspaceMember: async (_actorId, _serverId, _memberId, input) => {
          received = input.until;
          return {
            communicationDisabledUntil: null,
            success: true as const,
            userId: "user-1",
          };
        },
      },
    );

    assert.equal(received, null);
    assert.deepEqual(await response.json(), {
      communicationDisabledUntil: null,
      success: true,
    });
  });

  it("refuses a body without a date, and a date that is not one, before mutation", async () => {
    for (const body of [{}, { until: "yarın" }, { reason: "r".repeat(201), until }]) {
      let mutated = false;
      const response = await patchMemberTimeoutRoute(
        request(body),
        { params: Promise.resolve({ memberId: "member-1", serverId: "server-1" }) },
        {
          enforceApiRateLimit: async () => undefined,
          jsonError,
          parseJsonBody,
          requireApiUserId: async () => "moderator-1",
          timeoutWorkspaceMember: async () => {
            mutated = true;
            return {
              communicationDisabledUntil: null,
              success: true as const,
              userId: "user-1",
            };
          },
        },
      );

      assert.equal(response.status, 400);
      assert.equal(mutated, false);
    }
  });
});
