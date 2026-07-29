import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_PERFORMANCE_REGRESSION_TOLERANCE,
  evaluateMobilePerformanceBudgets,
  type MobilePerformanceBudget,
} from "../src/release/mobile-performance-budget";

const budgets: MobilePerformanceBudget[] = [
  { label: "Cold authenticated launch", maxMs: 2_500, metric: "startup" },
  { label: "Cached chat tap to content", maxMs: 100, metric: "chat-open-cached" },
];

describe("evaluateMobilePerformanceBudgets", () => {
  // The budgets used to be prose in a checklist. Prose does not fail a build.
  it("passes when every measured p95 sits inside its budget", () => {
    const result = evaluateMobilePerformanceBudgets({
      budgets,
      measurements: [
        { metric: "startup", p95Ms: 2_100 },
        { metric: "chat-open-cached", p95Ms: 80 },
      ],
    });

    assert.deepEqual(result.violations, []);
    assert.equal(result.status, "pass");
  });

  it("fails the metric that is over budget and says by how much", () => {
    const result = evaluateMobilePerformanceBudgets({
      budgets,
      measurements: [{ metric: "startup", p95Ms: 3_000 }],
    });

    assert.equal(result.status, "fail");
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0] ?? "", /startup/);
    assert.match(result.violations[0] ?? "", /3000/);
    assert.match(result.violations[0] ?? "", /2500/);
  });

  it("fails a regression against the baseline even when the budget still holds", () => {
    const result = evaluateMobilePerformanceBudgets({
      baseline: [{ metric: "startup", p95Ms: 1_000 }],
      budgets,
      measurements: [{ metric: "startup", p95Ms: 1_200 }],
    });

    assert.equal(result.status, "fail");
    assert.match(result.violations[0] ?? "", /baseline/);
  });

  it("accepts movement inside the regression tolerance", () => {
    const withinTolerance = Math.round(1_000 * (1 + MOBILE_PERFORMANCE_REGRESSION_TOLERANCE));
    const result = evaluateMobilePerformanceBudgets({
      baseline: [{ metric: "startup", p95Ms: 1_000 }],
      budgets,
      measurements: [{ metric: "startup", p95Ms: withinTolerance }],
    });

    assert.deepEqual(result.violations, []);
  });

  /**
   * An unmeasured release is not a passing release, but it must not read as a
   * regression either: local runs have no device numbers, and the CI job that
   * promotes a build is the one that demands them.
   */
  it("reports missing metrics as unmeasured rather than as violations", () => {
    const result = evaluateMobilePerformanceBudgets({ budgets, measurements: [] });

    assert.equal(result.status, "unmeasured");
    assert.deepEqual(result.unmeasured, ["startup", "chat-open-cached"]);
    assert.deepEqual(result.violations, []);
  });

  it("treats an unmeasured metric as a failure when measurements are required", () => {
    const result = evaluateMobilePerformanceBudgets({
      budgets,
      measurements: [{ metric: "startup", p95Ms: 100 }],
      requireMeasurements: true,
    });

    assert.equal(result.status, "fail");
    assert.match(result.violations[0] ?? "", /chat-open-cached/);
  });
});
