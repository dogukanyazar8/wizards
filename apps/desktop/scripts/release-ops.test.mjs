import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_PERFORMANCE_BUDGETS,
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

  it("documents release rings, smoke gates, budgets, and safety rules", async () => {
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

    for (const safetyRule of DESKTOP_RELEASE_SAFETY_RULES) {
      assert.ok(
        docs.includes(`\`${safetyRule.id}\``),
        `Expected documented safety rule: ${safetyRule.id}`,
      );
    }
  });
});
