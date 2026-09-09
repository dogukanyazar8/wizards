import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import * as routeLogic from "./route-logic";

function request(search = "") {
  return new Request(`https://whispr.test/api/v1/discover/servers${search}`);
}

const server = {
  category: "oyun" as const,
  description: "Haftalık oyun geceleri.",
  featured: false,
  iconColor: "warning" as const,
  iconUrl: null,
  id: "server-1",
  initials: "OYU",
  joined: false,
  languages: ["tr"],
  memberCount: 48_200,
  name: "Oyun Kulübü Türkiye",
  onlineCount: 3_910,
  tags: ["oyun"],
};

function pageFixture(
  overrides: Partial<{
    categories: null | Array<{ count: number; initials: string; key: "all"; label: string }>;
    featured: typeof server | null;
  }> = {},
) {
  return {
    categories:
      overrides.categories === undefined
        ? [{ count: 1, initials: "TÜ", key: "all" as const, label: "" }]
        : overrides.categories,
    featured: overrides.featured === undefined ? null : overrides.featured,
    items: [server],
    nextCursor: null,
    totalCount: 1,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: async () => "viewer-1",
    enforceRateLimit: async () => undefined,
    listServers: async () => pageFixture(),
    ...overrides,
  };
}

describe("parse discover servers request", () => {
  it("uses endpoint defaults", () => {
    assert.deepEqual(routeLogic.parseDiscoverServersRequest(request()), {
      category: "all",
      limit: 24,
      sort: "popular",
    });
  });

  it("falls back for unknown category and sort and clamps limit", () => {
    assert.deepEqual(
      routeLogic.parseDiscoverServersRequest(request("?cat=uzay&sort=alfabetik&limit=999")),
      { category: "all", limit: 50, sort: "popular" },
    );
    assert.equal(routeLogic.parseDiscoverServersRequest(request("?limit=0")).limit, 1);
    assert.equal(routeLogic.parseDiscoverServersRequest(request("?limit=sayı")).limit, 24);
  });

  it("trims q and accepts only a valid category hint with q", () => {
    assert.deepEqual(
      routeLogic.parseDiscoverServersRequest(request("?q=%20dil%20&catHint=calisma")),
      { category: "all", categoryHint: "calisma", limit: 24, query: "dil", sort: "popular" },
    );
    assert.deepEqual(routeLogic.parseDiscoverServersRequest(request("?catHint=destek")), {
      category: "all",
      limit: 24,
      sort: "popular",
    });
  });
});

describe("discover servers route", () => {
  it("authenticates, rate limits in its own bucket, and forwards normalized input", async () => {
    const calls: string[] = [];
    let received: unknown;

    const response = await routeLogic.discoverServersRoute(
      request("?cat=oyun&sort=new&q=%20kulüp%20&catHint=oyun&limit=12"),
      dependencies({
        authenticate: async () => {
          calls.push("auth");
          return "viewer-1";
        },
        enforceRateLimit: async (userId: string, action: string) => {
          calls.push(`rate:${userId}:${action}`);
        },
        listServers: async (userId: string, input: unknown) => {
          calls.push(`list:${userId}`);
          received = input;
          return pageFixture();
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, ["auth", "rate:viewer-1:discover:servers", "list:viewer-1"]);
    assert.deepEqual(received, {
      category: "oyun",
      categoryHint: "oyun",
      limit: 12,
      query: "kulüp",
      sort: "new",
    });
  });

  it("accepts null categories and featured on cursor pages", async () => {
    const response = await routeLogic.discoverServersRoute(
      request("?cursor=p%7Cr%7C48200%7Cserver-1"),
      dependencies({ listServers: async () => pageFixture({ categories: null, featured: null }) }),
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.categories, null);
    assert.equal(body.featured, null);
  });

  it("keeps featured null for category and search requests", async () => {
    for (const search of ["?cat=oyun", "?q=oyun"]) {
      let input: unknown;
      const response = await routeLogic.discoverServersRoute(
        request(search),
        dependencies({
          listServers: async (_userId: string, received: unknown) => {
            input = received;
            return pageFixture({ featured: null });
          },
        }),
      );

      assert.equal(response.status, 200);
      assert.notEqual(input, undefined);
      assert.equal((await response.json()).featured, null);
    }
  });

  it("returns 429 with Retry-After when the rate limit is exhausted", async () => {
    const response = await routeLogic.discoverServersRoute(
      request(),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests. Please try again shortly.", 429, "RATE_LIMITED");
        },
      }),
    );

    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
  });

  it("returns 401 without a session", async () => {
    const response = await routeLogic.discoverServersRoute(
      request(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );

    assert.equal(response.status, 401);
  });

  it("returns 400 when q exceeds the shared 80-character contract", async () => {
    const response = await routeLogic.discoverServersRoute(
      request(`?q=${"a".repeat(81)}`),
      dependencies(),
    );

    assert.equal(response.status, 400);
  });
});
