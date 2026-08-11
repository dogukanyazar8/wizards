import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conversationNotifyRoute, conversationPinRoute } from "./participant-route-logic";

function buildDependencies(overrides = {}) {
  return {
    authenticate: async () => "user-1",
    emitNotifyChanged: () => {},
    emitPinChanged: () => {},
    enforceRateLimit: async () => {},
    getIo: () => ({}) as never,
    setNotifyLevel: async (_userId: string, _conversationId: string, notifyLevel: unknown) => ({
      notifyLevel: notifyLevel as "ALL" | "MENTIONS" | "NONE",
    }),
    setPin: async () => ({ pinnedAt: "2026-08-11T09:00:00.000Z" }),
    ...overrides,
  };
}

function request(body: unknown, url = "https://whispr.test/api/v1/dm/dm-1/notify") {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
}

describe("conversationNotifyRoute", () => {
  it("writes the tier and tells only the caller's own rooms", async () => {
    const calls: unknown[] = [];
    const response = await conversationNotifyRoute(
      request({ notifyLevel: "MENTIONS" }),
      "dm-1",
      buildDependencies({
        emitNotifyChanged: (_io: unknown, payload: unknown) => {
          calls.push({ emitted: payload });
        },
        setNotifyLevel: async (userId: string, conversationId: string, notifyLevel: unknown) => {
          calls.push({ conversationId, notifyLevel, userId });
          return { notifyLevel };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { notifyLevel: "MENTIONS" });
    assert.deepEqual(calls, [
      { conversationId: "dm-1", notifyLevel: "MENTIONS", userId: "user-1" },
      { emitted: { conversationId: "dm-1", notifyLevel: "MENTIONS", userId: "user-1" } },
    ]);
  });

  it("rejects a tier the design does not offer", async () => {
    const response = await conversationNotifyRoute(
      request({ notifyLevel: "SOMETIMES" }),
      "dm-1",
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("rejects an unknown key rather than ignoring it", async () => {
    const response = await conversationPinRoute(
      request({ muted: true, pinned: true }),
      "dm-1",
      buildDependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("surfaces the service's 403 when the caller is not a participant", async () => {
    const response = await conversationNotifyRoute(
      request({ notifyLevel: "NONE" }),
      "dm-1",
      buildDependencies({
        setNotifyLevel: async () => {
          const { ApiError } = await import("@/lib/api");
          throw new ApiError("You are not a participant in this conversation", 403, "FORBIDDEN");
        },
      }),
    );

    assert.equal(response.status, 403);
  });

  it("still answers when the socket server is not running", async () => {
    const response = await conversationNotifyRoute(
      request({ notifyLevel: "ALL" }),
      "dm-1",
      buildDependencies({ getIo: () => null }),
    );

    assert.equal(response.status, 200);
  });
});

describe("conversationPinRoute", () => {
  it("returns the stamped pin and announces it to the caller", async () => {
    const emitted: unknown[] = [];
    const response = await conversationPinRoute(
      request({ pinned: true }, "https://whispr.test/api/v1/dm/dm-1/pin"),
      "dm-1",
      buildDependencies({
        emitPinChanged: (_io: unknown, payload: unknown) => {
          emitted.push(payload);
        },
      }),
    );

    assert.deepEqual(await response.json(), { pinnedAt: "2026-08-11T09:00:00.000Z" });
    assert.deepEqual(emitted, [
      { conversationId: "dm-1", pinnedAt: "2026-08-11T09:00:00.000Z", userId: "user-1" },
    ]);
  });

  it("carries an unpin through as a null stamp", async () => {
    const response = await conversationPinRoute(
      request({ pinned: false }, "https://whispr.test/api/v1/dm/dm-1/pin"),
      "dm-1",
      buildDependencies({ setPin: async () => ({ pinnedAt: null }) }),
    );

    assert.deepEqual(await response.json(), { pinnedAt: null });
  });
});
