import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

function jsonRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers/join", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    joinServerByInvite: async () => ({
      alreadyMember: false,
      channelId: "channel-1",
      name: "Whispr",
      serverId: "server-1",
    }),
    parseBody: parseJsonBody,
    ...overrides,
  };
}

describe("mobile server join route logic", () => {
  it("authenticates, rate limits, parses, joins, and returns the strict response", async () => {
    const { mobileServerJoinRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (request, schema) => {
      calls.push("parse");
      return parseJsonBody(request, schema);
    };

    const response = await mobileServerJoinRoute(
      jsonRequest({ inviteCode: "  INVITE_1  " }),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        joinServerByInvite: async (userId: string, inviteCode: string) => {
          calls.push(`service:${userId}:${inviteCode}`);
          return {
            alreadyMember: false,
            channelId: "channel-1",
            name: "Whispr",
            serverId: "server-1",
          };
        },
        parseBody,
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { server: { id: "server-1" } });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:join",
      "parse",
      "service:user-1:INVITE_1",
    ]);
  });

  it("rejects malformed or non-strict invite bodies before the join service runs", async () => {
    const { mobileServerJoinRoute } = await routes;

    for (const body of [
      { inviteCode: "bad code" },
      { inviteCode: "INVITE_1", serverId: "server-1" },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerJoinRoute(
        jsonRequest(body),
        dependencies({
          joinServerByInvite: async () => {
            serviceCalled = true;
            return {
              alreadyMember: false,
              channelId: "channel-1",
              name: "Whispr",
              serverId: "server-1",
            };
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("validates the service result with the response schema", async () => {
    const { mobileServerJoinRoute } = await routes;

    const response = await mobileServerJoinRoute(
      jsonRequest({ inviteCode: "INVITE_1" }),
      dependencies({
        joinServerByInvite: async () => ({
          alreadyMember: false,
          channelId: "channel-1",
          name: "Whispr",
          serverId: "",
        }),
      }),
    );

    assert.equal(response.status, 400);
  });

  it("maps authentication errors to a bounded shared error response", async () => {
    const { mobileServerJoinRoute } = await routes;

    const response = await mobileServerJoinRoute(
      jsonRequest({ inviteCode: "INVITE_1" }),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { code: "UNAUTHORIZED", error: "Unauthorized" });
  });
});
