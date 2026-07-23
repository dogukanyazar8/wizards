import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_PERFORMANCE_BUDGETS,
  DESKTOP_RELEASE_PERFORMANCE_EVIDENCE,
  DESKTOP_RELEASE_PROMOTION_RULES,
  DESKTOP_RELEASE_RINGS,
  DESKTOP_RELEASE_SAFETY_RULES,
  DESKTOP_REQUIRED_SMOKE_TESTS,
  assertDesktopReleaseOpsContract,
  assertDesktopVersionContract,
  getDesktopVersionContract,
  getDesktopReleaseOpsContract,
} from "./release-ops.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(desktopRoot, "../..");

describe("desktop release operations contract", () => {
  it("keeps release rings explicit and ordered from safest to broadest", () => {
    assert.deepEqual(DESKTOP_RELEASE_RINGS, ["dev", "uat", "canary", "stable"]);
    assert.equal(DESKTOP_RELEASE_RINGS.at(0), "dev");
    assert.equal(DESKTOP_RELEASE_RINGS.at(-1), "stable");
  });

  it("requires the production desktop smoke gates", () => {
    const contract = assertDesktopReleaseOpsContract(getDesktopReleaseOpsContract());
    const smokeIds = contract.smokeTests.map((test) => test.id);

    assert.deepEqual(
      smokeIds,
      DESKTOP_REQUIRED_SMOKE_TESTS.map((test) => test.id),
    );
    assert.ok(contract.smokeTests.every((test) => test.requiredOn === "windows"));
  });

  it("keeps performance budgets below release-operation ceilings", () => {
    assert.ok(DESKTOP_PERFORMANCE_BUDGETS.warmStartMs <= 2000);
    assert.ok(DESKTOP_PERFORMANCE_BUDGETS.memoryMb <= 220);
    assert.ok(DESKTOP_PERFORMANCE_BUDGETS.overlayCpuPercent <= 3);
    assert.ok(DESKTOP_PERFORMANCE_BUDGETS.shortcutLatencyMs <= 50);
  });

  it("requires release performance evidence for the operational budgets", () => {
    const evidenceIds = DESKTOP_RELEASE_PERFORMANCE_EVIDENCE.map((item) => item.id);

    assert.deepEqual(evidenceIds, [
      "warm-start",
      "idle-memory",
      "updater-check-install",
      "overlay-cpu",
      "shortcut-latency",
    ]);
    assert.ok(DESKTOP_RELEASE_PERFORMANCE_EVIDENCE.every((item) => item.description.length >= 20));
  });

  it("keeps ring promotion rules explicit", () => {
    const promotionRings = DESKTOP_RELEASE_PROMOTION_RULES.map((rule) => rule.ring);

    assert.deepEqual(promotionRings, ["uat", "canary", "stable"]);
    assert.ok(DESKTOP_RELEASE_PROMOTION_RULES.every((rule) => rule.entryCriteria.length > 0));
    assert.ok(DESKTOP_RELEASE_PROMOTION_RULES.every((rule) => rule.exitCriteria.length > 0));
  });

  it("codifies the desktop safety rules that must not regress", () => {
    const safetyRuleIds = DESKTOP_RELEASE_SAFETY_RULES.map((rule) => rule.id);

    assert.deepEqual(safetyRuleIds, [
      "no-broad-native-permissions",
      "signed-updater-only",
      "no-native-game-hooks",
      "no-hardware-encode-claims",
      "no-desktop-secrets",
      "no-fake-security-ui",
      "overlay-voice-only",
    ]);
  });

  it("keeps web and native desktop version sources explicit", () => {
    const contract = assertDesktopVersionContract(getDesktopVersionContract());

    assert.equal(contract.rootPackageVersion, contract.webPackageVersion);
    assert.equal(contract.webRuntimeVersion, contract.webPackageVersion);
    assert.equal(contract.desktopNativeVersion, contract.desktopPackageVersion);
    assert.equal(contract.desktopPackageVersion, contract.tauriConfigVersion);
    assert.equal(contract.desktopPackageVersion, contract.cargoPackageVersion);
  });

  it("keeps the release guide version aligned and command examples version-neutral", async () => {
    const contract = assertDesktopVersionContract(getDesktopVersionContract());
    const releaseGuide = await readFile(path.join(desktopRoot, "RELEASE.md"), "utf8");
    const documentedVersionMatch = releaseGuide.match(/The current desktop version is `([^`]+)`\./);

    assert.ok(documentedVersionMatch, "Expected an authoritative desktop version statement");
    assert.equal(documentedVersionMatch[1], contract.desktopPackageVersion);

    const commandExamples = [...releaseGuide.matchAll(/```powershell\r?\n([\s\S]*?)```/g)];
    assert.ok(commandExamples.length > 0, "Expected PowerShell release command examples");

    for (const [, commandExample] of commandExamples) {
      assert.doesNotMatch(
        commandExample,
        /(^|[^\d.])\d+\.\d+\.\d+(?![\d.])/m,
        "Release command examples must use version placeholders instead of concrete semver values",
      );
    }
  });

  it("includes the version contract in release operations output", () => {
    const contract = assertDesktopReleaseOpsContract(getDesktopReleaseOpsContract());

    assert.ok(contract.versionContract);
    assert.equal(
      contract.versionContract.desktopNativeVersion,
      contract.versionContract.desktopPackageVersion,
    );
    assert.equal(
      contract.versionContract.webRuntimeVersion,
      contract.versionContract.webPackageVersion,
    );
  });

  it("keeps self-hosted desktop operations automatic and hosted validation manually gated", async () => {
    const contract = assertDesktopReleaseOpsContract(getDesktopReleaseOpsContract());
    const workflow = await readFile(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");

    assert.deepEqual(contract.platformMatrix, {
      windows: "manual-hosted",
      macos: "manual-hosted",
      linux: "automatic",
    });
    const desktopOpsStart = workflow.indexOf("\n  desktop-ops:");
    const desktopBuildStart = workflow.indexOf("\n  desktop-build:");
    const desktopOpsJob = workflow.slice(desktopOpsStart, desktopBuildStart);

    assert.notEqual(desktopOpsStart, -1);
    assert.notEqual(desktopBuildStart, -1);
    assert.doesNotMatch(desktopOpsJob, /continue-on-error:/);
    assert.match(
      workflow,
      /^      desktop_hosted:\r?\n        default: false\r?\n        description: Run the Windows\/macOS desktop matrix \(consumes GitHub-hosted runner minutes\)\r?\n        required: true\r?\n        type: boolean$/mu,
    );
    assert.match(desktopOpsJob, /\{"os":"wizards-ci","staged":false\}/);
    assert.match(desktopOpsJob, /inputs\.desktop_hosted && fromJSON/);
    assert.match(desktopOpsJob, /\{"os":"windows-latest","staged":false\}/);
    assert.match(desktopOpsJob, /\{"os":"macos-latest","staged":false\}/);
  });

  it("documents the required manual CI evidence before release", async () => {
    const releaseGuide = await readFile(path.join(desktopRoot, "RELEASE.md"), "utf8");

    assert.match(releaseGuide, /## Required Manual CI Evidence Before Release/);
    assert.match(releaseGuide, /`e2e_scope`: `full`/);
    assert.match(releaseGuide, /`e2e_scope`: `smoke`/);
    assert.match(releaseGuide, /`desktop_hosted`: `true`/);
    assert.match(releaseGuide, /`playwright-report`/);
    assert.match(releaseGuide, /`whispr-desktop-windows`/);
    assert.match(releaseGuide, /Linux `desktop-ops`.*not Windows artifact evidence/i);
    assert.match(releaseGuide, /schedule.*does not prove UAT runtime/i);
    assert.match(
      releaseGuide,
      /does not add GitHub-hosted Windows or macOS capacity to default push CI/i,
    );
  });

  it("documents release rings, smoke gates, budgets, promotion rules, and safety rules", async () => {
    const [readme, releaseGuide, qaGuide] = await Promise.all([
      readFile(path.join(desktopRoot, "README.md"), "utf8"),
      readFile(path.join(desktopRoot, "RELEASE.md"), "utf8"),
      readFile(path.join(desktopRoot, "QA.md"), "utf8"),
    ]);
    const docs = `${readme}\n${releaseGuide}\n${qaGuide}`;

    for (const ring of DESKTOP_RELEASE_RINGS) {
      assert.ok(docs.includes(`\`${ring}\``), `Expected documented release ring: ${ring}`);
    }

    for (const smokeTest of DESKTOP_REQUIRED_SMOKE_TESTS) {
      assert.ok(
        docs.includes(`\`${smokeTest.id}\``),
        `Expected documented desktop smoke gate: ${smokeTest.id}`,
      );
    }

    for (const budget of ["warm start", "memory", "overlay CPU", "shortcut latency"]) {
      assert.match(docs, new RegExp(budget, "i"), `Expected documented budget: ${budget}`);
    }

    for (const evidence of DESKTOP_RELEASE_PERFORMANCE_EVIDENCE) {
      assert.ok(
        docs.includes(`\`${evidence.id}\``),
        `Expected documented performance evidence: ${evidence.id}`,
      );
    }

    for (const rule of DESKTOP_RELEASE_PROMOTION_RULES) {
      assert.match(
        docs,
        new RegExp(rule.rollout, "i"),
        `Expected documented rollout: ${rule.rollout}`,
      );
    }

    for (const safetyRule of DESKTOP_RELEASE_SAFETY_RULES) {
      assert.ok(
        docs.includes(`\`${safetyRule.id}\``),
        `Expected documented safety rule: ${safetyRule.id}`,
      );
    }
  });
});
