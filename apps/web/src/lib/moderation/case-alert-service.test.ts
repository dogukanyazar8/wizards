import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  alertModerationCase,
  buildModerationAlertDedupeKey,
  isModerationCaseAlertable,
  sweepModerationCaseAlerts,
  type ModerationAlertCase,
  type ModerationCaseAlertDependencies,
} from "./case-alert-service";

const now = new Date("2026-07-27T10:00:00.000Z");

function makeCase(overrides: Partial<ModerationAlertCase> = {}): ModerationAlertCase {
  return {
    id: "case-1",
    openedAt: new Date("2026-07-27T09:30:00.000Z"),
    priority: "URGENT",
    publicNumber: 42,
    status: "OPEN",
    subjectHandle: "spammer",
    ...overrides,
  };
}

function createHarness(
  overrides: Partial<ModerationCaseAlertDependencies> = {},
  adminUserIds = ["admin-1", "admin-2"],
) {
  const created: { dedupeKey: string; userId: string }[] = [];
  const pushed: string[][] = [];
  // The real table declares `@@unique([dedupeKey])` across every row, not per
  // user, so the fake enforces the same global rule — that is exactly the trap a
  // case-and-day-only key falls into.
  const usedDedupeKeys = new Set<string>();

  const dependencies: ModerationCaseAlertDependencies = {
    createNotifications: async (rows) => {
      const accepted = rows.filter((row) => !usedDedupeKeys.has(row.dedupeKey));
      for (const row of accepted) {
        usedDedupeKeys.add(row.dedupeKey);
        created.push({ dedupeKey: row.dedupeKey, userId: row.userId });
      }

      return accepted.map((row, index) => ({
        actionUrl: row.actionUrl,
        body: row.body,
        id: `notification-${created.length - accepted.length + index + 1}`,
        title: row.title,
        type: "MODERATION",
        userId: row.userId,
      }));
    },
    listAlertAdminUserIds: async () => adminUserIds,
    listAlertableCases: async () => [makeCase()],
    sendPush: async (rows) => {
      pushed.push(rows.map((row) => row.userId));
    },
    ...overrides,
  };

  return { created, dependencies, pushed };
}

describe("moderation case alert dedupe key", () => {
  /**
   * `Notification.dedupeKey` is unique across the whole table. A key built from
   * the case and the day alone would let the first admin's row win and silently
   * drop every other admin's — the alert would reach one phone out of five.
   */
  it("is unique per recipient and per UTC day", () => {
    assert.equal(
      buildModerationAlertDedupeKey("case-1", "admin-1", now),
      "modcase:case-1:alert:admin-1:20260727",
    );
    assert.notEqual(
      buildModerationAlertDedupeKey("case-1", "admin-1", now),
      buildModerationAlertDedupeKey("case-1", "admin-2", now),
    );
    // 23:30 UTC and 00:30 UTC are different days, so the alert can repeat.
    assert.notEqual(
      buildModerationAlertDedupeKey("case-1", "admin-1", new Date("2026-07-27T23:30:00.000Z")),
      buildModerationAlertDedupeKey("case-1", "admin-1", new Date("2026-07-28T00:30:00.000Z")),
    );
  });
});

describe("moderation case alert eligibility", () => {
  it("alerts on urgency now and on an open case only after a day", () => {
    assert.equal(isModerationCaseAlertable(makeCase({ priority: "URGENT" }), now), true);
    assert.equal(isModerationCaseAlertable(makeCase({ priority: "NORMAL" }), now), false);
    assert.equal(
      isModerationCaseAlertable(
        makeCase({ openedAt: new Date("2026-07-26T09:00:00.000Z"), priority: "NORMAL" }),
        now,
      ),
      true,
    );
    // A resolved case is never loud, however old it is.
    assert.equal(
      isModerationCaseAlertable(
        makeCase({
          openedAt: new Date("2026-07-20T09:00:00.000Z"),
          priority: "URGENT",
          status: "DISMISSED",
        }),
        now,
      ),
      false,
    );
  });
});

describe("alertModerationCase", () => {
  it("reaches every admin once and pushes the same rows", async () => {
    const harness = createHarness();

    const result = await alertModerationCase(
      { moderationCase: makeCase(), now },
      harness.dependencies,
    );

    assert.equal(result.notified, 2);
    assert.deepEqual(
      harness.created.map((row) => row.userId),
      ["admin-1", "admin-2"],
    );
    assert.deepEqual(harness.created.map((row) => row.dedupeKey).sort(), [
      "modcase:case-1:alert:admin-1:20260727",
      "modcase:case-1:alert:admin-2:20260727",
    ]);
    assert.deepEqual(harness.pushed, [["admin-1", "admin-2"]]);
  });

  it("stays quiet on the second run of the same day and speaks again the next", async () => {
    const harness = createHarness();

    await alertModerationCase({ moderationCase: makeCase(), now }, harness.dependencies);
    const second = await alertModerationCase(
      { moderationCase: makeCase(), now },
      harness.dependencies,
    );

    assert.equal(second.notified, 0);
    assert.equal(harness.created.length, 2);
    // No recipients, no push call at all.
    assert.equal(harness.pushed.length, 1);

    const nextDay = await alertModerationCase(
      { moderationCase: makeCase(), now: new Date("2026-07-28T10:00:00.000Z") },
      harness.dependencies,
    );

    assert.equal(nextDay.notified, 2);
  });

  it("does not alert on a case that is neither urgent nor stale", async () => {
    const harness = createHarness();

    const result = await alertModerationCase(
      { moderationCase: makeCase({ priority: "NORMAL" }), now },
      harness.dependencies,
    );

    assert.equal(result.notified, 0);
    assert.equal(harness.created.length, 0);
  });

  it("skips the write entirely when nobody holds the capability", async () => {
    const harness = createHarness({}, []);

    const result = await alertModerationCase(
      { moderationCase: makeCase(), now },
      harness.dependencies,
    );

    assert.equal(result.notified, 0);
    assert.equal(harness.pushed.length, 0);
  });
});

describe("sweepModerationCaseAlerts", () => {
  it("alerts every queued case the sweep finds", async () => {
    const harness = createHarness({
      listAlertableCases: async () => [
        makeCase({ id: "case-1" }),
        makeCase({ id: "case-2", openedAt: new Date("2026-07-25T09:00:00.000Z"), priority: "LOW" }),
      ],
    });

    const result = await sweepModerationCaseAlerts({ now }, harness.dependencies);

    assert.equal(result.alertedCases, 2);
    assert.equal(result.notified, 4);
    assert.deepEqual(harness.created.map((row) => row.dedupeKey).sort(), [
      "modcase:case-1:alert:admin-1:20260727",
      "modcase:case-1:alert:admin-2:20260727",
      "modcase:case-2:alert:admin-1:20260727",
      "modcase:case-2:alert:admin-2:20260727",
    ]);
  });

  it("resolves the recipient list once for the whole sweep", async () => {
    let recipientLookups = 0;
    const harness = createHarness({
      listAlertAdminUserIds: async () => {
        recipientLookups += 1;
        return ["admin-1"];
      },
      listAlertableCases: async () => [makeCase({ id: "case-1" }), makeCase({ id: "case-2" })],
    });

    await sweepModerationCaseAlerts({ now }, harness.dependencies);

    assert.equal(recipientLookups, 1);
  });
});
