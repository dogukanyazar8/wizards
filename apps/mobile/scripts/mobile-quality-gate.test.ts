import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_AUTOMATED_GATES,
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_QA_DEVICE_MATRIX,
  summarizeMobileQualityGate,
  validateMobileQualityGate,
  type MobileQualityArea,
} from "../src/quality/mobile-quality-gate";

const expectedAreas: MobileQualityArea[] = [
  "auth",
  "deep-link",
  "dm",
  "launch",
  "navigation",
  "permissions",
  "performance",
  "release",
  "store",
  "sync",
  "voice",
  "workspace",
];

describe("mobile quality gate", () => {
  it("keeps the manual QA checklist broad enough for a real mobile release", () => {
    const areas = new Set(MOBILE_MANUAL_QA_CHECKS.map((check) => check.area));

    for (const area of expectedAreas) {
      assert.equal(areas.has(area), true, `Missing mobile manual QA area: ${area}`);
    }

    assert.equal(
      MOBILE_MANUAL_QA_CHECKS.some((check) => check.risk === "critical"),
      true,
    );
  });

  it("covers Android, iOS, compact, and tablet targets", () => {
    const platforms = new Set(MOBILE_QA_DEVICE_MATRIX.map((target) => target.platform));
    const sizeClasses = new Set(MOBILE_QA_DEVICE_MATRIX.map((target) => target.sizeClass));

    assert.equal(platforms.has("android"), true);
    assert.equal(platforms.has("ios"), true);
    assert.equal(sizeClasses.has("compact"), true);
    assert.equal(sizeClasses.has("tablet"), true);
  });

  it("keeps automated gates scoped to the mobile package", () => {
    assert.equal(MOBILE_AUTOMATED_GATES.length >= 5, true);
    for (const gate of MOBILE_AUTOMATED_GATES) {
      assert.equal(gate.command.includes("@wizards/mobile"), true);
    }
  });

  it("summarizes quality readiness without leaking sensitive strings", () => {
    const summary = summarizeMobileQualityGate();

    assert.equal(summary.platformCount, 2);
    assert.equal(summary.requiredAreas.length, expectedAreas.length);
    assert.deepEqual(validateMobileQualityGate(), []);
  });
});
