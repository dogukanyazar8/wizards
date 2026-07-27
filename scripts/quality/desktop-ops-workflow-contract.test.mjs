import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const workflowPath = join(root, ".github", "workflows", "ci.yml");

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

  assert.match(desktopOps, /\{"os":"ci-fast","staged":false\}/u);
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

test("ci-fast receives only Docker-free automatic CI jobs", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const actionlintConfig = readFileSync(join(root, ".github", "actionlint.yaml"), "utf8");
  const actionlint = readWorkflowJob(workflow, "actionlint");
  const semgrep = readWorkflowJob(workflow, "semgrep");
  const typeScriptCompatibility = readWorkflowJob(workflow, "typescript-native-shadow");

  assert.match(actionlintConfig, /^    - ci-fast$/mu);
  assert.match(actionlint, /^    runs-on: \[self-hosted, linux, x64, ci-fast\]$/mu);
  assert.match(typeScriptCompatibility, /^    runs-on: \[self-hosted, linux, x64, ci-fast\]$/mu);
  assert.match(semgrep, /^    runs-on: \[self-hosted, linux, x64, wizards-ci\]$/mu);
  assert.match(semgrep, /\bdocker run\b/u);
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
