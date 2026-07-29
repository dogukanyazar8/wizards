import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import {
  listMobileReleases,
  type MobileReleaseServiceDependencies,
} from "@/lib/releases/release-service";

const routes = import("./route-logic");

type Row = {
  _count: { changes: number };
  codename: string | null;
  highlight: string | null;
  id: string;
  publishedAt: Date | null;
  releasedAt: Date;
  version: string;
};

function row(version: string, day: number, overrides: Partial<Row> = {}): Row {
  return {
    _count: { changes: 3 },
    codename: null,
    highlight: null,
    id: `release-${version}`,
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    releasedAt: new Date(Date.UTC(2026, 6, day)),
    version,
    ...overrides,
  };
}

/**
 * A table, not a stub: the point of this suite is that the keyset cursor and
 * the draft filter are correct, and a hand-written stub would simply return
 * whatever the assertion expected.
 */
function table(rows: Row[]): MobileReleaseServiceDependencies {
  const published = () => rows.filter((candidate) => candidate.publishedAt !== null);

  return {
    countReleases: async () => published().length,
    findLatestRelease: async () => null,
    findRelease: async () => null,
    findReleases: async (args) => {
      const where = args.where as
        | {
            OR?: Array<{ id?: { lt: string }; releasedAt?: Date | { lt: Date } }>;
          }
        | undefined;

      const sorted = published().sort(
        (left, right) =>
          right.releasedAt.getTime() - left.releasedAt.getTime() || right.id.localeCompare(left.id),
      );

      const afterCursor = where?.OR
        ? sorted.filter((candidate) =>
            where.OR!.some((clause) => {
              if (clause.releasedAt instanceof Date) {
                return (
                  candidate.releasedAt.getTime() === clause.releasedAt.getTime() &&
                  clause.id !== undefined &&
                  candidate.id < clause.id.lt
                );
              }
              const bound = clause.releasedAt as { lt: Date } | undefined;
              return bound ? candidate.releasedAt.getTime() < bound.lt.getTime() : false;
            }),
          )
        : sorted;

      return afterCursor.slice(0, args.take ?? afterCursor.length) as never;
    },
  };
}

function request(url = "https://whispr.test/api/v1/mobile/app/releases") {
  return new Request(url, { method: "GET" });
}

function dependencies(
  rows: Row[],
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileReleaseListRoute"]>[1] {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    listReleases: (input) => listMobileReleases(input, table(rows)),
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileReleaseListRoute"]>[1];
}

const catalogue = [
  row("0.8.15", 24, { codename: "Echo", highlight: "okunabilirlik", _count: { changes: 7 } }),
  row("0.8.14", 10),
  row("0.8.13", 3, { codename: "Ripple" }),
  row("0.9.0", 28, { publishedAt: null }),
];

describe("mobile release history route", () => {
  it("pages newest-first and hands back a cursor that resumes exactly where it stopped", async () => {
    const { mobileReleaseListRoute } = await routes;

    const first = await mobileReleaseListRoute(
      request("https://whispr.test/api/v1/mobile/app/releases?limit=2"),
      dependencies(catalogue),
    );
    const firstPage = (await first.json()) as {
      nextCursor: string | null;
      releases: Array<{ version: string }>;
    };

    assert.equal(first.status, 200);
    assert.deepEqual(
      firstPage.releases.map((release) => release.version),
      ["0.8.15", "0.8.14"],
    );
    assert.ok(firstPage.nextCursor);

    const second = await mobileReleaseListRoute(
      request(
        `https://whispr.test/api/v1/mobile/app/releases?limit=2&cursor=${encodeURIComponent(
          firstPage.nextCursor,
        )}`,
      ),
      dependencies(catalogue),
    );
    const secondPage = (await second.json()) as {
      nextCursor: string | null;
      releases: Array<{ version: string }>;
    };

    assert.deepEqual(
      secondPage.releases.map((release) => release.version),
      ["0.8.13"],
    );
    // The last page must say so, or 2b keeps asking for a page that is not there.
    assert.equal(secondPage.nextCursor, null);
  });

  it("refuses a limit above the page ceiling instead of quietly clamping it", async () => {
    const { mobileReleaseListRoute } = await routes;
    const response = await mobileReleaseListRoute(
      request("https://whispr.test/api/v1/mobile/app/releases?limit=51"),
      dependencies(catalogue),
    );

    assert.equal(response.status, 400);
  });

  it("keeps an unpublished version out of the history", async () => {
    const { mobileReleaseListRoute } = await routes;
    const response = await mobileReleaseListRoute(request(), dependencies(catalogue));
    const payload = (await response.json()) as { releases: Array<{ version: string }> };

    assert.equal(
      payload.releases.some((release) => release.version === "0.9.0"),
      false,
    );
  });

  it("counts every published release, not the page, so the 38 badge is right", async () => {
    const { mobileReleaseListRoute } = await routes;
    const response = await mobileReleaseListRoute(
      request("https://whispr.test/api/v1/mobile/app/releases?limit=1"),
      dependencies(catalogue),
    );
    const payload = (await response.json()) as {
      releases: unknown[];
      total: number;
    };

    assert.equal(payload.releases.length, 1);
    assert.equal(payload.total, 3);
  });

  it("marks the caller's own version so 2b can ring it", async () => {
    const { mobileReleaseListRoute } = await routes;
    const response = await mobileReleaseListRoute(
      request("https://whispr.test/api/v1/mobile/app/releases?installed=0.8.14"),
      dependencies(catalogue),
    );
    const payload = (await response.json()) as {
      releases: Array<{ installed?: boolean; version: string }>;
    };

    assert.deepEqual(
      payload.releases.filter((release) => release.installed).map((release) => release.version),
      ["0.8.14"],
    );
  });

  it("rate limits under its own action and requires a session", async () => {
    const { mobileReleaseListRoute } = await routes;
    const actions: string[] = [];

    const allowed = await mobileReleaseListRoute(
      request(),
      dependencies(catalogue, {
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(actions, ["mobile:app:releases"]);

    const unauthenticated = await mobileReleaseListRoute(
      request(),
      dependencies(catalogue, {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
