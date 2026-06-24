import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAutomatedSuitesForCadence,
  getRiskCoverage,
  getSuitesForCadence,
  getUncoveredRiskAreas,
  productRiskAreas,
  testStrategySuites,
} from "./test-strategy";

describe("E2E test strategy", () => {
  it("documents every supported product risk area with at least one test suite", () => {
    assert.deepEqual(getUncoveredRiskAreas(), []);
    assert.equal(productRiskAreas.length > 0, true);
  });

  it("keeps high-risk realtime and voice coverage outside the PR-only gate", () => {
    const preMergeSuiteIds = new Set(
      getSuitesForCadence("pre-merge").map((suite) => suite.id),
    );

    assert.equal(preMergeSuiteIds.has("realtime-voice-post-merge"), false);
    assert.equal(preMergeSuiteIds.has("full-browser-regression"), false);

    const realtimeSuites = getRiskCoverage().get("realtime") ?? [];
    assert.equal(
      realtimeSuites.some((suite) => suite.cadences.includes("post-merge")),
      true,
    );
    assert.equal(
      realtimeSuites.some((suite) => suite.cadences.includes("scheduled-regression")),
      true,
    );
  });

  it("keeps pre-merge automation fast and deterministic", () => {
    const preMergeCommands = getAutomatedSuitesForCadence("pre-merge").map(
      (suite) => suite.command,
    );

    assert.equal(preMergeCommands.length > 0, true);

    for (const command of preMergeCommands) {
      assert.equal(typeof command, "string");
      assert.doesNotMatch(command ?? "", /\be2e:realtime\b|\be2e\s*$/);
      assert.doesNotMatch(command ?? "", /whispr\.team|railway|production/i);
    }
  });

  it("keeps every strategy entry actionable and owned by a cadence", () => {
    for (const suite of testStrategySuites) {
      assert.notEqual(suite.id.trim(), "");
      assert.notEqual(suite.purpose.trim(), "");
      assert.equal(suite.cadences.length > 0, true, `${suite.id} needs a cadence`);
      assert.equal(suite.layers.length > 0, true, `${suite.id} needs at least one layer`);
      assert.equal(
        suite.riskAreas.length > 0,
        true,
        `${suite.id} needs at least one product risk area`,
      );

      if (suite.automated) {
        assert.match(suite.command ?? "", /^pnpm\b/);
      }
    }
  });
});
