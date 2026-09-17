import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

  assert.match(desktopOps, /^    runs-on: ubuntu-24\.04$/mu);
  assert.doesNotMatch(desktopOps, /matrix\.os|windows-latest|macos-latest/u);
  assert.match(desktopOps, /Install Tauri Linux system dependencies/u);
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

test("automatic Linux CI jobs use GitHub-hosted runners", () => {
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
    assert.match(readWorkflowJob(workflow, jobName), /^    runs-on: ubuntu-24\.04$/mu, jobName);
  }

  for (const jobName of ["actionlint", "typescript-native-shadow"]) {
    assert.match(readWorkflowJob(workflow, jobName), /^    runs-on: ubuntu-24\.04$/mu, jobName);
  }

  assert.doesNotMatch(actionlintConfig, /self-hosted|ci-fast|wizards-ci/u);
  assert.match(semgrep, /\bdocker run\b/u);
});

test("scheduled mobile device evidence gate uses a GitHub-hosted Linux runner", () => {
  const workflow = readFileSync(
    join(root, ".github", "workflows", "mobile-redesign-device-gate-nightly.yml"),
    "utf8",
  );

  assert.match(workflow, /^    runs-on: ubuntu-24\.04$/mu);
  assert.doesNotMatch(workflow, /self-hosted/u);
});

test("desktop workflows use Windows hosted builds and manual protected publication", () => {
  const native = readFileSync(join(workflowsDirectory, "desktop-native-build.yml"), "utf8");
  const release = readFileSync(join(workflowsDirectory, "desktop-release.yml"), "utf8");
  assert.match(native, /runs-on: windows-2025/u);
  assert.doesNotMatch(native, /matrix|macos/u);
  assert.match(release, /runs-on: windows-2025/u);
  assert.match(release, /environment: desktop-/u);
  assert.doesNotMatch(release, /Require successful CI for this commit/u);
  assert.doesNotMatch(release, /head_sha=\$GITHUB_SHA&event=push/u);
  assert.doesNotMatch(release, /^  actions: read$/mu);
  assert.match(release, /--if-none-match "\*"/u);
  assert.doesNotMatch(release, /^  (push|pull_request|schedule):/mu);
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
