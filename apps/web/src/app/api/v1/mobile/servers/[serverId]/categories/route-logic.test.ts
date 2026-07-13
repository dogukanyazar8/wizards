import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/categories", {
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
    createCategory: async () => ({ id: "category-1" }),
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    ...overrides,
  };
}

describe("mobile server category collection route logic", () => {
  it("POST authenticates, rate limits, validates input, creates in the path server, and returns a strict reference", async () => {
    const { mobileServerCategoryCreateRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileServerCategoryCreateRoute(
      request({ name: "  General  " }),
      context({ serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        createCategory: async (userId: string, serverId: string, input: { name: string }) => {
          calls.push(`service:${userId}:${serverId}:${input.name}`);
          return { id: "category-1" };
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { category: { id: "category-1" } });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:categories:create",
      "params",
      "body",
      "service:user-1:server-1:General",
    ]);
  });

  it("rejects invalid or non-strict path params before body parsing and creation", async () => {
    const { mobileServerCategoryCreateRoute } = await routes;

    for (const params of [
      { serverId: "" },
      { serverId: "s".repeat(129) },
      { extra: "value", serverId: "server-1" },
    ]) {
      const calls: string[] = [];
      const response = await mobileServerCategoryCreateRoute(
        request({ name: "General" }),
        context(params, () => calls.push("params")),
        dependencies({
          authenticate: async () => {
            calls.push("auth");
            return "user-1";
          },
          createCategory: async () => {
            calls.push("service");
            return { id: "category-1" };
          },
          enforceRateLimit: async () => {
            calls.push("rate");
          },
          parseBody: async () => {
            calls.push("body");
            return { name: "General" };
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.deepEqual(calls, ["auth", "rate", "params"]);
    }
  });

  it("rejects invalid or non-strict bodies before the category service", async () => {
    const { mobileServerCategoryCreateRoute } = await routes;

    for (const body of [
      {},
      { name: "" },
      { name: "General", unexpected: true },
      { name: "g".repeat(49) },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerCategoryCreateRoute(
        request(body),
        context({ serverId: "server-1" }),
        dependencies({
          createCategory: async () => {
            serviceCalled = true;
            return { id: "category-1" };
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("validates the created category reference before responding", async () => {
    const { mobileServerCategoryCreateRoute } = await routes;
    const response = await mobileServerCategoryCreateRoute(
      request({ name: "General" }),
      context({ serverId: "server-1" }),
      dependencies({ createCategory: async () => ({ id: "" }) }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys((await response.json()) as Record<string, unknown>), ["error"]);
  });

  it("returns bounded rate-limit errors before params, bodies, and services", async () => {
    const { mobileServerCategoryCreateRoute } = await routes;
    let paramsRead = false;
    let laterDependencyCalled = false;
    const response = await mobileServerCategoryCreateRoute(
      request({ name: "General" }),
      context({ serverId: "server-1" }, () => {
        paramsRead = true;
      }),
      dependencies({
        createCategory: async () => {
          laterDependencyCalled = true;
          return { id: "category-1" };
        },
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
        parseBody: async () => {
          laterDependencyCalled = true;
          return { name: "General" };
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      code: "RATE_LIMITED",
      error: "Too many requests. Please try again shortly.",
    });
    assert.equal(paramsRead, false);
    assert.equal(laterDependencyCalled, false);
  });
});
