/**
 * The performance budgets, as numbers a build can fail on.
 *
 * They used to be prose in the release checklist ("<= 2500ms on recent devices"),
 * which nothing could enforce: a release that got slower still passed every gate.
 * Each budget now carries the p95 it allows, and a measured release is compared
 * both against the budget and against the previous baseline — a regression inside
 * budget is still a regression.
 */
export type MobilePerformanceBudget = {
  readonly label: string;
  readonly maxMs: number;
  readonly metric: string;
};

export type MobilePerformanceMeasurement = {
  readonly metric: string;
  readonly p95Ms: number;
};

export type MobilePerformanceBudgetStatus = "fail" | "pass" | "unmeasured";

export type MobilePerformanceBudgetResult = {
  readonly status: MobilePerformanceBudgetStatus;
  readonly unmeasured: readonly string[];
  readonly violations: readonly string[];
};

/** How much a release may drift from the baseline before it counts as a regression. */
export const MOBILE_PERFORMANCE_REGRESSION_TOLERANCE = 0.1;

export function evaluateMobilePerformanceBudgets(input: {
  readonly baseline?: readonly MobilePerformanceMeasurement[];
  readonly budgets: readonly MobilePerformanceBudget[];
  readonly measurements: readonly MobilePerformanceMeasurement[];
  /** The promotion job passes this; a local run does not have device numbers. */
  readonly requireMeasurements?: boolean;
}): MobilePerformanceBudgetResult {
  const measured = new Map(input.measurements.map((entry) => [entry.metric, entry.p95Ms]));
  const baseline = new Map((input.baseline ?? []).map((entry) => [entry.metric, entry.p95Ms]));
  const violations: string[] = [];
  const unmeasured: string[] = [];

  for (const budget of input.budgets) {
    const p95Ms = measured.get(budget.metric);

    if (p95Ms === undefined) {
      unmeasured.push(budget.metric);
      if (input.requireMeasurements) {
        violations.push(`${budget.metric} (${budget.label}) has no measurement for this build.`);
      }
      continue;
    }

    if (p95Ms > budget.maxMs) {
      violations.push(
        `${budget.metric} (${budget.label}) p95 ${p95Ms}ms exceeds its ${budget.maxMs}ms budget.`,
      );
      continue;
    }

    const baselineMs = baseline.get(budget.metric);
    if (baselineMs !== undefined && baselineMs > 0) {
      const allowed = baselineMs * (1 + MOBILE_PERFORMANCE_REGRESSION_TOLERANCE);
      if (p95Ms > allowed) {
        violations.push(
          `${budget.metric} (${budget.label}) p95 ${p95Ms}ms regressed past the baseline ${baselineMs}ms.`,
        );
      }
    }
  }

  if (violations.length > 0) {
    return { status: "fail", unmeasured, violations };
  }

  return {
    status: unmeasured.length > 0 ? "unmeasured" : "pass",
    unmeasured,
    violations,
  };
}
