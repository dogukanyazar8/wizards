import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mobileConversationNotifyRoute,
  mobileConversationPinRoute,
} from "./participant-route-logic";

function buildDependencies(overrides = {}) {
  return {
    authenticate: async () => "user-1",
    emitNotifyChanged: () => {},
    emitPinChanged: () => {},
    enforceRateLimit: async () => {},
    getIo: () => null,
    setNotifyLevel: async () => ({ notifyLevel: "NONE" as const }),
    setPin: async () => ({ pinnedAt: null }),
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/dm/dm-1/notify", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

describe("mobile participant routes", () => {
  it("bills the notify write to the mobile bucket", async () => {
    const actions: string[] = [];
    const response = await mobileConversationNotifyRoute(
      request({ notifyLevel: "NONE" }),
      "dm-1",
      buildDependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(actions, ["mobile:dm:mute"]);
  });

  it("bills the pin write to the mobile bucket", async () => {
    const actions: string[] = [];
    await mobileConversationPinRoute(
      request({ pinned: true }),
      "dm-1",
      buildDependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );

    assert.deepEqual(actions, ["mobile:dm:mute"]);
  });

  it("keeps the bearer identity the shell resolved rather than re-authenticating", async () => {
    // Overriding `authenticate` here would silently drop the mobile bearer the
    // caller already validated — the same trap the group mirror documents.
    let authenticated = 0;
    await mobileConversationNotifyRoute(
      request({ notifyLevel: "ALL" }),
      "dm-1",
      buildDependencies({
        authenticate: async () => {
          authenticated += 1;
          return "user-1";
        },
      }),
    );

    assert.equal(authenticated, 1);
  });

  it("still rejects a body the shared schema does not accept", async () => {
    const response = await mobileConversationNotifyRoute(
      request({ notifyLevel: "LOUD" }),
      "dm-1",
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });
});
