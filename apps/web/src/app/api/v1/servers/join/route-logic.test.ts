import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import { ServerJoinByInviteResponseSchema } from "@/lib/home/types";

const routes = import("./route-logic");

function jsonRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/servers/join", {
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

describe("server join-by-invite route logic", () => {
  it("authenticates, rate limits, parses and joins — in that order", async () => {
    const { serverJoinByInviteRoute } = await routes;
    const calls: string[] = [];

    const response = await serverJoinByInviteRoute(
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
        parseBody: async (request: Request, schema: Parameters<typeof parseJsonBody>[1]) => {
          calls.push("parse");
          return parseJsonBody(request, schema);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:server:join",
      "parse",
      "service:user-1:INVITE_1",
    ]);
  });

  it("answers with the landing path the accepted row navigates to", async () => {
    const { serverJoinByInviteRoute } = await routes;

    const response = await serverJoinByInviteRoute(
      jsonRequest({ inviteCode: "INVITE_1" }),
      dependencies(),
    );

    assert.deepEqual(ServerJoinByInviteResponseSchema.parse(await response.json()), {
      alreadyMember: false,
      href: "/channels/server-1/channel-1",
      name: "Whispr",
      serverId: "server-1",
    });
  });

  it("falls back to the server root when the invite names no channel", async () => {
    const { serverJoinByInviteRoute } = await routes;

    const response = await serverJoinByInviteRoute(
      jsonRequest({ inviteCode: "INVITE_1" }),
      dependencies({
        joinServerByInvite: async () => ({
          alreadyMember: true,
          channelId: null,
          name: "Whispr",
          serverId: "server-1",
        }),
      }),
    );

    assert.deepEqual(await response.json(), {
      alreadyMember: true,
      href: "/channels/server-1",
      name: "Whispr",
      serverId: "server-1",
    });
  });

  it("rejects a malformed invite code before the join service runs", async () => {
    const { serverJoinByInviteRoute } = await routes;

    for (const body of [
      {},
      { inviteCode: "" },
      { inviteCode: "has space" },
      { inviteCode: "a".repeat(97) },
      { inviteCode: "INVITE_1", extra: true },
    ]) {
      let joined = false;
      const response = await serverJoinByInviteRoute(
        jsonRequest(body),
        dependencies({
          joinServerByInvite: async () => {
            joined = true;
            return {
              alreadyMember: false,
              channelId: null,
              name: "Whispr",
              serverId: "server-1",
            };
          },
        }),
      );

      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(joined, false, JSON.stringify(body));
    }
  });

  it("surfaces the invite service's own refusal instead of a generic failure", async () => {
    const { serverJoinByInviteRoute } = await routes;

    const response = await serverJoinByInviteRoute(
      jsonRequest({ inviteCode: "INVITE_1" }),
      dependencies({
        joinServerByInvite: async () => {
          throw new ApiError("This invite was sent to someone else", 403, "INVITE_NOT_FOR_USER");
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "INVITE_NOT_FOR_USER");
  });

  it("refuses an unauthenticated caller before spending the invite", async () => {
    const { serverJoinByInviteRoute } = await routes;
    let joined = false;

    const response = await serverJoinByInviteRoute(
      jsonRequest({ inviteCode: "INVITE_1" }),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401);
        },
        joinServerByInvite: async () => {
          joined = true;
          return {
            alreadyMember: false,
            channelId: null,
            name: "Whispr",
            serverId: "server-1",
          };
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(joined, false);
  });
});
