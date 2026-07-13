import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

const route = import("./route-logic");

function request() {
  return new Request("https://whispr.test/api/v1/mobile/channels/channel-1/history", {
    method: "DELETE",
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
    clearHistory: async () => ({
      channelId: "channel-1",
      clearedAt: new Date("2026-07-13T10:00:00.000Z"),
      deletedCount: 4,
      serverId: "server-1",
    }),
    emitUnreadUpdates: async () => undefined,
    enforceRateLimit: async () => undefined,
    getSocketServer: () => null,
    ...overrides,
  };
}

describe("mobile channel history route logic", () => {
  it("authenticates, rate limits, validates the path, clears, then emits unread and socket updates", async () => {
    const { mobileChannelHistoryDeleteRoute } = await route;
    const calls: string[] = [];

    const response = await mobileChannelHistoryDeleteRoute(
      request(),
      context({ channelId: " channel-1 " }, () => calls.push("params")),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "user-1";
        },
        clearHistory: async (userId: string, channelId: string) => {
          calls.push(`clear:${userId}:${channelId}`);
          return {
            channelId,
            clearedAt: new Date("2026-07-13T10:00:00.000Z"),
            deletedCount: 4,
            serverId: "server-1",
          };
        },
        emitUnreadUpdates: async (serverId: string) => {
          calls.push(`unread:${serverId}`);
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        getSocketServer: () => ({
          to(room: string) {
            calls.push(`socket:to:${room}`);
            return {
              emit(event: string, payload: { channelId: string }) {
                calls.push(`socket:emit:${event}:${payload.channelId}`);
              },
            };
          },
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deletedCount: 4 });
    assert.deepEqual(calls, [
      "auth",
      "rate:user-1:mobile:channel:history:clear",
      "params",
      "clear:user-1:channel-1",
      "unread:server-1",
      "socket:to:channel-1",
      "socket:emit:message:history_cleared:channel-1",
    ]);
  });

  it("rejects invalid and non-strict path params before service or side effects", async () => {
    const { mobileChannelHistoryDeleteRoute } = await route;

    for (const params of [
      { channelId: "" },
      { channelId: "c".repeat(129) },
      { channelId: "channel-1", extra: "value" },
    ]) {
      const calls: string[] = [];
      const response = await mobileChannelHistoryDeleteRoute(
        request(),
        context(params, () => calls.push("params")),
        dependencies({
          authenticate: async () => {
            calls.push("auth");
            return "user-1";
          },
          clearHistory: async () => {
            calls.push("clear");
            throw new Error("must not run");
          },
          emitUnreadUpdates: async () => {
            calls.push("unread");
          },
          enforceRateLimit: async () => {
            calls.push("rate");
          },
          getSocketServer: () => {
            calls.push("socket");
            return null;
          },
        }),
      );

      assert.equal(response.status, 400);
      assert.deepEqual(calls, ["auth", "rate", "params"]);
    }
  });

  it("does not emit unread or socket updates when clearing fails", async () => {
    const { mobileChannelHistoryDeleteRoute } = await route;
    const calls: string[] = [];

    const response = await mobileChannelHistoryDeleteRoute(
      request(),
      context({ channelId: "channel-1" }),
      dependencies({
        clearHistory: async () => {
          calls.push("clear");
          throw new ApiError("Missing permission", 403, "MISSING_PERMISSION");
        },
        emitUnreadUpdates: async () => {
          calls.push("unread");
        },
        getSocketServer: () => {
          calls.push("socket");
          return null;
        },
      }),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "MISSING_PERMISSION",
      error: "Missing permission",
    });
    assert.deepEqual(calls, ["clear"]);
  });

  it("awaits unread emission and does not emit the socket event when unread updates fail", async () => {
    const { mobileChannelHistoryDeleteRoute } = await route;
    const calls: string[] = [];

    const response = await mobileChannelHistoryDeleteRoute(
      request(),
      context({ channelId: "channel-1" }),
      dependencies({
        clearHistory: async () => {
          calls.push("clear");
          return {
            channelId: "channel-1",
            clearedAt: new Date("2026-07-13T10:00:00.000Z"),
            deletedCount: 2,
            serverId: "server-1",
          };
        },
        emitUnreadUpdates: async () => {
          calls.push("unread");
          throw new ApiError("Unread update unavailable", 503, "UNREAD_UPDATE_UNAVAILABLE");
        },
        getSocketServer: () => {
          calls.push("socket");
          return null;
        },
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      code: "UNREAD_UPDATE_UNAVAILABLE",
      error: "Unread update unavailable",
    });
    assert.deepEqual(calls, ["clear", "unread"]);
  });

  it("returns the validated response when no socket server is attached", async () => {
    const { mobileChannelHistoryDeleteRoute } = await route;
    let socketLookupCount = 0;

    const response = await mobileChannelHistoryDeleteRoute(
      request(),
      context({ channelId: "channel-1" }),
      dependencies({
        getSocketServer: () => {
          socketLookupCount += 1;
          return null;
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deletedCount: 4 });
    assert.equal(socketLookupCount, 1);
  });

  it("returns bounded rate-limit errors before reading params or clearing history", async () => {
    const { mobileChannelHistoryDeleteRoute } = await route;
    let paramsRead = false;
    let laterDependencyCalled = false;

    const response = await mobileChannelHistoryDeleteRoute(
      request(),
      context({ channelId: "channel-1" }, () => {
        paramsRead = true;
      }),
      dependencies({
        clearHistory: async () => {
          laterDependencyCalled = true;
          throw new Error("must not run");
        },
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
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
