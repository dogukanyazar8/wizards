import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/channels", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function context(params: Record<string, string>, onRead: () => void = () => undefined) {
  return {
    get params() {
      onRead();
      return Promise.resolve(params);
    },
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "user-1",
    createChannel: async () => ({ id: "channel-1" }),
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    ...overrides,
  };
}

describe("mobile server channel collection route logic", () => {
  it("POST authenticates and rate limits before validating strict input and creating the channel", async () => {
    const { mobileServerChannelCreateRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileServerChannelCreateRoute(
      request({
        categoryId: " category-1 ",
        name: " general ",
        topic: " announcements ",
        type: "TEXT",
      }),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        createChannel: async (
          userId: string,
          serverId: string,
          input: {
            categoryId?: string | null;
            name: string;
            topic?: string;
            type: "TEXT" | "VOICE";
          },
        ) => {
          calls.push(
            `service:${userId}:${serverId}:${input.categoryId}:${input.name}:${input.topic}:${input.type}`,
          );
          return { id: "channel-1" };
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { channel: { id: "channel-1" } });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:channels:create",
      "params",
      "body",
      "service:user-1:server-1:category-1:general:announcements:TEXT",
    ]);
  });

  it("rejects invalid or non-strict server params before parsing the body or calling the service", async () => {
    const { mobileServerChannelCreateRoute } = await routes;

    for (const params of [
      { serverId: "" },
      { extra: "value", serverId: "server-1" },
      { serverId: "s".repeat(129) },
    ]) {
      const calls: string[] = [];
      const response = await mobileServerChannelCreateRoute(
        request({ name: "general", type: "TEXT" }),
        context(params, () => calls.push("params")),
        dependencies({
          authenticate: async () => {
            calls.push("auth");
            return "user-1";
          },
          createChannel: async () => {
            calls.push("service");
            return { id: "channel-1" };
          },
          enforceRateLimit: async () => {
            calls.push("rate");
          },
          parseBody: async () => {
            calls.push("body");
            return { name: "general", type: "TEXT" };
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.deepEqual(calls, ["auth", "rate", "params"]);
    }
  });

  it("rejects forbidden, non-strict, or invalid channel bodies before the create service", async () => {
    const { mobileServerChannelCreateRoute } = await routes;

    for (const body of [
      { name: "general", permissions: {}, type: "TEXT" },
      { name: "general", type: "TEXT", unexpected: true },
      { categoryId: "c".repeat(129), name: "general", type: "TEXT" },
      { name: "", type: "TEXT" },
      { name: "general", type: "INVALID" },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerChannelCreateRoute(
        request(body),
        context({ serverId: "server-1" }),
        dependencies({
          createChannel: async () => {
            serviceCalled = true;
            return { id: "channel-1" };
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("returns bounded auth and rate-limit errors before params, body parsing, and services", async () => {
    const { mobileServerChannelCreateRoute } = await routes;

    for (const failure of [
      {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        expected: { code: "UNAUTHORIZED", error: "Unauthorized" },
        status: 401,
      },
      {
        authenticate: async () => "user-1",
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
        expected: {
          code: "RATE_LIMITED",
          error: "Too many requests. Please try again shortly.",
        },
        status: 429,
      },
    ]) {
      let paramsRead = false;
      let laterDependencyCalled = false;
      const response = await mobileServerChannelCreateRoute(
        request({ name: "general", type: "TEXT" }),
        context({ serverId: "server-1" }, () => {
          paramsRead = true;
        }),
        dependencies({
          ...failure,
          createChannel: async () => {
            laterDependencyCalled = true;
            return { id: "channel-1" };
          },
          parseBody: async () => {
            laterDependencyCalled = true;
            return { name: "general", type: "TEXT" };
          },
        }),
      );

      assert.equal(response.status, failure.status);
      assert.deepEqual(await response.json(), failure.expected);
      assert.equal(paramsRead, false);
      assert.equal(laterDependencyCalled, false);
    }
  });

  it("validates the service result before returning a channel reference", async () => {
    const { mobileServerChannelCreateRoute } = await routes;
    const response = await mobileServerChannelCreateRoute(
      request({ name: "general", type: "TEXT" }),
      context({ serverId: "server-1" }),
      dependencies({ createChannel: async () => ({ id: "c".repeat(129) }) }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys((await response.json()) as Record<string, unknown>), ["error"]);
  });
});
