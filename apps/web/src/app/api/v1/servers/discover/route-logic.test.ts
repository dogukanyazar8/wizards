import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServerDiscoveryPage } from "@wizards/types";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request(search = "") {
  return new Request(`https://whispr.test/api/v1/servers/discover${search}`);
}

function pageFixture(): ServerDiscoveryPage {
  return {
    nextCursor: null,
    servers: [
      {
        bannerUrl: null,
        description: "",
        iconUrl: null,
        id: "s1",
        memberCount: 12_400,
        name: "Whispr Topluluk",
        onlineCount: 1_200,
        shortName: "WT",
        type: "COMMUNITY",
        verified: true,
      },
    ],
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    enforceRateLimit: async () => undefined,
    listServers: async () => pageFixture(),
    resolveViewerId: async () => "viewer-1",
    ...overrides,
  };
}

describe("web server discover route logic", () => {
  it("resolves the viewer, rate limits by their id, and returns the page", async () => {
    const { serverDiscoverRoute } = await routes;
    const calls: string[] = [];

    const response = await serverDiscoverRoute(
      request(),
      dependencies({
        enforceRateLimit: async (key: string, action: string) => {
          calls.push(`rate:${key}:${action}`);
        },
        listServers: async () => {
          calls.push("list");
          return pageFixture();
        },
        resolveViewerId: async () => {
          calls.push("viewer");
          return "viewer-1";
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), pageFixture());
    assert.deepEqual(calls, ["viewer", "rate:viewer-1:server:discover", "list"]);
  });

  it("rate limits an anonymous caller by a hashed client identity, not a shared key", async () => {
    const { serverDiscoverRoute } = await routes;
    let observedKey: string | undefined;

    await serverDiscoverRoute(
      request(),
      dependencies({
        enforceRateLimit: async (key: string) => {
          observedKey = key;
        },
        resolveViewerId: async () => null,
      }),
    );

    assert.ok(
      observedKey?.startsWith("fallback:"),
      `expected a fallback identity, got ${observedKey}`,
    );
  });

  it("forwards cursor, limit, and query params to the service", async () => {
    const { serverDiscoverRoute } = await routes;
    let received: unknown;

    await serverDiscoverRoute(
      request("?cursor=100%7Cs5&limit=10&query=whispr"),
      dependencies({
        listServers: async (input: unknown) => {
          received = input;
          return pageFixture();
        },
      }),
    );

    assert.deepEqual(received, { cursor: "100|s5", limit: 10, query: "whispr" });
  });

  it("omits optional params entirely rather than passing them as undefined", async () => {
    const { serverDiscoverRoute } = await routes;
    let received: unknown;

    await serverDiscoverRoute(
      request(),
      dependencies({
        listServers: async (input: unknown) => {
          received = input;
          return pageFixture();
        },
      }),
    );

    assert.deepEqual(received, {});
  });

  it("rejects an out-of-range limit before the service runs", async () => {
    const { serverDiscoverRoute } = await routes;
    let serviceCalled = false;

    const response = await serverDiscoverRoute(
      request("?limit=999"),
      dependencies({
        listServers: async () => {
          serviceCalled = true;
          return pageFixture();
        },
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(serviceCalled, false);
  });

  it("stops at the rate limit before parsing query params", async () => {
    const { serverDiscoverRoute } = await routes;

    const response = await serverDiscoverRoute(
      request("?limit=999"),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
  });
});
