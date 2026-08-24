import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { API_RATE_LIMITS } from "@/lib/api-rate-limit";

import { discoverChannelsRoute, type DiscoverChannelsRouteDependencies } from "./route-logic";

function dependencies(
  overrides: Partial<DiscoverChannelsRouteDependencies> = {},
): DiscoverChannelsRouteDependencies {
  return {
    authenticate: async () => "u1",
    enforceRateLimit: async () => undefined,
    listChannels: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}

function request(search = "") {
  return new Request(`https://whispr.test/api/v1/discover/channels${search}`);
}

describe("GET /api/v1/discover/channels", () => {
  it("returns 401 before loading activity", async () => {
    let queried = false;
    const response = await discoverChannelsRoute(
      request(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        listChannels: async () => {
          queried = true;
          return { items: [], nextCursor: null };
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(queried, false);
  });

  it("uses its 120/minute browse budget and returns 429 unchanged", async () => {
    assert.deepEqual(API_RATE_LIMITS["discover:channels"], { limit: 120, windowSeconds: 60 });
    const response = await discoverChannelsRoute(
      request(),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
  });

  it("passes q/cursor and bounded scale limit while ignoring sort", async () => {
    const seen: unknown[] = [];
    const response = await discoverChannelsRoute(
      request("?q=%20%23tasar%C4%B1m%20&cursor=c%7C10%7Cc1&sort=not-a-sort&limit=48"),
      dependencies({
        listChannels: async (input, context) => {
          seen.push([input, context?.limit]);
          return { items: [], nextCursor: null };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(seen, [[{ cursor: "c|10|c1", query: "#tasarım" }, 48]]);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });

  it("returns an empty page when the rollup table is empty", async () => {
    const response = await discoverChannelsRoute(request(), dependencies());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], nextCursor: null });
  });
});
