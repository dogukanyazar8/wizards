import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { API_RATE_LIMITS } from "@/lib/api-rate-limit";

import { discoverPeopleRoute, type DiscoverPeopleRouteDependencies } from "./route-logic";

function dependencies(
  overrides: Partial<DiscoverPeopleRouteDependencies> = {},
): DiscoverPeopleRouteDependencies {
  return {
    authenticate: async () => "u1",
    enforceRateLimit: async () => undefined,
    listPeople: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}

function request(search = "") {
  return new Request(`https://whispr.test/api/v1/discover/people${search}`);
}

describe("GET /api/v1/discover/people", () => {
  it("returns 401 before querying the suggestion pool", async () => {
    let queried = false;
    const response = await discoverPeopleRoute(
      request(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        listPeople: async () => {
          queried = true;
          return { items: [], nextCursor: null };
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(queried, false);
  });

  it("uses its 120/minute browse budget and returns 429 unchanged", async () => {
    assert.deepEqual(API_RATE_LIMITS["discover:people"], { limit: 120, windowSeconds: 60 });
    const response = await discoverPeopleRoute(
      request(),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
  });

  it("trims q and passes it to the bounded suggestion service", async () => {
    const seen: unknown[] = [];
    const response = await discoverPeopleRoute(
      request("?q=%20Ada%20&sort=new"),
      dependencies({
        listPeople: async (userId, query) => {
          seen.push({ query, userId });
          return { items: [], nextCursor: null };
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(seen, [{ query: { query: "Ada" }, userId: "u1" }]);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });

  it("rejects an overlong query before the service", async () => {
    const response = await discoverPeopleRoute(request(`?q=${"a".repeat(81)}`), dependencies());

    assert.equal(response.status, 400);
  });
});
