import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCohortTable,
  getCohortRetentionPercent,
  getIsoWeekStart,
} from "@/lib/admin/analytics/cohorts";
import {
  buildFunnel,
  getFunnelConversionPercent,
  type FunnelInput,
} from "@/lib/admin/analytics/funnel";

const funnelInput: FunnelInput = {
  emailVerifiedCount: 80,
  firstMessageCountByPlatform: { ALL: 40, MOBILE: 25, WEB: 15 },
  firstSessionCountByPlatform: { ALL: 60, MOBILE: 35, WEB: 25 },
  signupCount: 100,
};

describe("cohort table", () => {
  it("groups signups by the Monday of their week", () => {
    // 2026-07-27 is a Monday; 2026-07-26 is the Sunday before it.
    assert.equal(
      getIsoWeekStart(new Date("2026-07-27T23:00:00.000Z")).toISOString().slice(0, 10),
      "2026-07-27",
    );
    assert.equal(
      getIsoWeekStart(new Date("2026-07-26T01:00:00.000Z")).toISOString().slice(0, 10),
      "2026-07-20",
    );
  });

  it("matches a hand-counted retention set", () => {
    const users = [
      { createdAt: new Date("2026-06-01T10:00:00.000Z"), id: "u1" },
      { createdAt: new Date("2026-06-02T10:00:00.000Z"), id: "u2" },
      { createdAt: new Date("2026-06-03T10:00:00.000Z"), id: "u3" },
    ];
    const activity = [
      // u1 comes back on day 1 and day 7.
      { date: new Date("2026-06-02T09:00:00.000Z"), userId: "u1" },
      { date: new Date("2026-06-08T09:00:00.000Z"), userId: "u1" },
      // u2 only on day 30.
      { date: new Date("2026-07-02T09:00:00.000Z"), userId: "u2" },
      // u3 keeps using the app on the signup day only.
      { date: new Date("2026-06-03T18:00:00.000Z"), userId: "u3" },
    ];

    const rows = buildCohortTable(users, activity);

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      retainedDay1: 1,
      retainedDay7: 1,
      retainedDay30: 1,
      signups: 3,
      weekStart: "2026-06-01",
    });
  });

  it("splits two signup weeks into two rows in date order", () => {
    const rows = buildCohortTable(
      [
        { createdAt: new Date("2026-06-10T10:00:00.000Z"), id: "u2" },
        { createdAt: new Date("2026-06-01T10:00:00.000Z"), id: "u1" },
      ],
      [],
    );

    assert.deepEqual(
      rows.map((row) => row.weekStart),
      ["2026-06-01", "2026-06-08"],
    );
  });

  it("reports retention of an empty cohort as unknown rather than zero", () => {
    assert.equal(getCohortRetentionPercent(0, 0), null);
    assert.equal(getCohortRetentionPercent(1, 3), 33.3);
  });
});

describe("activation funnel", () => {
  it("keeps the first two steps at their totals under a platform filter", () => {
    const all = buildFunnel(funnelInput, "ALL");
    const mobile = buildFunnel(funnelInput, "MOBILE");

    assert.deepEqual(
      all.map((step) => step.count),
      [100, 80, 60, 40],
    );
    assert.deepEqual(
      mobile.map((step) => step.count),
      [100, 80, 35, 25],
    );
  });

  it("marks which steps a platform filter may narrow", () => {
    assert.deepEqual(
      buildFunnel(funnelInput).map((step) => ({
        splittable: step.platformSplittable,
        step: step.step,
      })),
      [
        { splittable: false, step: "signup" },
        { splittable: false, step: "email_verified" },
        { splittable: true, step: "first_session" },
        { splittable: true, step: "first_message" },
      ],
    );
  });

  it("counts UNKNOWN as its own platform instead of folding it into WEB", () => {
    const withUnknown = buildFunnel(
      {
        ...funnelInput,
        firstMessageCountByPlatform: { ALL: 40, UNKNOWN: 10, WEB: 15 },
        firstSessionCountByPlatform: { ALL: 60, UNKNOWN: 20, WEB: 25 },
      },
      "UNKNOWN",
    );

    assert.equal(withUnknown[2]?.count, 20);
    assert.equal(withUnknown[3]?.count, 10);
  });

  it("reports a step with no predecessor traffic as unmeasured", () => {
    const steps = buildFunnel(funnelInput);

    assert.equal(getFunnelConversionPercent(steps[0] as never, undefined), null);
    assert.equal(getFunnelConversionPercent(steps[1] as never, steps[0]), 80);
  });
});
