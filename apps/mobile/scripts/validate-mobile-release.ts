import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateMobileReleaseContract,
  type MobileReleaseProfileConfig,
} from "../src/release/mobile-release-contract";
import { summarizeMobileQualityGate } from "../src/quality/mobile-quality-gate";
import {
  buildMobileReleaseEvidence,
  validateMobileReleaseEvidence,
} from "../src/release/mobile-release-evidence";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const eas = readJson<{ build: Record<string, MobileReleaseProfileConfig> }>(
  resolve(__dirname, "../eas.json"),
);
const mobilePackage = readJson<{ version: string }>(resolve(__dirname, "../package.json"));
const rootPackage = readJson<{ version: string }>(resolve(__dirname, "../../../package.json"));

const result = validateMobileReleaseContract({
  easBuildProfiles: eas.build,
  packageVersion: mobilePackage.version,
  rootVersion: rootPackage.version,
});
const evidence = buildMobileReleaseEvidence({
  easBuildProfiles: eas.build,
  packageVersion: mobilePackage.version,
  rootVersion: rootPackage.version,
});
const evidenceBlockers = validateMobileReleaseEvidence(evidence);

const summary = {
  blockers: Array.from(new Set([...result.blockers, ...evidenceBlockers])),
  budgetCount: result.budgets.length,
  checklist: result.checklist,
  evidence: {
    automatedGateCount: evidence.automatedGates.length,
    manualQaChecks: evidence.manualQa.length,
    nativeCapabilities: evidence.nativeCapabilities.length,
    redacted: evidence.redacted,
    schemaVersion: evidence.schemaVersion,
  },
  profileCount: Object.keys(eas.build).length,
  productionReadiness: result.productionReadiness,
  quality: summarizeMobileQualityGate(),
  storeReadiness: {
    permissionCount: result.storeReadiness.permissionCount,
    privacyRequirementCount: result.storeReadiness.privacyRequirementCount,
  },
  warnings: result.warnings,
};

console.log(JSON.stringify(summary, null, 2));

if (summary.blockers.length > 0) {
  process.exitCode = 1;
}
