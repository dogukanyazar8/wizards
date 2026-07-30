import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { compareReleaseVersions } from "@/lib/releases/release-service";
import type { MobileAppUpdateQuery } from "@wizards/types";

const routes = import("./route-logic");

const latest = {
  codename: "Halo",
  mandatory: false,
  releasedAt: "2026-07-28T00:00:00.000Z",
  sizeBytes: 50_541_363,
  version: "0.9.0",
};

function request(url = "https://whispr.test/api/v1/mobile/app/update") {
  return new Request(url, { method: "GET" });
}

function dependencies(
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileAppUpdateRoute"]>[1] {
  return {
    authenticate: async () => "user-1",
    decideUpdate: async (query: MobileAppUpdateQuery) => {
      const isBehind =
        query.installed !== undefined &&
        compareReleaseVersions(query.installed, latest.version) < 0;
      return {
        otaEnabled: false,
        state: isBehind ? "available" : "current",
        updateKind: "none",
        ...(isBehind ? { latest } : {}),
      };
    },
    enforceRateLimit: async () => undefined,
    now: () => new Date("2026-07-29T09:00:00.000Z"),
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileAppUpdateRoute"]>[1];
}

describe("mobile app update route", () => {
  it("reports an available update and the version behind it", async () => {
    const { mobileAppUpdateRoute } = await routes;
    const response = await mobileAppUpdateRoute(
      request("https://whispr.test/api/v1/mobile/app/update?installed=0.8.15"),
      dependencies(),
    );
    const payload = (await response.json()) as {
      latest?: { version: string };
      state: string;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.state, "available");
    assert.equal(payload.latest?.version, "0.9.0");
  });

  it("reports current when the caller already runs the newest release", async () => {
    const { mobileAppUpdateRoute } = await routes;
    const response = await mobileAppUpdateRoute(
      request("https://whispr.test/api/v1/mobile/app/update?installed=0.9.0"),
      dependencies(),
    );
    const payload = (await response.json()) as { latest?: unknown; state: string };

    assert.equal(payload.state, "current");
    // Nothing to offer, so the card has nothing to render.
    assert.equal(payload.latest, undefined);
  });

  it("reports current when the installed build is ahead of the newest published one", async () => {
    const { mobileAppUpdateRoute } = await routes;
    const response = await mobileAppUpdateRoute(
      request("https://whispr.test/api/v1/mobile/app/update?installed=0.9.1"),
      dependencies(),
    );
    const payload = (await response.json()) as { state: string };

    // An internal build must not be told to "update" backwards.
    assert.equal(payload.state, "current");
  });

  it("orders versions by numeric segment rather than by string", () => {
    assert.equal(compareReleaseVersions("0.8.9", "0.8.10"), -1);
    assert.equal(compareReleaseVersions("0.9", "0.9.1"), -1);
    assert.equal(compareReleaseVersions("1.0.0", "0.9.9"), 1);
    assert.equal(compareReleaseVersions("0.8.15", "0.8.15"), 0);
  });

  it("reports current when nothing has been published on the channel", async () => {
    const { mobileAppUpdateRoute } = await routes;
    const response = await mobileAppUpdateRoute(
      request("https://whispr.test/api/v1/mobile/app/update?installed=0.8.15"),
      dependencies({
        decideUpdate: async () => ({
          otaEnabled: false,
          state: "current",
          updateKind: "none",
        }),
      }),
    );
    const payload = (await response.json()) as { state: string };

    assert.equal(payload.state, "current");
  });

  it("does not claim OTA that this deployment has not configured", async () => {
    const { mobileAppUpdateRoute } = await routes;
    const response = await mobileAppUpdateRoute(request(), dependencies());
    const payload = (await response.json()) as { otaEnabled: boolean };

    assert.equal(payload.otaEnabled, false);
  });

  it("passes the complete build identity to the decision boundary", async () => {
    const { mobileAppUpdateRoute } = await routes;
    const asked: string[] = [];
    await mobileAppUpdateRoute(
      request(
        "https://whispr.test/api/v1/mobile/app/update?channel=uat&installed=0.8.15&buildEnvironment=uat&platform=android&runtimeVersion=fingerprint-1&versionCode=815",
      ),
      dependencies({
        decideUpdate: async (query: MobileAppUpdateQuery) => {
          asked.push(JSON.stringify(query));
          return {
            androidArtifact: {
              sha256: "a".repeat(64),
              sizeBytes: 50_541_363,
              url: "https://updates.whispr.team/mobile/uat/releases/v0.9.0/whispr.apk",
              versionCode: 816,
            },
            latest,
            otaEnabled: false,
            state: "available",
            updateKind: "apk",
          };
        },
      }),
    );

    assert.deepEqual(asked, [
      JSON.stringify({
        buildEnvironment: "uat",
        channel: "uat",
        installed: "0.8.15",
        platform: "android",
        runtimeVersion: "fingerprint-1",
        versionCode: 815,
      }),
    ]);
  });

  it("rejects a channel that is not a release stream", async () => {
    const { mobileAppUpdateRoute } = await routes;
    const response = await mobileAppUpdateRoute(
      request("https://whispr.test/api/v1/mobile/app/update?channel=nightly"),
      dependencies(),
    );

    assert.equal(response.status, 400);
  });

  it("requires a session and its own rate action", async () => {
    const { mobileAppUpdateRoute } = await routes;
    const actions: string[] = [];

    const allowed = await mobileAppUpdateRoute(
      request(),
      dependencies({
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(actions, ["mobile:app:update"]);

    const unauthenticated = await mobileAppUpdateRoute(
      request(),
      dependencies({
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
