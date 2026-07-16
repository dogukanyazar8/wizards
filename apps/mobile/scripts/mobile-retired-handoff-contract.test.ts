import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(mobileRoot, "..", "..");

test("mobile tooling no longer depends on the retired local redesign handoff", () => {
  const retiredFiles = [
    "mobile-redesign-extract.ts",
    "mobile-redesign-reference.ts",
    "mobile-redesign-golden-drift.ts",
    "mobile-redesign-golden-transform.ts",
  ];
  const packageJson = JSON.parse(readFileSync(path.join(mobileRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const workflow = readFileSync(path.join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8");

  assert.equal(existsSync(path.join(repositoryRoot, "design_handoff_whispr_mobile")), false);
  for (const file of retiredFiles) {
    assert.equal(existsSync(path.join(mobileRoot, "scripts", file)), false, `${file} must be retired with the handoff`);
  }
  for (const command of [
    "visual:reference:extract",
    "visual:reference:verify",
    "visual:golden:generate",
    "visual:golden-drift",
  ]) {
    assert.equal(packageJson.scripts?.[command], undefined, `${command} must not reference retired handoff tooling`);
  }
  assert.doesNotMatch(workflow, /Mobile redesign golden drift/);
});
