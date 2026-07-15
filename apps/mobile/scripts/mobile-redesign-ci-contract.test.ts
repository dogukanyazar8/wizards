import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(mobileRoot, "..", "..");

test("CI blocks normalized golden drift without misrepresenting it as a device gate", () => {
  const packageJson = JSON.parse(readFileSync(path.join(mobileRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const workflow = readFileSync(
    path.join(repositoryRoot, ".github", "workflows", "ci.yml"),
    "utf8",
  );

  assert.equal(
    packageJson.scripts?.["visual:gate"],
    "node --import tsx scripts/mobile-redesign-visual-gate.ts",
  );
  assert.equal(
    packageJson.scripts?.["visual:golden-drift"],
    "node --import tsx scripts/mobile-redesign-golden-drift.ts",
  );
  assert.match(workflow, /name: Mobile redesign golden drift/);
  assert.match(workflow, /pnpm --filter @wizards\/mobile visual:golden-drift/);
  assert.doesNotMatch(workflow, /pnpm --filter @wizards\/mobile visual:gate/);
  assert.doesNotMatch(
    workflow,
    /Mobile redesign golden drift[\s\S]{0,240}continue-on-error:\s*true/,
  );
});

test("nightly UAT device gate reads committed evidence and refuses stale screen evidence", () => {
  const workflow = readFileSync(
    path.join(repositoryRoot, ".github", "workflows", "mobile-redesign-device-gate-nightly.yml"),
    "utf8",
  );

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /ref:\s*uat/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /WHISPR_DEVICE_CAPTURE_DIRECTORY:\s*artifacts\/redesign/);
  assert.match(workflow, /pnpm --filter @wizards\/mobile visual:gate/);
  assert.match(workflow, /actions\/upload-artifact@/);
  assert.doesNotMatch(workflow, /visual:gate[\s\S]{0,160}continue-on-error:\s*true/);
});

test("golden drift gate rejects a normalized golden manifest drift", async () => {
  const gate = await import("./mobile-redesign-golden-drift");
  const baseline = {
    anchors: [{ anchor: "1a", theme: "light" }],
    sourceHash: "a".repeat(64),
    transformHash: "b".repeat(64),
    version: 1,
  };

  assert.doesNotThrow(() => gate.assertNormalizedGoldenManifestMatches(baseline, baseline));
  assert.throws(
    () =>
      gate.assertNormalizedGoldenManifestMatches(baseline, {
        ...baseline,
        sourceHash: "c".repeat(64),
      }),
    /source hash drift/i,
  );
});

test("golden drift gate verifies the checked-in normalized golden pixels", async () => {
  const gate = await import("./mobile-redesign-golden-drift");
  await gate.verifyNormalizedGoldenBaselines();
});

test("device visual gate is fail-closed and excludes the unimplemented 1h target", async () => {
  const gate = await import("./mobile-redesign-visual-gate");
  assert.throws(
    () => gate.requireDeviceCaptureDirectory(undefined),
    /WHISPR_DEVICE_CAPTURE_DIRECTORY/i,
  );
  assert.equal(
    gate.resolveDeviceCaptureDirectory("artifacts/redesign"),
    path.join(repositoryRoot, "artifacts", "redesign"),
  );
  assert.deepEqual(
    gate.DEVICE_GATE_TARGETS.map(
      (target: { anchor: string; theme: string }) => `${target.anchor}-${target.theme}`,
    ),
    [
      "1a-light",
      "1b-light",
      "1c-light",
      "1d-light",
      "1e-light",
      "1f-light",
      "1g-light",
      "1i-dark",
      "1j-dark",
    ],
  );
  assert.equal(
    gate.DEVICE_GATE_TARGETS.some((target: { anchor: string }) => target.anchor === "1h"),
    false,
  );
  assert.deepEqual(
    gate
      .resolveDeviceGateTargets(["1a-light"])
      .map((target: { anchor: string; theme: string }) => `${target.anchor}-${target.theme}`),
    ["1a-light"],
  );
  assert.throws(
    () => gate.resolveDeviceGateTargets(["1h-light"]),
    /unsupported device gate target/i,
  );
});
