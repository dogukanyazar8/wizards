import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("web notification clear route", () => {
  it("uses the shared clear service after authentication and rate limiting", async () => {
    type Handler = (dependencies: {
      authenticate: () => Promise<string>;
      clearNotifications: (userId: string) => Promise<void>;
      enforceRateLimit: (userId: string, action: "notification:clear") => Promise<void>;
    }) => Promise<Response>;

    let handler: Handler | undefined;
    try {
      const routeModule = await import("./route-logic");
      handler = routeModule.notificationsClearRoute as Handler;
    } catch {
      // RED: route logic does not exist until the direct Prisma delete is removed.
    }

    assert.equal(typeof handler, "function");
    const calls: string[] = [];
    const response = await handler!({
      authenticate: async () => {
        calls.push("authenticate");
        return "user-1";
      },
      clearNotifications: async (userId) => {
        calls.push(`clear:${userId}`);
      },
      enforceRateLimit: async (userId, action) => {
        calls.push(`rate:${userId}:${action}`);
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["authenticate", "rate:user-1:notification:clear", "clear:user-1"]);
  });
});
