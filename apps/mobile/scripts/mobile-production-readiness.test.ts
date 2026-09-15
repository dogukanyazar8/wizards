import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_PRODUCTION_READINESS_GATES,
  summarizeMobileProductionReadiness,
  validateMobileProductionReadiness,
} from "../src/release/mobile-production-readiness";

describe("mobile production readiness", () => {
  it("covers the staged mobile release path without collapsing UAT into production", () => {
    const summary = summarizeMobileProductionReadiness();

    assert.equal(summary.stageCount, 3);
    assert.equal(summary.uatGateCount > 0, true);
    assert.equal(summary.storeCandidateGateCount > 0, true);
    assert.equal(summary.productionGateCount > 0, true);
  });

  it("keeps every production readiness gate backed by redacted evidence", () => {
    const summary = summarizeMobileProductionReadiness();

    assert.equal(summary.evidenceCount, summary.totalGateCount);
    assert.equal(summary.automatedGateCount >= 6, true);
    assert.equal(summary.criticalGateCount >= 4, true);
    assert.deepEqual(validateMobileProductionReadiness(), []);
  });

  it("keeps production readiness ids stable and automation-oriented", () => {
    for (const gate of MOBILE_PRODUCTION_READINESS_GATES) {
      assert.match(gate.id, /^[a-z0-9-]+$/);
      assert.match(gate.automatedGate, /^mobile-/);
      assert.notEqual(gate.evidence.trim(), "");
    }
  });
});
