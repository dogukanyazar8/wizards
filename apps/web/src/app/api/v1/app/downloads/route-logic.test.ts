import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

const catalog = {
  desktop: { artifacts: [], buildLabel: null, releasedAt: null, versionLabel: null },
  mobile: { artifacts: [], buildLabel: null, releasedAt: null, versionLabel: null },
};

const payload = {
  catalogs: {
    prod: { ...catalog, environment: "prod" as const },
    uat: { ...catalog, environment: "uat" as const },
  },
  defaultEnvironment: "prod" as const,
};

function request() {
  return new Request("https://whispr.test/api/v1/app/downloads");
}

type RouteDependencies = Parameters<Awaited<typeof routes>["appDownloadsRoute"]>[1];

function dependencies(overrides: Partial<RouteDependencies> = {}): RouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    readCatalog: async () => payload,
    ...overrides,
  } as RouteDependencies;
}

describe("app downloads route", () => {
  it("answers with both environment catalogs and the default selection", async () => {
    const { appDownloadsRoute } = await routes;
    const response = await appDownloadsRoute(request(), dependencies());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), payload);
  });

  it("keeps the catalog private to the session but cacheable for a minute", async () => {
    const { appDownloadsRoute } = await routes;
    const response = await appDownloadsRoute(request(), dependencies());

    assert.equal(response.headers.get("Cache-Control"), "private, max-age=60");
  });

  it("requires a session before it reads anything", async () => {
    const { appDownloadsRoute } = await routes;
    let read = 0;

    const response = await appDownloadsRoute(
      request(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401);
        },
        readCatalog: async () => {
          read += 1;
          return payload;
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(read, 0);
  });

  it("rate limits on its own budget before it reads", async () => {
    const { appDownloadsRoute } = await routes;
    const actions: string[] = [];
    let read = 0;

    await appDownloadsRoute(
      request(),
      dependencies({
        enforceRateLimit: async (_userId, action) => {
          actions.push(action);
        },
      }),
    );
    assert.deepEqual(actions, ["app:downloads"]);

    const limited = await appDownloadsRoute(
      request(),
      dependencies({
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
        readCatalog: async () => {
          read += 1;
          return payload;
        },
      }),
    );

    assert.equal(limited.status, 429);
    assert.equal(read, 0);
  });
});
