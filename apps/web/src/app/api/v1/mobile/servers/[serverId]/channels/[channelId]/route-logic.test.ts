import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

function request(method: "DELETE" | "PATCH", body?: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/servers/server-1/channels/channel-1", {
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
    deleteChannel: async () => undefined,
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    updateChannel: async () => undefined,
    ...overrides,
  };
}

describe("mobile server channel entity route logic", () => {
  it("PATCH validates strict input and binds the update to the server in the path", async () => {
    const { mobileServerChannelUpdateRoute } = await routes;
    const calls: string[] = [];
    const parseBody: typeof parseJsonBody = async (inputRequest, schema) => {
      calls.push("body");
      return parseJsonBody(inputRequest, schema);
    };

    const response = await mobileServerChannelUpdateRoute(
      request("PATCH", {
        categoryId: " category-2 ",
        locked: true,
        name: " staff ",
        topic: null,
      }),
      context({ channelId: "channel-1", serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody,
        updateChannel: async (
          userId: string,
          channelId: string,
          input: {
            categoryId?: string | null;
            locked?: boolean;
            name?: string;
            topic?: string | null;
          },
          options: { expectedServerId?: string },
        ) => {
          calls.push(
            `service:${userId}:${channelId}:${input.categoryId}:${input.locked}:${input.name}:${String(input.topic)}:${options.expectedServerId}`,
          );
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:channels:update",
      "params",
      "body",
      "service:user-1:channel-1:category-2:true:staff:null:server-1",
    ]);
  });

  it("DELETE binds the deletion to the server in the path without parsing a body", async () => {
    const { mobileServerChannelDeleteRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerChannelDeleteRoute(
      request("DELETE"),
      context({ channelId: "channel-1", serverId: "server-1" }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        deleteChannel: async (
          userId: string,
          channelId: string,
          options: { expectedServerId?: string },
        ) => {
          calls.push(`service:${userId}:${channelId}:${String(options.expectedServerId)}`);
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        parseBody: async () => {
          calls.push("body");
          return {};
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:server:channels:delete",
      "params",
      "service:user-1:channel-1:server-1",
    ]);
  });

  it("rejects invalid or non-strict path params before body parsing and services", async () => {
    const { mobileServerChannelDeleteRoute, mobileServerChannelUpdateRoute } = await routes;

    for (const params of [
      { channelId: "", serverId: "server-1" },
      { channelId: "channel-1", extra: "value", serverId: "server-1" },
      { channelId: "c".repeat(129), serverId: "server-1" },
      { channelId: "channel-1", serverId: "s".repeat(129) },
    ]) {
      const calls: string[] = [];
      const deps = dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        deleteChannel: async () => {
          calls.push("delete");
        },
        enforceRateLimit: async () => {
          calls.push("rate");
        },
        parseBody: async () => {
          calls.push("body");
          return { name: "staff" };
        },
        updateChannel: async () => {
          calls.push("update");
        },
      });

      const patchResponse = await mobileServerChannelUpdateRoute(
        request("PATCH", { name: "staff" }),
        context(params, () => calls.push("params")),
        deps,
      );
      assert.equal(patchResponse.status, 400);
      assert.deepEqual(calls, ["auth", "rate", "params"]);

      calls.length = 0;
      const deleteResponse = await mobileServerChannelDeleteRoute(
        request("DELETE"),
        context(params, () => calls.push("params")),
        deps,
      );
      assert.equal(deleteResponse.status, 400);
      assert.deepEqual(calls, ["auth", "rate", "params"]);
    }
  });

  it("rejects empty, forbidden, non-strict, or invalid PATCH bodies before update", async () => {
    const { mobileServerChannelUpdateRoute } = await routes;

    for (const body of [
      {},
      { permissions: {} },
      { name: "staff", unexpected: true },
      { categoryId: "c".repeat(129) },
      { name: "" },
      { locked: "yes" },
    ]) {
      let serviceCalled = false;
      const response = await mobileServerChannelUpdateRoute(
        request("PATCH", body),
        context({ channelId: "channel-1", serverId: "server-1" }),
        dependencies({
          updateChannel: async () => {
            serviceCalled = true;
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.equal(serviceCalled, false);
    }
  });

  it("preserves a wrong-server service rejection as a bounded 404", async () => {
    const { mobileServerChannelDeleteRoute, mobileServerChannelUpdateRoute } = await routes;
    const expectedOptions = { expectedServerId: "server-1" };
    const rejectWrongServer = async (
      _userId: string,
      _channelId: string,
      options: { expectedServerId?: string },
    ) => {
      assert.deepEqual(options, expectedOptions);
      throw new ApiError("Channel not found", 404);
    };
    const deps = dependencies({
      deleteChannel: rejectWrongServer,
      updateChannel: async (
        userId: string,
        channelId: string,
        _input: unknown,
        options: { expectedServerId?: string },
      ) => rejectWrongServer(userId, channelId, options),
    });

    for (const response of [
      await mobileServerChannelUpdateRoute(
        request("PATCH", { name: "staff" }),
        context({ channelId: "channel-1", serverId: "server-1" }),
        deps,
      ),
      await mobileServerChannelDeleteRoute(
        request("DELETE"),
        context({ channelId: "channel-1", serverId: "server-1" }),
        deps,
      ),
    ]) {
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "Channel not found" });
    }
  });

  it("returns rate-limit errors before params, body parsing, and services", async () => {
    const { mobileServerChannelDeleteRoute, mobileServerChannelUpdateRoute } = await routes;
    let paramsRead = false;
    let laterDependencyCalled = false;
    const deps = dependencies({
      deleteChannel: async () => {
        laterDependencyCalled = true;
      },
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
      },
      parseBody: async () => {
        laterDependencyCalled = true;
        return { name: "staff" };
      },
      updateChannel: async () => {
        laterDependencyCalled = true;
      },
    });

    const responses = await Promise.all([
      mobileServerChannelUpdateRoute(
        request("PATCH", { name: "staff" }),
        context({ channelId: "channel-1", serverId: "server-1" }, () => {
          paramsRead = true;
        }),
        deps,
      ),
      mobileServerChannelDeleteRoute(
        request("DELETE"),
        context({ channelId: "channel-1", serverId: "server-1" }, () => {
          paramsRead = true;
        }),
        deps,
      ),
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
