import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(mobileRoot, "..", "..");

test("CI blocks merges on normalized golden drift and pixel regressions", () => {
  const packageJson = JSON.parse(readFileSync(path.join(mobileRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const workflow = readFileSync(path.join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8");

  assert.equal(
    packageJson.scripts?.["visual:gate"],
    "node --import tsx scripts/mobile-redesign-visual-gate.ts",
  );
  assert.match(workflow, /name: Mobile redesign visual gate/);
  assert.match(workflow, /pnpm --filter @wizards\/mobile visual:gate/);
  assert.doesNotMatch(workflow, /Mobile redesign visual gate[\s\S]{0,240}continue-on-error:\s*true/);
});

test("visual gate rejects a normalized golden manifest drift", async () => {
  const gate = await import("./mobile-redesign-visual-gate");
  const baseline = {
    anchors: [{ anchor: "1a", theme: "light" }],
    sourceHash: "a".repeat(64),
    transformHash: "b".repeat(64),
    version: 1,
  };

  assert.doesNotThrow(() => gate.assertNormalizedGoldenManifestMatches(baseline, baseline));
  assert.throws(
    () => gate.assertNormalizedGoldenManifestMatches(baseline, { ...baseline, sourceHash: "c".repeat(64) }),
    /source hash drift/i,
  );
});

test("visual gate verifies the checked-in normalized golden pixels", async () => {
  const gate = await import("./mobile-redesign-visual-gate");
  await gate.verifyNormalizedGoldenBaselines();
});
