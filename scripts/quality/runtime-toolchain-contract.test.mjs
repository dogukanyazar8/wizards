import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const expectedNodeVersion = "24.18.0";
const expectedNodeRange = `>=${expectedNodeVersion} <25`;
const expectedPackageManager = "pnpm@10.33.2";
const expectedNodeTypes = "^24.13.3";

const runtimeManifestPaths = ["package.json", "apps/web/package.json", "apps/desktop/package.json"];
const nodeTypesManifestPaths = [
  "apps/mobile/package.json",
  "apps/web/package.json",
  "packages/db/package.json",
  "packages/types/package.json",
  "packages/ui/package.json",
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

test("Node runtime version is exact and consistent across local and package contracts", () => {
  assert.equal(readFileSync(join(root, ".nvmrc"), "utf8").trim(), expectedNodeVersion);

  for (const manifestPath of runtimeManifestPaths) {
    assert.equal(readJson(manifestPath).engines?.node, expectedNodeRange, manifestPath);
  }
});

test("Node type definitions match the runtime major", () => {
  for (const manifestPath of nodeTypesManifestPaths) {
    assert.equal(
      readJson(manifestPath).devDependencies?.["@types/node"],
      expectedNodeTypes,
      manifestPath,
    );
  }
});

test("pnpm remains pinned during the Node-only migration phase", () => {
  assert.equal(readJson("package.json").packageManager, expectedPackageManager);
});

test("all GitHub Actions jobs consume the central Node runtime contract", () => {
  const workflowsDirectory = join(root, ".github", "workflows");
  const workflowNames = readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/u.test(name));
  let setupNodeSteps = 0;

  for (const workflowName of workflowNames) {
    const source = readFileSync(join(workflowsDirectory, workflowName), "utf8");
    const setupNodeCount = source.match(/uses:\s*actions\/setup-node@/gu)?.length ?? 0;

    if (setupNodeCount === 0) {
      continue;
    }

    const versionFileCount = source.match(/^\s+node-version-file:\s*\.nvmrc\s*$/gmu)?.length ?? 0;
    assert.equal(versionFileCount, setupNodeCount, workflowName);
    assert.doesNotMatch(source, /^\s+node-version:\s*/mu, workflowName);
    setupNodeSteps += setupNodeCount;
  }

  assert.equal(setupNodeSteps, 13, "unexpected setup-node step count");
});
