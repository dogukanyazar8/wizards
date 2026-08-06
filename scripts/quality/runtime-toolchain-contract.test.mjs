import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const expectedNodeVersion = "24.18.0";
const expectedNodeRange = `>=${expectedNodeVersion} <25`;
const expectedPackageManager = "pnpm@11.20.0";
const expectedNodeTypes = "^24.13.3";
const expectedNode24ActionPins = {
  "actions/checkout": {
    sha: "08c6903cd8c0fde910a37f88322edcfb5dd907a8",
    tag: "v5.0.0",
  },
  "actions/setup-node": {
    sha: "a0853c24544627f65ddf259abe73b1d18a591444",
    tag: "v5.0.0",
  },
  "pnpm/action-setup": {
    sha: "fc06bc1257f339d1d5d8b3a19a8cae5388b55320",
    tag: "v5.0.0",
  },
};
const expectedActionlint = {
  archive: "actionlint_1.7.12_linux_amd64.tar.gz",
  sha256: "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8",
  version: "1.7.12",
};
const expectedAllowedBuilds = {
  "@prisma/client": true,
  "@prisma/engines": true,
  "@sentry/cli": true,
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
  const lines = source.split(/\r?\n/u);
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

test("actionlint uses the repository's checksum-verified command", () => {
  assert.equal(readJson("package.json").scripts?.actionlint, "node scripts/quality/actionlint.mjs");
});

test("Turbo is pinned to the reviewed toolchain release", () => {
  assert.equal(readJson("package.json").devDependencies?.turbo, "2.10.6");
});

test("stable typecheck generates Prisma before Turbo can replay cached tasks", () => {
  assert.equal(readJson("package.json").scripts?.typecheck, "pnpm db:generate && turbo typecheck");
});

test("Prisma 7 uses the ESM client, generated import boundary, and explicit seeds", () => {
  const dbPackage = readJson("packages/db/package.json");
  const webPackage = readJson("apps/web/package.json");
  const schema = readText("packages/db/prisma/schema.prisma");
  const config = readText("packages/db/prisma.config.ts");
  const turbo = readJson("turbo.json");

  assert.equal(dbPackage.type, "module");
  assert.equal(dbPackage.dependencies["@prisma/client"], "7.9.1");
  assert.equal(dbPackage.dependencies["@prisma/adapter-pg"], "7.9.1");
  assert.equal(dbPackage.scripts["db:seed"], "prisma db seed");
  assert.equal(dbPackage.scripts["db:migrate:status"], "prisma migrate status");
  assert.equal(dbPackage.scripts["prisma:ensure-runtime"], undefined);
  assert.match(schema, /provider\s*=\s*"prisma-client"/);
  assert.match(schema, /output\s*=\s*"\.\.\/src\/generated\/prisma"/);
  assert.doesNotMatch(schema, /^\s*url\s*=/m);
  assert.match(config, /path:\s*"prisma\/rebaseline-migrations"/);
  assert.match(config, /seed:\s*"tsx src\/seed\.ts"/);
  assert.deepEqual(turbo.tasks["db:generate"].outputs, ["packages/db/src/generated/prisma/**"]);

  for (const script of Object.values(webPackage.scripts)) {
    assert.doesNotMatch(script, /ensure-prisma-client-runtime/);
  }
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

  assert.equal(setupPnpmSteps, 16, "unexpected pnpm/action-setup step count");
});

test("CI pins supported Node 24 action runtimes to reviewed releases", () => {
  const workflow = readText(join(".github", "workflows", "ci.yml"));
  const actionReferences = [
    ...workflow.matchAll(
      /^\s+uses:\s*(actions\/checkout|actions\/setup-node|pnpm\/action-setup)@([a-f0-9]{40})\s+#\s+(v\d+(?:\.\d+){0,2})\s*$/gmu,
    ),
  ];

  assert.ok(actionReferences.length > 0, "CI must use reviewed JavaScript actions");

  for (const [, action, sha, tag] of actionReferences) {
    const expected = expectedNode24ActionPins[action];
    assert.ok(expected, `unexpected action pin: ${action}`);
    assert.equal(sha, expected.sha, `${action} must use its reviewed immutable SHA`);
    assert.equal(tag, expected.tag, `${action} tag comment must match its immutable SHA`);
  }

  assert.deepEqual(
    [...new Set(actionReferences.map(([, action]) => action))].sort(),
    Object.keys(expectedNode24ActionPins).sort(),
  );
});

test("actionlint CI job is checksum-verified, fail-closed, and least-privilege", () => {
  const workflow = readText(join(".github", "workflows", "ci.yml"));
  const actionlintJob = readWorkflowJob(workflow, "actionlint");

  assert.match(actionlintJob, /^    name: actionlint$/mu);
  assert.match(actionlintJob, /^    permissions:\r?\n      contents: read$/mu);
  assert.match(
    actionlintJob,
    /^        uses: actions\/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5\.0\.0$/mu,
  );
  assert.match(actionlintJob, new RegExp(`actionlintVersion=${expectedActionlint.version}`, "u"));
  assert.match(actionlintJob, new RegExp(`archive=${expectedActionlint.archive}`, "u"));
  assert.match(actionlintJob, new RegExp(`expectedSha256=${expectedActionlint.sha256}`, "u"));
  assert.match(
    actionlintJob,
    new RegExp(
      `https://github\\.com/rhysd/actionlint/releases/download/v${expectedActionlint.version}/${expectedActionlint.archive}`,
      "u",
    ),
  );
  assert.match(actionlintJob, /sha256sum --check --status/u);
  assert.match(actionlintJob, /-shellcheck= -pyflakes= \.github\/workflows\/\*\.yml/u);
  assert.doesNotMatch(actionlintJob, /(?:GITHUB_TOKEN|github\.token|secrets\.)/u);
});

test("setup-node v5 keeps the workflow's pnpm cache policy explicit", () => {
  const lines = readText(join(".github", "workflows", "ci.yml")).split(/\r?\n/u);
  let automaticCacheOptOuts = 0;

  for (const [index, line] of lines.entries()) {
    if (!/uses:\s*actions\/setup-node@/u.test(line)) {
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
    if (/^\s+cache:\s+pnpm\s*$/mu.test(actionInputs)) {
      continue;
    }

    assert.match(
      actionInputs,
      /^\s+package-manager-cache:\s+false\s*$/mu,
      "setup-node v5 must not enable automatic pnpm cache where cache was previously off",
    );
    automaticCacheOptOuts += 1;
  }

  assert.equal(automaticCacheOptOuts, 1, "unexpected setup-node automatic-cache opt-out count");
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

test("dependency-installing CI jobs use pnpm cache archives", () => {
  const workflow = readText(join(".github", "workflows", "ci.yml"));
  const dependencyInstallingJobs = [
    "verify",
    "typescript-native-shadow",
    "e2e-smoke",
    "e2e-cross-browser",
    "e2e-a11y",
    "e2e-visual",
    "desktop-ops",
    "node22-compatibility",
  ];

  for (const jobName of dependencyInstallingJobs) {
    assert.match(
      readWorkflowJob(workflow, jobName),
      /^          cache: pnpm$/mu,
      `${jobName} must use pnpm cache archives on GitHub-hosted runners`,
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

  assert.equal(setupNodeSteps, 16, "unexpected setup-node step count");
});
