import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflowPath = join(root, ".github", "workflows", "ci.yml");
const expectedCheckoutPin = "actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v5.0.0";
const expectedSemgrepImage =
  "semgrep/semgrep:1.164.0-nonroot@sha256:936bf4db37f44ac1948c8cb0ade539d990f2b9e17481bd76970067e0d6dfc403";

function readWorkflowJob(source, jobName) {
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

  return jobLines.join("\n");
}

function readIndentedBlock(source, header, indent) {
  const lines = source.split(/\r?\n/u);
  const headerLine = `${" ".repeat(indent)}${header}:`;
  const headerIndex = lines.findIndex((line) => line === headerLine);
  assert.notEqual(headerIndex, -1, `missing block: ${header}`);

  const blockLines = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() && /^\s*/u.exec(line)?.[0].length <= indent) {
      break;
    }
    blockLines.push(line);
  }

  return blockLines.join("\n");
}

test("Semgrep CE is an immutable, least-privilege job in the primary CI workflow", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const semgrepJob = readWorkflowJob(workflow, "semgrep");
  const permissions = readIndentedBlock(semgrepJob, "permissions", 4);
  const actionReferences = [...semgrepJob.matchAll(/^\s+uses:\s*(\S+)(?:\s+#\s+(.+))?$/gmu)];

  assert.match(workflow, /^  pull_request:\s*$/mu);
  assert.match(readIndentedBlock(workflow, "push", 2), /^      - uat$/mu);
  assert.match(semgrepJob, /^    runs-on: ubuntu-24\.04$/mu);
  assert.match(permissions, /^      contents: read$/mu);
  assert.doesNotMatch(permissions, /^\s+(?:pull-requests|security-events|actions):/mu);
  assert.deepEqual(
    actionReferences.map(([, reference, comment]) => `${reference} # ${comment}`),
    [expectedCheckoutPin],
  );
  assert.match(
    semgrepJob,
    new RegExp(
      `^      SEMGREP_IMAGE: ${expectedSemgrepImage.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`,
      "mu",
    ),
  );
});

test("Semgrep CE tests and scan are local-only, fail-closed, and read-only", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const semgrepJob = readWorkflowJob(workflow, "semgrep");

  assert.equal(semgrepJob.match(/docker run --rm/gu)?.length, 2);
  assert.equal(semgrepJob.match(/--volume "\$GITHUB_WORKSPACE:\/src:ro"/gu)?.length, 2);
  assert.equal(semgrepJob.match(/--oss-only/gu)?.length, 2);
  assert.equal(semgrepJob.match(/--metrics=off/gu)?.length, 2);
  assert.equal(semgrepJob.match(/--disable-version-check/gu)?.length, 2);
  assert.equal(semgrepJob.match(/--strict/gu)?.length, 2);
  assert.match(
    semgrepJob,
    /semgrep scan[\s\S]*--test[\s\S]*--config \.semgrep\/rules \.semgrep\/tests/u,
  );
  assert.match(
    semgrepJob,
    /semgrep scan[\s\S]*--error[\s\S]*--config \.semgrep\/rules[\s\S]*apps packages/u,
  );

  for (const excludedPath of [
    "node_modules",
    ".next",
    "dist",
    "coverage",
    "packages/db/src/generated/prisma",
    "graphify-out",
    "target",
    "build",
  ]) {
    assert.match(semgrepJob, new RegExp(`--exclude=${excludedPath.replaceAll("/", "\\/")}`, "u"));
  }

  assert.doesNotMatch(
    semgrepJob,
    /SEMGREP_APP_TOKEN|semgrep ci|--config(?:=|\s+)auto|--sarif|security-events|upload-sarif|github\/codeql-action|semgrep\.dev\/|--config(?:=|\s+)[pr]\//iu,
  );
});
