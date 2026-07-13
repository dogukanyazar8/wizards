import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

function request(method: "DELETE" | "PATCH", body?: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/categories/category-1", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method,
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
    deleteCategory: async () => ({ success: true as const }),
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    updateCategory: async () => ({ success: true as const }),
    ...overrides,
  };
}

describe("mobile server category entity route logic", () => {
  it("PATCH authenticates, rate limits, validates input, and updates within the path server", async () => {
    const { mobileServerCategoryUpdateRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileServerCategoryUpdateRoute(
      request("PATCH", { name: "  Renamed  " }),
      context({ categoryId: "category-1", serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
        updateCategory: async (
          userId: string,
          serverId: string,
          categoryId: string,
          input: { name: string },
        ) => {
          calls.push(`service:${userId}:${serverId}:${categoryId}:${input.name}`);
          return { success: true as const };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:categories:update",
      "params",
      "body",
      "service:user-1:server-1:category-1:Renamed",
    ]);
  });

  it("DELETE authenticates, rate limits, validates both path ids, and deletes within the path server", async () => {
    const { mobileServerCategoryDeleteRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerCategoryDeleteRoute(
      request("DELETE"),
      context({ categoryId: "category-1", serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        deleteCategory: async (userId: string, serverId: string, categoryId: string) => {
          calls.push(`service:${userId}:${serverId}:${categoryId}`);
          return { success: true as const };
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:categories:delete",
      "params",
      "service:user-1:server-1:category-1",
    ]);
  });

  it("rejects invalid or non-strict path params before body parsing and services", async () => {
    const { mobileServerCategoryDeleteRoute, mobileServerCategoryUpdateRoute } = await routes;

    for (const params of [
      { categoryId: "", serverId: "server-1" },
      { categoryId: "c".repeat(129), serverId: "server-1" },
      { categoryId: "category-1", serverId: "" },
      { categoryId: "category-1", extra: "value", serverId: "server-1" },
    ]) {
      for (const operation of [
        () =>
          mobileServerCategoryUpdateRoute(
            request("PATCH", { name: "Renamed" }),
            context(params),
            dependencies({
              parseBody: async () => {
                throw new Error("body must not be parsed");
              },
              updateCategory: async () => {
                throw new Error("update must not run");
              },
            }),
          ),
        () =>
          mobileServerCategoryDeleteRoute(
            request("DELETE"),
            context(params),
            dependencies({
              deleteCategory: async () => {
                throw new Error("delete must not run");
              },
            }),
          ),
      ]) {
        const response = await operation();
        assert.equal(response.status, 400);
      }
    }
  });

  it("rejects invalid or non-strict PATCH bodies before the update service", async () => {
    const { mobileServerCategoryUpdateRoute } = await routes;

    for (const body of [
      {},
      { name: "" },
      { name: "Renamed", unexpected: true },
      { name: "r".repeat(49) },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerCategoryUpdateRoute(
        request("PATCH", body),
        context({ categoryId: "category-1", serverId: "server-1" }),
        dependencies({
          updateCategory: async () => {
            serviceCalled = true;
            return { success: true as const };
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("maps the existing service's wrong-server not-found denial to a bounded response", async () => {
    const { mobileServerCategoryUpdateRoute } = await routes;
    const response = await mobileServerCategoryUpdateRoute(
      request("PATCH", { name: "Renamed" }),
      context({ categoryId: "category-from-another-server", serverId: "server-1" }),
      dependencies({
        updateCategory: async () => {
          throw new ApiError("Category not found", 404, "NOT_FOUND");
        },
      }),
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      code: "NOT_FOUND",
      error: "Category not found",
    });
  });

  it("validates service success results before responding", async () => {
    const { mobileServerCategoryDeleteRoute, mobileServerCategoryUpdateRoute } = await routes;
    const invalidResult = { success: false };

    const responses = await Promise.all([
      mobileServerCategoryUpdateRoute(
        request("PATCH", { name: "Renamed" }),
        context({ categoryId: "category-1", serverId: "server-1" }),
        dependencies({ updateCategory: async () => invalidResult }),
      ),
      mobileServerCategoryDeleteRoute(
        request("DELETE"),
        context({ categoryId: "category-1", serverId: "server-1" }),
        dependencies({ deleteCategory: async () => invalidResult }),
      ),
    ]);

    assert.deepEqual(
      responses.map((response) => response.status),
      [400, 400],
    );
  });

  it("returns bounded rate-limit errors before params, bodies, and services", async () => {
    const { mobileServerCategoryDeleteRoute, mobileServerCategoryUpdateRoute } = await routes;
    let paramsRead = false;
    let laterDependencyCalled = false;
    const deps = dependencies({
      deleteCategory: async () => {
        laterDependencyCalled = true;
        return { success: true as const };
      },
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
      },
      parseBody: async () => {
        laterDependencyCalled = true;
        return { name: "Renamed" };
      },
      updateCategory: async () => {
        laterDependencyCalled = true;
        return { success: true as const };
      },
    });
    const rateLimitedContext = context({ categoryId: "category-1", serverId: "server-1" }, () => {
      paramsRead = true;
    });

    const responses = await Promise.all([
      mobileServerCategoryUpdateRoute(
        request("PATCH", { name: "Renamed" }),
        rateLimitedContext,
        deps,
      ),
      mobileServerCategoryDeleteRoute(request("DELETE"), rateLimitedContext, deps),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), {
        code: "RATE_LIMITED",
        error: "Too many requests. Please try again shortly.",
      });
    }
    assert.equal(paramsRead, false);
    assert.equal(laterDependencyCalled, false);
  });
});
