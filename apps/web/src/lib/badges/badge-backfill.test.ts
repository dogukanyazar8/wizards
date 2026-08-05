import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeLongestActiveStreak,
  parseBadgeBackfillArgs,
  planBadgeBackfill,
  recordBadgeDistribution,
  renderBadgeDistributionTable,
  type BadgeBackfillFacts,
  type BadgeDistribution,
} from "@/lib/badges/badge-backfill";

function facts(overrides: Partial<BadgeBackfillFacts> = {}): BadgeBackfillFacts {
  return {
    acceptedInvites: 0,
    activeDays: [],
    isBetaTester: false,
    largestOwnedServerMembers: 0,
    lastMessageDay: null,
    messageDays: 0,
    resolvedBugReports: 0,
    screenShareSeconds: 0,
    shippedIdeas: 0,
    userId: "user-1",
    voiceSeconds: 0,
    ...overrides,
  };
}

function days(...isoDates: string[]) {
  return isoDates.map((date) => new Date(`${date}T00:00:00.000Z`));
}

describe("badge backfill arguments", () => {
  it("defaults to a dry run over every backfillable badge", () => {
    assert.deepEqual(parseBadgeBackfillArgs([]), { badge: null, batchSize: 500, commit: false });
  });

  it("reads the three flags the script documents", () => {
    assert.deepEqual(parseBadgeBackfillArgs(["--commit", "--batch=50", "--badge=inviter"]), {
      badge: "inviter",
      batchSize: 50,
      commit: true,
    });
    assert.equal(parseBadgeBackfillArgs(["--commit", "--dry-run"]).commit, false);
  });

  it("refuses anything it cannot compute", () => {
    assert.throws(() => parseBadgeBackfillArgs(["--badge=nonsense"]), /Unknown badge id/);
    assert.throws(() => parseBadgeBackfillArgs(["--badge=veteran"]), /not computed/);
    assert.throws(() => parseBadgeBackfillArgs(["--batch=0"]), /Invalid --batch/);
    assert.throws(() => parseBadgeBackfillArgs(["--force"]), /Unknown argument/);
  });
});

describe("historical streak scan", () => {
  it("returns the longest run and the newest day", () => {
    assert.deepEqual(
      computeLongestActiveStreak(
        days("2026-01-01", "2026-01-02", "2026-01-03", "2026-01-10", "2026-01-11"),
      ),
      { current: 2, lastDay: new Date("2026-01-11T00:00:00.000Z"), longest: 3 },
    );
  });

  it("survives duplicates, disorder and an empty history", () => {
    assert.deepEqual(computeLongestActiveStreak(days("2026-01-02", "2026-01-01", "2026-01-02")), {
      current: 2,
      lastDay: new Date("2026-01-02T00:00:00.000Z"),
      longest: 2,
    });
    assert.deepEqual(computeLongestActiveStreak([]), { current: 0, lastDay: null, longest: 0 });
  });

  it("seeds the live streak from the newest run while preserving the best-ever tier", () => {
    const [entry] = planBadgeBackfill(
      facts({
        activeDays: days(
          "2026-01-01",
          "2026-01-02",
          "2026-01-03",
          "2026-01-04",
          "2026-01-05",
          "2026-01-06",
          "2026-01-07",
          "2026-01-10",
        ),
      }),
      "streak",
    );

    assert.deepEqual(entry, {
      badge: "streak",
      day: new Date("2026-01-10T00:00:00.000Z"),
      streakDays: 1,
      tier: 1,
      value: 7,
    });
  });
});

describe("badge backfill plan", () => {
  it("keeps only the badges the history actually earned", () => {
    const plan = planBadgeBackfill(
      facts({
        acceptedInvites: 12,
        activeDays: days("2026-01-01", "2026-01-02"),
        largestOwnedServerMembers: 30,
        messageDays: 5,
        voiceSeconds: 40_000,
      }),
    );

    assert.deepEqual(
      plan.map((entry) => [entry.badge, entry.tier]),
      [
        ["inviter", 2],
        ["founder", 1],
        ["voice", 1],
      ],
    );
  });

  it("narrows to one badge when asked", () => {
    const plan = planBadgeBackfill(facts({ acceptedInvites: 60, voiceSeconds: 40_000 }), "inviter");

    assert.deepEqual(
      plan.map((entry) => [entry.badge, entry.tier]),
      [["inviter", 3]],
    );
  });
});

describe("badge distribution report", () => {
  it("prints a row per earned tier and flags a saturated badge", () => {
    const distribution: BadgeDistribution = new Map();
    for (let index = 0; index < 7; index += 1) {
      recordBadgeDistribution(distribution, planBadgeBackfill(facts({ acceptedInvites: 1 })));
    }
    recordBadgeDistribution(distribution, planBadgeBackfill(facts({ voiceSeconds: 40_000 })));

    const table = renderBadgeDistributionTable(distribution, 10);

    assert.match(table, /inviter\s+1\s+7\s+70\.0%/);
    assert.match(table, /voice\s+1\s+1\s+10\.0%/);
    assert.match(table, /! inviter is on 70\.0% of accounts/);
    assert.match(table, /users scanned: 10/);
  });

  it("says so plainly when nothing would be awarded", () => {
    assert.match(renderBadgeDistributionTable(new Map(), 0), /no badge would be awarded/);
  });
});
