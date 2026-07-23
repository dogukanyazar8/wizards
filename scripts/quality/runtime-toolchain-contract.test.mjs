import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const expectedNodeVersion = "24.18.0";
const expectedNodeRange = `>=${expectedNodeVersion} <25`;
const expectedPackageManager = "pnpm@11.15.0";
const expectedNodeTypes = "^24.13.3";
const expectedAllowedBuilds = {
  "@prisma/client": true,
  "@prisma/engines": true,
  "@sentry/cli@2.58.4 || 2.58.6": true,
  esbuild: true,
  "msgpackr-extract": true,
  prisma: true,
  sharp: true,
  "unrs-resolver": true,
};

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

function readText(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readWorkflowJob(source, jobName) {
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(lineEnding);
  const headerIndex = lines.findIndex((line) => line === `  ${jobName}:`);
  assert.notEqual(headerIndex, -1, `missing workflow job: ${jobName}`);

  const jobLines = [lines[headerIndex]];
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^  [\w-]+:\s*$/u.test(line)) {
      break;
    }
    jobLines.push(line);
  }

  return jobLines.join(lineEnding);
}

function parseTopLevelBooleanMap(source, key) {
  const lines = source.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => line === `${key}:`);
  assert.notEqual(headerIndex, -1, `missing ${key}`);

  const values = {};
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) {
      continue;
    }
    if (!/^\s/u.test(line)) {
      break;
    }

    const entry = /^  (?:"([^"]+)"|([^:]+)):\s+(true|false)$/u.exec(line);
    assert.ok(entry, `invalid ${key} entry: ${line}`);
    const packageName = entry[1] ?? entry[2];
    assert.ok(packageName, `missing ${key} package name`);
    values[packageName] = entry[3] === "true";
  }

  return values;
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

test("pnpm is pinned to the controlled package-manager release", () => {
  assert.equal(readJson("package.json").packageManager, expectedPackageManager);
});

test("Turbo is pinned to the reviewed toolchain release", () => {
  assert.equal(readJson("package.json").devDependencies?.turbo, "2.10.5");
});

test("stable typecheck generates Prisma before Turbo can replay cached tasks", () => {
  assert.equal(readJson("package.json").scripts?.typecheck, "pnpm db:generate && turbo typecheck");
});

test("pnpm 11 build scripts are fail-closed behind an exact allowlist", () => {
  const workspaceSource = readText("pnpm-workspace.yaml");

  assert.match(workspaceSource, /^strictDepBuilds:\s+true$/mu);
  assert.deepEqual(parseTopLevelBooleanMap(workspaceSource, "allowBuilds"), expectedAllowedBuilds);
  assert.doesNotMatch(
    workspaceSource,
    /^(?:onlyBuiltDependencies|onlyBuiltDependenciesFile|neverBuiltDependencies|ignoredBuiltDependencies|ignoreDepScripts):/mu,
  );
  assert.doesNotMatch(workspaceSource, /^dangerouslyAllowAllBuilds:\s+true$/mu);
});

test("all GitHub Actions pnpm jobs consume packageManager as their version source", () => {
  const workflowsDirectory = join(root, ".github", "workflows");
  const workflowNames = readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/u.test(name));
  let setupPnpmSteps = 0;

  for (const workflowName of workflowNames) {
    const lines = readText(join(".github", "workflows", workflowName)).split(/\r?\n/u);

    for (const [index, line] of lines.entries()) {
      if (!/uses:\s*pnpm\/action-setup@/u.test(line)) {
        continue;
      }

      const actionIndent = /^\s*/u.exec(line)?.[0].length ?? 0;
      const actionInputLines = [];
      for (const candidate of lines.slice(index + 1)) {
        const candidateIndent = /^\s*/u.exec(candidate)?.[0].length ?? 0;
        if (/^\s*-\s+/u.test(candidate) && candidateIndent < actionIndent) {
          break;
        }
        actionInputLines.push(candidate);
      }

      const actionInputs = actionInputLines.join("\n");
      assert.doesNotMatch(actionInputs, /^\s+version:\s*/mu, workflowName);
      setupPnpmSteps += 1;
    }
  }

  assert.equal(setupPnpmSteps, 13, "unexpected pnpm/action-setup step count");
});

