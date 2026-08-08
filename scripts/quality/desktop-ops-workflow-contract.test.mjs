import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflowPath = join(root, ".github", "workflows", "ci.yml");
const workflowsDirectory = join(root, ".github", "workflows");

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

function readWorkflowStep(job, stepName) {
  const lines = job.split(/\r?\n/u);
  const header = `      - name: ${stepName}`;
  const headerIndex = lines.findIndex((line) => line === header);
  assert.notEqual(headerIndex, -1, `missing workflow step: ${stepName}`);

  const stepLines = [lines[headerIndex]];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.startsWith("      - name: ")) {
      break;
    }
    stepLines.push(line);
  }

  return stepLines.join("\n");
}

test("automatic Linux Desktop Ops runs its cargo audit step with Bash", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const desktopOps = readWorkflowJob(workflow, "desktop-ops");
  const cargoAudit = readWorkflowStep(desktopOps, "Audit Rust dependencies");

  assert.match(desktopOps, /^    runs-on: \[self-hosted, linux, x64, ci-fast\]$/mu);
  assert.doesNotMatch(desktopOps, /matrix\.os|windows-latest|macos-latest/u);
  assert.doesNotMatch(desktopOps, /Install Tauri Linux system dependencies/u);
  assert.match(cargoAudit, /^        shell: bash$/mu);
  assert.match(cargoAudit, /^          expected_version="cargo-audit \$CARGO_AUDIT_VERSION"$/mu);
  assert.match(cargoAudit, /^          if command -v cargo-audit >\/dev\/null 2>&1; then$/mu);
  assert.match(
    cargoAudit,
    /^            cargo install cargo-audit --version "\$CARGO_AUDIT_VERSION" --locked --force$/mu,
  );
  assert.match(
    cargoAudit,
    /^          cargo metadata --locked --format-version 1 --no-deps > \/dev\/null$/mu,
  );
  assert.match(cargoAudit, /^          cargo audit --file Cargo\.lock$/mu);
  assert.doesNotMatch(cargoAudit, /Get-Command|\$env:|\$LASTEXITCODE/u);
});

test("automatic Linux CI jobs use capability-scoped self-hosted runners", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const actionlintConfig = readFileSync(join(root, ".github", "actionlint.yaml"), "utf8");
  const semgrep = readWorkflowJob(workflow, "semgrep");

  for (const jobName of [
    "verify",
    "semgrep",
    "e2e-smoke",
    "e2e-cross-browser",
    "e2e-a11y",
    "e2e-visual",
  ]) {
    assert.match(
      readWorkflowJob(workflow, jobName),
      /^    runs-on: \[self-hosted, linux, x64, wizards-ci\]$/mu,
      jobName,
    );
  }

  for (const jobName of ["actionlint", "typescript-native-shadow"]) {
    assert.match(
      readWorkflowJob(workflow, jobName),
      /^    runs-on: \[self-hosted, linux, x64, ci-fast\]$/mu,
      jobName,
    );
  }

  for (const label of ["wizards-ci", "playwright", "ci-fast", "mobile-release"]) {
    assert.match(actionlintConfig, new RegExp(`^    - ${label}$`, "mu"));
  }
  assert.match(semgrep, /\bdocker run\b/u);
});

test("scheduled mobile device evidence gate uses the heavy self-hosted Linux runner", () => {
  const workflow = readFileSync(
    join(root, ".github", "workflows", "mobile-redesign-device-gate-nightly.yml"),
    "utf8",
  );

  assert.match(workflow, /^    runs-on: \[self-hosted, linux, x64, wizards-ci\]$/mu);
  assert.doesNotMatch(workflow, /^    runs-on: ubuntu-/mu);
});

test("remaining workflow files use only registered local Linux runners", () => {
  const hostedRunner = /(?:ubuntu-(?:latest|\d+\.\d+)|windows-latest|macos-latest)/u;

  for (const workflowName of readdirSync(workflowsDirectory)) {
    if (!/\.ya?ml$/u.test(workflowName)) {
      continue;
    }

    const workflow = readFileSync(join(workflowsDirectory, workflowName), "utf8");
    assert.doesNotMatch(workflow, hostedRunner, workflowName);
  }

  assert.equal(existsSync(join(workflowsDirectory, "desktop-native-build.yml")), false);
  assert.equal(existsSync(join(workflowsDirectory, "desktop-release.yml")), false);
});

test("automatic Linux Desktop Ops runs fail-closed Clippy through the local command", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const desktopManifest = JSON.parse(
    readFileSync(join(root, "apps", "desktop", "package.json"), "utf8"),
  );
  const desktopOps = readWorkflowJob(workflow, "desktop-ops");
  const clippy = readWorkflowStep(desktopOps, "Lint Rust with Clippy");

  assert.equal(
    desktopManifest.scripts?.["lint:rust"],
    "cargo clippy --manifest-path ./src-tauri/Cargo.toml --locked --all-targets -- -D warnings",
  );
  assert.match(clippy, /^        run: pnpm --filter @wizards\/desktop lint:rust$/mu);
  assert.doesNotMatch(clippy, /continue-on-error|(?:-A|--cap-lints)\s+warnings/u);
});
