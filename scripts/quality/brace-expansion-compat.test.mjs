import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const mobileRequire = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const eslintRequire = createRequire(mobileRequire.resolve("eslint/package.json"));
const minimatchRequire = createRequire(eslintRequire.resolve("minimatch/package.json"));

test("minimatch 3 keeps callable CommonJS brace-pattern behavior", () => {
  const minimatch = minimatchRequire("minimatch");
  const minimatchPackage = minimatchRequire("minimatch/package.json");

  assert.match(minimatchPackage.version, /^3\./u);
  assert.equal(typeof minimatch, "function");
  assert.equal(minimatch("src/foo.test.ts", "src/{foo,bar}.test.ts"), true);
});

test("brace-expansion keeps its callable and named CommonJS exports", () => {
  const braceExpansion = minimatchRequire("brace-expansion");
  const braceExpansionPackage = minimatchRequire("brace-expansion/package.json");

  assert.equal(braceExpansionPackage.version, "5.0.9");
  assert.equal(typeof braceExpansion, "function");
  assert.equal(braceExpansion.expand, braceExpansion);
  assert.equal(typeof braceExpansion.EXPANSION_MAX, "number");
  assert.equal(typeof braceExpansion.EXPANSION_MAX_LENGTH, "number");
});
