import assert from "node:assert/strict";
import { it } from "node:test";
import { ApiError } from "@/lib/api";
import {
  releaseDetailRoute,
  releaseListRoute,
  type ReleaseRouteDependencies,
} from "@/app/api/v1/app/releases/route-logic";

function dependencies(overrides: Partial<ReleaseRouteDependencies> = {}): ReleaseRouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => {},
    listReleases: async () => ({ releases: [], total: 0, nextCursor: null }),
    getRelease: async () => null,
    ...overrides,
  };
}

it("authenticates web sessions before reading release history or detail", async () => {
  let reads = 0;
  const deps = dependencies({
    authenticate: async () => {
      throw new ApiError("Unauthorized", 401);
    },
    listReleases: async () => {
      reads++;
      return { releases: [], total: 0, nextCursor: null };
    },
    getRelease: async () => {
      reads++;
      return null;
    },
  });
  const request = new Request("https://whispr.test/api/v1/app/releases");
  assert.equal((await releaseListRoute(request, deps)).status, 401);
  assert.equal(
    (await releaseDetailRoute(request, { params: Promise.resolve({ version: "0.9.0" }) }, deps))
      .status,
    401,
  );
  assert.equal(reads, 0);
});

it("validates pagination and carries the installed version without caching personal results", async () => {
  let input: unknown;
  const limits: unknown[] = [];
  const response = await releaseListRoute(
    new Request("https://whispr.test/api/v1/app/releases?limit=10&installed=0.9.0&cursor=next"),
    dependencies({
      enforceRateLimit: async (...args) => {
        limits.push(args);
      },
      listReleases: async (query) => {
        input = query;
        return { releases: [], total: 0, nextCursor: null };
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(input, {
    scope: { product: "DESKTOP", channel: "STABLE" },
    limit: 10,
    installedVersion: "0.9.0",
    cursor: "next",
  });
  assert.deepEqual(limits, [["user-1", "app:releases"]]);
  const invalid = await releaseListRoute(
    new Request("https://whispr.test/api/v1/app/releases?limit=-1"),
    dependencies(),
  );
  assert.equal(invalid.status, 400);
});

it("returns 404 for unpublished or unknown versions and passes through published detail", async () => {
  const request = new Request("https://whispr.test/api/v1/app/releases/0.9.0?installed=0.9.0");
  const context = { params: Promise.resolve({ version: "0.9.0" }) };
  assert.equal((await releaseDetailRoute(request, context, dependencies())).status, 404);
  const release = {
    version: "0.9.0",
    codename: "Resonance",
    releasedAt: "2026-09-15T00:00:00.000Z",
    changeCount: 0,
    changes: [],
  };
  const response = await releaseDetailRoute(
    request,
    context,
    dependencies({
      getRelease: async (version, installed) => {
        assert.equal(version, installed);
        return release;
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), release);
});

it("stops at the rate limit without reading the database", async () => {
  const response = await releaseListRoute(
    new Request("https://whispr.test/api/v1/app/releases"),
    dependencies({
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests", 429);
      },
      listReleases: async () => {
        throw new Error("must not be reached");
      },
    }),
  );
  assert.equal(response.status, 429);
});
