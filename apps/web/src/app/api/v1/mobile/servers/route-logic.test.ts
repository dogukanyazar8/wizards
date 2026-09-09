import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

function jsonRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    createServer: async () => ({ channelId: "channel-1", serverId: "server-1" }),
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    ...overrides,
  };
}

describe("mobile server create route logic", () => {
  it("authenticates, rate limits, parses, creates, and returns the strict response", async () => {
    const { mobileServerCreateRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (request, schema) => {
      calls.push("parse");
      return parseJsonBody(request, schema);
    };

    const response = await mobileServerCreateRoute(
      jsonRequest({ name: "  Guild  " }),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        createServer: async (
          userId: string,
          input: { iconUrl: string | null; name: string; shortName: string },
        ) => {
          calls.push(`service:${userId}:${input.name}:${input.shortName}:${String(input.iconUrl)}`);
          return { channelId: "channel-1", serverId: "server-1" };
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { server: { id: "server-1" } });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:create",
      "parse",
      "service:user-1:Guild:GUI:null",
    ]);
  });

  it("rejects iconUrl before the create service runs", async () => {
    let serviceCalled = false;
    const { mobileServerCreateRoute } = await routes;

    const response = await mobileServerCreateRoute(
      jsonRequest({ iconUrl: "https://cdn.whispr.test/icon.png", name: "Guild" }),
      dependencies({
        createServer: async () => {
          serviceCalled = true;
          return { channelId: "channel-1", serverId: "server-1" };
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(serviceCalled, false);
  });

  it("validates the service result with the response schema", async () => {
    const { mobileServerCreateRoute } = await routes;

    const response = await mobileServerCreateRoute(
      jsonRequest({ name: "Guild" }),
      dependencies({
        createServer: async () => ({ channelId: "channel-1", serverId: "" }),
      }),
    );

    assert.equal(response.status, 400);
  });

  it("maps authentication errors to a bounded shared error response", async () => {
    const { mobileServerCreateRoute } = await routes;

    const response = await mobileServerCreateRoute(
      jsonRequest({ name: "Guild" }),
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
