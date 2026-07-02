import {
  MOBILE_AUTOMATED_GATES,
  MOBILE_MANUAL_QA_CHECKS,
  MOBILE_QA_DEVICE_MATRIX,
  summarizeMobileQualityGate,
  validateMobileQualityGate,
} from "../src/quality/mobile-quality-gate";
import { summarizeMobileProductionReadiness } from "../src/release/mobile-production-readiness";

const issues = validateMobileQualityGate();
const summary = summarizeMobileQualityGate();

console.log(
  JSON.stringify(
    {
      automatedGates: MOBILE_AUTOMATED_GATES.map((gate) => gate.id),
      blockers: issues,
      manualChecks: MOBILE_MANUAL_QA_CHECKS.length,
      productionReadiness: summarizeMobileProductionReadiness(),
      qualitySummary: summary,
      targetMatrix: MOBILE_QA_DEVICE_MATRIX.map((target) => ({
        focus: target.focus,
        id: target.id,
        platform: target.platform,
        sizeClass: target.sizeClass,
      })),
    },
    null,
    2,
  ),
);

if (issues.length > 0) {
  process.exitCode = 1;
}