test("Node 22 native compatibility runs only when hosted desktop checks are requested", () => {
  const workflow = readText(join(".github", "workflows", "ci.yml"));
  const compatibilityJob = readWorkflowJob(workflow, "node22-compatibility");
  const installRuntimeIndex = compatibilityJob.indexOf(
    "- name: Setup Node.js 24 dependency installation runtime",
  );
  const installDependenciesIndex = compatibilityJob.indexOf("- name: Install dependencies");
  const compatibilityRuntimeIndex = compatibilityJob.indexOf(
    "- name: Setup Node.js 22 compatibility runtime",
  );
  const nativeVerificationIndex = compatibilityJob.indexOf(
    "- name: Verify Node.js native dependencies",
  );

  assert.match(
    compatibilityJob,
    /^    if: github\.event_name == 'workflow_dispatch' && inputs\.desktop_hosted$/mu,
  );
  assert.match(compatibilityJob, /^          node-version-file: \.nvmrc$/mu);
  assert.match(compatibilityJob, /^          node-version: 22\.23\.1$/mu);
  assert.equal(
    compatibilityJob.match(/uses:\s*actions\/setup-node@/gu)?.length,
    2,
    "compatibility lane must use separate install and test runtimes",
  );
  assert.ok(installRuntimeIndex >= 0, "missing canonical dependency installation runtime");
  assert.ok(
    installDependenciesIndex > installRuntimeIndex,
    "dependencies must be installed under the canonical Node runtime",
  );
  assert.ok(
    compatibilityRuntimeIndex > installDependenciesIndex,
    "Node 22 must be activated only after dependency installation",
  );
  assert.ok(
    nativeVerificationIndex > compatibilityRuntimeIndex,
    "native compatibility checks must run under Node 22",
  );
  assert.match(compatibilityJob, /pnpm --filter @wizards\/db db:generate/u);
  assert.match(compatibilityJob, /import\('sharp'\)/u);
  assert.match(compatibilityJob, /pnpm --filter @wizards\/web exec esbuild --version/u);
  assert.match(compatibilityJob, /pnpm --filter @wizards\/desktop exec tauri --version/u);
  assert.match(
    compatibilityJob,
    /cargo check --locked --manifest-path apps\/desktop\/src-tauri\/Cargo\.toml/u,
  );
});

test("self-hosted CI uses the runner's persistent pnpm store instead of GitHub cache archives", () => {
  const workflow = readText(join(".github", "workflows", "ci.yml"));
  const selfHostedJobs = [
    "verify",
    "typescript-native-shadow",
    "e2e-smoke",
    "e2e-cross-browser",
    "e2e-a11y",
    "e2e-visual",
    "desktop-ops",
  ];

  for (const jobName of selfHostedJobs) {
    assert.doesNotMatch(
      readWorkflowJob(workflow, jobName),
      /^          cache: pnpm$/mu,
      `${jobName} must use the persistent self-hosted pnpm store`,
    );
  }

  for (const jobName of ["node22-compatibility", "desktop-build"]) {
    assert.match(
      readWorkflowJob(workflow, jobName),
      /^          cache: pnpm$/mu,
      `${jobName} must retain cache archives on GitHub-hosted runners`,
    );
  }
});

test("all GitHub Actions jobs consume the central Node runtime contract", () => {
  const workflowsDirectory = join(root, ".github", "workflows");
  const workflowNames = readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/u.test(name));
  let setupNodeSteps = 0;

  for (const workflowName of workflowNames) {
    const workflowSource = readFileSync(join(workflowsDirectory, workflowName), "utf8");
    const source =
      workflowName === "ci.yml"
        ? workflowSource.replace(readWorkflowJob(workflowSource, "node22-compatibility"), "")
        : workflowSource;
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
