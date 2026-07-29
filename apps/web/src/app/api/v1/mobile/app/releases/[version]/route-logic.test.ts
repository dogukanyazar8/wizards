import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  getMobileRelease,
  type MobileReleaseServiceDependencies,
} from "@/lib/releases/release-service";

const routes = import("./route-logic");

/**
 * Deliberately stored out of display order: 2a renders whatever sequence
 * arrives, so the grouping has to be the service's job and not the screen's.
 */
const storedChanges = [
  {
    detail: null,
    position: 1,
    title: "Sunucu sessize alma sıfırlanıyordu",
    type: "FIXED" as const,
  },
  { detail: null, position: 0, title: "Kanal listesi %30 daha hızlı", type: "IMPROVED" as const },
  {
    detail: "Görünüm ayarlarında dört kademe.",
    position: 1,
    title: "Sesli mesajlarda canlı dalga formu",
    type: "NEW" as const,
  },
  {
    detail: null,
    position: 0,
    title: "Thread yanıtları bildirim göndermiyordu",
    type: "FIXED" as const,
  },
  { detail: null, position: 0, title: "Mesaj yazı boyutu", type: "NEW" as const },
];

function releaseTable(found: boolean): MobileReleaseServiceDependencies {
  return {
    countReleases: async () => 0,
    findLatestRelease: async () => null,
    findRelease: async () =>
      found
        ? ({
            _count: { changes: storedChanges.length },
            buildNumber: 8150,
            changes: storedChanges,
            codename: "Echo",
            highlight: "okunabilirlik",
            id: "release-0.8.15",
            mandatory: false,
            releasedAt: new Date("2026-07-24T00:00:00.000Z"),
            sizeBytes: 49_099_571n,
            summary: "Okunabilirlik güncellemesi.",
            version: "0.8.15",
          } as never)
        : null,
    findReleases: async () => [],
  };
}

function request(url = "https://whispr.test/api/v1/mobile/app/releases/0.8.15") {
  return new Request(url, { method: "GET" });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

function dependencies(
  found: boolean,
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileReleaseDetailRoute"]>[2] {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    getRelease: (version: string, installed?: string) =>
      getMobileRelease(version, installed, releaseTable(found)),
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileReleaseDetailRoute"]>[2];
}

describe("mobile release detail route", () => {
  it("groups changes by type and orders them inside the group", async () => {
    const { mobileReleaseDetailRoute } = await routes;
    const response = await mobileReleaseDetailRoute(
      request(),
      context({ version: "0.8.15" }),
      dependencies(true),
    );
    const payload = (await response.json()) as {
      changes: Array<{ title: string; type: string }>;
    };

    assert.equal(response.status, 200);
    assert.deepEqual(
      payload.changes.map((change) => `${change.type}:${change.title}`),
      [
        "new:Mesaj yazı boyutu",
        "new:Sesli mesajlarda canlı dalga formu",
        "improved:Kanal listesi %30 daha hızlı",
        "fixed:Thread yanıtları bildirim göndermiyordu",
        "fixed:Sunucu sessize alma sıfırlanıyordu",
      ],
    );
  });

  it("sends the download size as a number the response can serialize", async () => {
    const { mobileReleaseDetailRoute } = await routes;
    const response = await mobileReleaseDetailRoute(
      request(),
      context({ version: "0.8.15" }),
      dependencies(true),
    );
    const payload = (await response.json()) as { buildNumber: number; sizeBytes: number };

    assert.equal(typeof payload.sizeBytes, "number");
    assert.equal(payload.sizeBytes, 49_099_571);
    assert.equal(payload.buildNumber, 8150);
  });

  it("answers 404 for a version that is unknown or still a draft", async () => {
    const { mobileReleaseDetailRoute } = await routes;
    const response = await mobileReleaseDetailRoute(
      request("https://whispr.test/api/v1/mobile/app/releases/9.9.9"),
      context({ version: "9.9.9" }),
      dependencies(false),
    );

    assert.equal(response.status, 404);
  });

  it("marks the row when the caller is running this very version", async () => {
    const { mobileReleaseDetailRoute } = await routes;
    const response = await mobileReleaseDetailRoute(
      request("https://whispr.test/api/v1/mobile/app/releases/0.8.15?installed=0.8.15"),
      context({ version: "0.8.15" }),
      dependencies(true),
    );
    const payload = (await response.json()) as { installed?: boolean };

    assert.equal(payload.installed, true);
  });

  it("requires a session and its own rate action", async () => {
    const { mobileReleaseDetailRoute } = await routes;
    const actions: string[] = [];

    const allowed = await mobileReleaseDetailRoute(
      request(),
      context({ version: "0.8.15" }),
      dependencies(true, {
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(actions, ["mobile:app:release-detail"]);

    const unauthenticated = await mobileReleaseDetailRoute(
      request(),
      context({ version: "0.8.15" }),
      dependencies(true, {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
