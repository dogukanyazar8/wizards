import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { API_RATE_LIMITS } from "@/lib/api-rate-limit";

import { discoverEventsRoute, type DiscoverEventsRouteDependencies } from "./route-logic";

function dependencies(
  overrides: Partial<DiscoverEventsRouteDependencies> = {},
): DiscoverEventsRouteDependencies {
  return {
    authenticate: async () => "viewer-1",
    enforceRateLimit: async () => undefined,
    listEvents: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}

function request(search = "") {
  return new Request(`https://whispr.test/api/v1/discover/events${search}`);
}

describe("GET /api/v1/discover/events", () => {
  it("uses the discover:events 120/minute budget", async () => {
    assert.deepEqual(API_RATE_LIMITS["discover:events"], { limit: 120, windowSeconds: 60 });
    const calls: unknown[] = [];
    const response = await discoverEventsRoute(
      request(),
      dependencies({
        enforceRateLimit: async (userId, action) => {
          calls.push([userId, action]);
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [["viewer-1", "discover:events"]]);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });

  it("validates and forwards q/cursor/scale limit without unrelated lane controls", async () => {
    const calls: unknown[] = [];
    const response = await discoverEventsRoute(
      request("?q=%20topluluk%20&cursor=e%7C123%7Ce1&sort=new&limit=36"),
      dependencies({
        listEvents: async (userId, input, context) => {
          calls.push([userId, input, context?.limit]);
          return { items: [], nextCursor: null };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [["viewer-1", { cursor: "e|123|e1", query: "topluluk" }, 36]]);
  });

  it("returns 401 before the service", async () => {
    let queried = false;
    const response = await discoverEventsRoute(
      request(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        listEvents: async () => {
          queried = true;
          return { items: [], nextCursor: null };
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(queried, false);
  });
});
