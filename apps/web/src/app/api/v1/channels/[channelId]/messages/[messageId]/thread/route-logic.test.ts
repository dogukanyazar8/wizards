import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PermissionBits } from "@/lib/workspace/permissions";
import { patchChannelThreadStateRoute, type ChannelThreadRouteDependencies } from "./route-logic";

const context = {
  params: Promise.resolve({ channelId: "channel-1", messageId: "parent-1" }),
};

function dependencies(
  calls: string[],
  overrides: Partial<ChannelThreadRouteDependencies> = {},
): ChannelThreadRouteDependencies {
  return {
    authenticate: async () => {
      calls.push("auth");
      return "user-1";
    },
    authorize: async () => {
      calls.push("authorize");
      return PermissionBits.VIEW_CHANNEL;
    },
    enforceRateLimit: async () => calls.push("rate"),
    setThreadClosed: async (input) => {
      calls.push(`write:${input.closed}`);
      return {
        closedAt: input.closed ? "2026-08-21T12:00:00.000Z" : null,
        closedById: input.closed ? input.userId : null,
        open: !input.closed,
      };
    },
    ...overrides,
  };
}

describe("channel thread state route", () => {
  it("authenticates, rate-limits and authorizes before closing", async () => {
    const calls: string[] = [];
    const response = await patchChannelThreadStateRoute(
      new Request("https://whispr.test/thread", {
        body: JSON.stringify({ open: false }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      context,
      dependencies(calls),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["auth", "rate", "authorize", "write:true"]);
    assert.deepEqual(await response.json(), {
      closedAt: "2026-08-21T12:00:00.000Z",
      closedById: "user-1",
      open: false,
    });
  });

  it("rejects a malformed body before authorization and write", async () => {
    const calls: string[] = [];
    const response = await patchChannelThreadStateRoute(
      new Request("https://whispr.test/thread", {
        body: JSON.stringify({ open: "no" }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
      context,
      dependencies(calls),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(calls, ["auth", "rate"]);
  });
});
