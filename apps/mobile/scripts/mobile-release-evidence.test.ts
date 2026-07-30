import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMobileReleaseEvidence,
  validateMobileReleaseEvidence,
} from "../src/release/mobile-release-evidence";
import type { MobileReleaseProfileConfig } from "../src/release/mobile-release-contract";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function buildRealEvidence() {
  const eas = readJson<{
    build: Record<string, MobileReleaseProfileConfig>;
    cli: { appVersionSource: string };
  }>(resolve(__dirname, "../eas.json"));
  const mobilePackage = readJson<{ version: string }>(resolve(__dirname, "../package.json"));
  const rootPackage = readJson<{ version: string }>(resolve(__dirname, "../../../package.json"));

  return buildMobileReleaseEvidence({
    appVersionSource: eas.cli.appVersionSource,
    easBuildProfiles: eas.build,
    generatedAt: "2026-07-02T00:00:00.000Z",
    packageVersion: mobilePackage.version,
    rootVersion: rootPackage.version,
  });
}

describe("mobile release evidence", () => {
  it("builds redacted evidence for release promotion without blockers", () => {
    const evidence = buildRealEvidence();

    assert.equal(evidence.schemaVersion, 1);
    assert.equal(evidence.redacted, true);
    assert.equal(evidence.blockers.length, 0);
    assert.equal(
      evidence.automatedGates.some((gate) => gate.id === "mobile-release-evidence"),
      true,
    );
    assert.equal(evidence.manualQa.length >= 20, true);
    assert.equal(evidence.deviceMatrix.length >= 4, true);
    assert.equal(evidence.nativeCapabilities.length >= 5, true);
    assert.equal(evidence.productionReadiness.stageCount, 4);
    assert.deepEqual(validateMobileReleaseEvidence(evidence), []);
  });

  it("redacts local development origins while keeping production-like origins auditable", () => {
    const evidence = buildRealEvidence();
    const development = evidence.releaseProfiles.find((profile) => profile.name === "development");
    const uat = evidence.releaseProfiles.find((profile) => profile.name === "uat");
    const production = evidence.releaseProfiles.find((profile) => profile.name === "production");

    assert.ok(development);
    assert.ok(uat);
    assert.ok(production);
    assert.equal(development.publicOrigins.api, "development-local");
    assert.equal(uat.publicOrigins.api, "https://wizardsweb-uat.up.railway.app");
    assert.equal(production.publicOrigins.api, "https://whispr.team");
  });

  it("rejects evidence that carries sensitive-looking values", () => {
    const evidence = buildRealEvidence();
    const compromisedEvidence = {
      ...evidence,
      warnings: ["access_token=should-not-be-here"],
    };

    assert.equal(
      validateMobileReleaseEvidence(compromisedEvidence).some((issue) =>
        issue.includes("sensitive-looking"),
      ),
      true,
    );
  });
});
