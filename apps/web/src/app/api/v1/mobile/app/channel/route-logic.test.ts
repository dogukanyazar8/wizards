import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";

const routes = import("./route-logic");

function request(body?: unknown) {
  return new Request("https://whispr.test/api/v1/mobile/app/channel", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function dependencies(
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileAppChannelRoute"]>[1] {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    setChannel: async () => undefined,
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileAppChannelRoute"]>[1];
}

describe("mobile release channel route", () => {
  it("saves the preference and says the switch only lands on the next build", async () => {
    const { mobileAppChannelRoute } = await routes;
    const written: unknown[] = [];
    const response = await mobileAppChannelRoute(
      request({ channel: "beta", consentAt: "2026-07-29T09:00:00.000Z" }),
      dependencies({
        setChannel: async (userId: string, channel: string) => {
          written.push([userId, channel]);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      channel: "beta",
      effectiveFrom: "next-build",
      requiresRestart: true,
    });
    assert.deepEqual(written, [["user-1", "beta"]]);
  });

  it("rejects a channel that is not a release stream", async () => {
    const { mobileAppChannelRoute } = await routes;
    let written = false;
    const response = await mobileAppChannelRoute(
      request({ channel: "canary" }),
      dependencies({
        setChannel: async () => {
          written = true;
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(written, false);
  });

  it("rejects a consent timestamp that is not a full instant", async () => {
    const { mobileAppChannelRoute } = await routes;
    const response = await mobileAppChannelRoute(
      request({ channel: "beta", consentAt: "2026-07-29" }),
      dependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("rate limits before it writes and requires a session", async () => {
    const { mobileAppChannelRoute } = await routes;
    let written = false;

    const limited = await mobileAppChannelRoute(
      request({ channel: "stable" }),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
        setChannel: async () => {
          written = true;
        },
      }),
    );
    assert.equal(limited.status, 429);
    assert.equal(written, false);

    const unauthenticated = await mobileAppChannelRoute(
      request({ channel: "stable" }),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
