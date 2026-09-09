import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ServerDiscoveryPage } from "@wizards/types";

import { ApiError } from "@/lib/api";

const routes = import("./route-logic");

function request(search = "") {
  return new Request(`https://whispr.test/api/v1/mobile/servers/discover${search}`);
}

function pageFixture(): ServerDiscoveryPage {
  return {
    nextCursor: null,
    servers: [
      {
        bannerUrl: null,
        description: "",
        iconColor: null,
        iconUrl: null,
        id: "s1",
        memberCount: 12_400,
        name: "Whispr Topluluk",
        onlineCount: 1_200,
        shortName: "WT",
        tags: ["sohbet"],
        type: "COMMUNITY",
        verified: true,
      },
    ],
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: async () => "user-1",
    listServers: async () => pageFixture(),
    ...overrides,
  };
}

describe("mobile server discover route logic", () => {
  it("authorizes with the mobile:server:discover action and returns the page", async () => {
    const { mobileServerDiscoverRoute } = await routes;
    const calls: string[] = [];

    const response = await mobileServerDiscoverRoute(
      request(),
      dependencies({
        authorize: async (_request: Request, action: string) => {
          calls.push(`authorize:${action}`);
          return "user-1";
        },
        listServers: async () => {
          calls.push("list");
          return pageFixture();
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), pageFixture());
    assert.deepEqual(calls, ["authorize:mobile:server:discover", "list"]);
  });

  it("forwards cursor, limit, and query params to the service", async () => {
    const { mobileServerDiscoverRoute } = await routes;
    let received: unknown;

    await mobileServerDiscoverRoute(
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

  it("rejects an unauthenticated request before parsing query params", async () => {
    const { mobileServerDiscoverRoute } = await routes;
    let serviceCalled = false;

    const response = await mobileServerDiscoverRoute(
      request("?limit=999"),
      dependencies({
        authorize: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
        listServers: async () => {
          serviceCalled = true;
          return pageFixture();
        },
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(serviceCalled, false);
  });

  it("rejects an out-of-range limit before the service runs", async () => {
    const { mobileServerDiscoverRoute } = await routes;
    let serviceCalled = false;

    const response = await mobileServerDiscoverRoute(
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
});
