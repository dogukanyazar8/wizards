import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HandlerContext } from "../context";
import { registerPresenceHandlers } from "./presence";

function presenceHarness(presenceStatus = "ONLINE") {
  const handlers = new Map<string, (payload: unknown) => Promise<void>>();
  const socket = {
    data: { presenceStatus, userId: "user-1" },
    emit() {},
    on(event: string, handler: (payload: unknown) => Promise<void>) {
      handlers.set(event, handler);
      return socket;
    },
  };
  const ctx = {
    socket,
    userId: "user-1",
  } as unknown as HandlerContext;

  return { ctx, handlers };
}

describe("socket presence handlers", () => {
  it("does no work when presence activity repeats the current status", async () => {
    const { ctx, handlers } = presenceHarness("ONLINE");
    let sideEffects = 0;
    registerPresenceHandlers(ctx, {
      checkPresenceActivityAllowed: async () => {
        sideEffects += 1;
        return true;
      },
      getUserPresence: async () => {
        sideEffects += 1;
        return { customStatus: null, status: "ONLINE", userId: "user-1" };
      },
      initialize: async () => undefined,
    });

    await handlers.get("presence:activity")!({ status: "ONLINE" });

    assert.equal(sideEffects, 0);
  });

  it("stops before presence reads and writes when rate limited", async () => {
    const { ctx, handlers } = presenceHarness("IDLE");
    let rateChecks = 0;
    let presenceReads = 0;
    registerPresenceHandlers(ctx, {
      checkPresenceActivityAllowed: async () => {
        rateChecks += 1;
        return false;
      },
      getUserPresence: async () => {
        presenceReads += 1;
        return { customStatus: null, status: "IDLE", userId: "user-1" };
      },
      initialize: async () => undefined,
    });

    await handlers.get("presence:activity")!({ status: "ONLINE" });

    assert.equal(rateChecks, 1);
    assert.equal(presenceReads, 0);
  });
});
