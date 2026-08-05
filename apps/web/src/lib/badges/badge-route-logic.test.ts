import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  BADGE_CATALOG,
  BADGE_IDS,
  OwnBadgesResponseSchema,
  UserBadgesResponseSchema,
  type BadgeId,
  type BadgeProgress,
  type EarnedBadge,
} from "@wizards/types";

import { ApiError } from "@/lib/api";
import {
  handleReadOwnBadges,
  handleReadUserBadges,
  type BadgeRouteDependencies,
} from "@/lib/badges/badge-route-logic";

const EARNED: EarnedBadge[] = [
  { earnedAt: "2026-01-02T00:00:00.000Z", expiresAt: null, id: "staff", tier: 1 },
  { earnedAt: "2026-03-04T00:00:00.000Z", expiresAt: null, id: "inviter", tier: 2 },
];

type GateRow = { deletedAt: Date | null; isBanned: boolean } | null;

function dependencies(
  options: {
    badges?: EarnedBadge[];
    gate?: GateRow;
    progress?: BadgeProgress[];
  } = {},
): BadgeRouteDependencies {
  return {
    readOwnBadgeProgress: async () => options.progress ?? [],
    readUserBadges: async () => options.badges ?? [],
    readUserGate: async () =>
      options.gate === undefined ? { deletedAt: null, isBanned: false } : options.gate,
  };
}

describe("badge route logic", () => {
  it("answers a suspended or deleted account with an empty list, not a 404", async () => {
    for (const gate of [
      { deletedAt: null, isBanned: true },
      { deletedAt: new Date("2026-07-01T00:00:00.000Z"), isBanned: false },
    ]) {
      assert.deepEqual(
        await handleReadUserBadges({
          dependencies: dependencies({ badges: EARNED, gate }),
          requesterId: "viewer-1",
          userId: "user-1",
        }),
        { badges: [] },
      );
    }
  });

  it("raises a 404 for an account that does not exist", async () => {
    await assert.rejects(
      handleReadUserBadges({
        dependencies: dependencies({ gate: null }),
        requesterId: "viewer-1",
        userId: "missing",
      }),
      (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "USER_NOT_FOUND");
        return true;
      },
    );
  });

  it("returns a body the wire schema accepts", async () => {
    const response = await handleReadUserBadges({
      dependencies: dependencies({ badges: EARNED }),
      requesterId: "viewer-1",
      userId: "user-1",
    });

    assert.deepEqual(UserBadgesResponseSchema.parse(response), response);
    assert.deepEqual(response.badges, EARNED);
  });

  /**
   * The point of the single handler: the mobile route and the web route cannot
   * hand back different payloads, because there is only one payload.
   */
  it("gives the mobile and web calls byte-identical bodies", async () => {
    const shared = dependencies({ badges: EARNED });
    const mobileBody = await handleReadUserBadges({
      dependencies: shared,
      requesterId: "viewer-1",
      userId: "user-1",
    });
    const webBody = await handleReadUserBadges({
      dependencies: shared,
      requesterId: "viewer-1",
      userId: "user-1",
    });

    assert.equal(JSON.stringify(mobileBody), JSON.stringify(webBody));

    const mobileOwn = await handleReadOwnBadges({ dependencies: shared, userId: "user-1" });
    const webOwn = await handleReadOwnBadges({ dependencies: shared, userId: "user-1" });

    assert.equal(JSON.stringify(mobileOwn), JSON.stringify(webOwn));
  });

  it("keeps all four routes on the shared handler", () => {
    const routes = [
      ["mobile/users/[userId]/badges", "handleReadUserBadges"],
      ["users/[userId]/badges", "handleReadUserBadges"],
      ["mobile/account/badges", "handleReadOwnBadges"],
      ["users/me/badges", "handleReadOwnBadges"],
    ] as const;

    for (const [routePath, handler] of routes) {
      const source = readFileSync(
        fileURLToPath(new URL(`../../app/api/v1/${routePath}/route.ts`, import.meta.url)),
        "utf8",
      );

      assert.match(source, /export async function GET\(/, `${routePath} does not export GET`);
      assert.match(
        source,
        /from "@\/lib\/badges\/badge-route-logic"/,
        `${routePath} does not use the shared route logic`,
      );
      assert.match(source, new RegExp(`${handler}\\(`), `${routePath} calls the wrong handler`);
      assert.match(
        source,
        /enforceApiRateLimit\([^)]*"user:badges(?::self)?"\)/,
        `${routePath} does not enforce a badge rate limit`,
      );
    }
  });

  it("lists every awarded badge in own-progress, earned or not", async () => {
    const awarded = BADGE_IDS.filter((id) => BADGE_CATALOG[id].layer === "awarded");
    const response = await handleReadOwnBadges({
      dependencies: dependencies({
        badges: EARNED,
        progress: [{ id: "inviter", nextThreshold: 50, tier: 2, value: 12 }],
      }),
      userId: "user-1",
    });

    assert.deepEqual(OwnBadgesResponseSchema.parse(response), response);
    assert.deepEqual(
      response.progress.map((entry) => entry.id).sort(),
      [...awarded].sort(),
      "Rozetlerim would render a ladder with holes in it",
    );

    const counted = response.progress.find((entry) => entry.id === "inviter");
    assert.deepEqual(counted, { id: "inviter", nextThreshold: 50, tier: 2, value: 12 });

    // An untouched counter still reports the first rung it is climbing towards.
    for (const entry of response.progress) {
      if (entry.id === "inviter") {
        continue;
      }

      assert.equal(entry.tier, 0);
      assert.equal(entry.value, 0);
      assert.equal(entry.nextThreshold, BADGE_CATALOG[entry.id as BadgeId].thresholds[0]);
    }
  });

  it("returns the progress list in the one catalog order", async () => {
    const response = await handleReadOwnBadges({
      dependencies: dependencies(),
      userId: "user-1",
    });
    const priorities = response.progress.map((entry) => BADGE_CATALOG[entry.id].priority);

    assert.deepEqual(
      priorities,
      [...priorities].sort((left, right) => left - right),
    );
  });
});
