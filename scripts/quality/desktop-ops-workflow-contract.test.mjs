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

test("Windows certificate signing is opt-in independently of signed updater distribution", () => {
  const workflow = readFileSync(join(root, ".github", "workflows", "desktop-release.yml"), "utf8");
  const windowsJob = readWorkflowJob(workflow, "build-windows");
  assert.match(workflow, /windows_signing:\s+default: false[\s\S]*?type: boolean/u);
  assert.match(
    windowsJob,
    /WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: \$\{\{ inputs\.windows_signing && 'true' \|\| 'false' \}\}/u,
  );
  const signingGuard = readWorkflowStep(
    windowsJob,
    "Require Windows code signing configuration when requested",
  );
  assert.match(signingGuard, /if: env\.WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED == 'true'/u);
  assert.match(signingGuard, /WINDOWS_CERTIFICATE_PFX_BASE64/u);
  assert.match(signingGuard, /WINDOWS_CERTIFICATE_PASSWORD/u);
  assert.match(signingGuard, /WHISPR_DESKTOP_RELEASE_RING -eq "stable"/u);
  const updaterGuard = readWorkflowStep(
    windowsJob,
    "Require updater signing configuration when updater artifacts are requested",
  );
  assert.doesNotMatch(updaterGuard, /WINDOWS_CERTIFICATE|WINDOWS_SIGNING/u);
  for (const required of [
    "WHISPR_DESKTOP_UPDATER_PUBLIC_KEY",
    "TAURI_SIGNING_PRIVATE_KEY",
    "WHISPR_DESKTOP_UPDATER_ENDPOINTS",
  ]) {
    assert.ok(updaterGuard.includes(required), `${required} must remain required`);
  }
  const signArtifacts = readWorkflowStep(
    windowsJob,
    "Sign desktop artifacts without updater bundle signing",
  );
  assert.match(
    signArtifacts,
    /if: env\.WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED == 'true' && needs\.release-contract\.outputs\.enable_updater != 'true'/u,
  );
});

test("automatic Linux Desktop Ops runs its cargo audit step with Bash", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const desktopOps = readWorkflowJob(workflow, "desktop-ops");
  const cargoAudit = readWorkflowStep(desktopOps, "Audit Rust dependencies");

  assert.match(desktopOps, /^    runs-on: ubuntu-24\.04$/mu);
  assert.doesNotMatch(desktopOps, /matrix\.os|windows-latest|macos-latest/u);
  assert.match(desktopOps, /Install Tauri Linux system dependencies/u);
  assert.match(cargoAudit, /^        shell: bash$/mu);
  const install = readWorkflowStep(desktopOps, "Install and verify cargo-audit");
  assert.match(install, /expected_version="cargo-audit \$CARGO_AUDIT_VERSION"/u);
  assert.match(
    install,
    /cargo install cargo-audit --version "\$CARGO_AUDIT_VERSION" --locked --root "\$CARGO_AUDIT_ROOT" --force/u,
  );
  assert.match(
    install,
    /test "\$\("\$CARGO_AUDIT_ROOT\/bin\/cargo-audit" --version\)" = "\$expected_version"/u,
  );
  assert.match(
    cargoAudit,
    /^          cargo metadata --locked --format-version 1 --no-deps > \/dev\/null$/mu,
  );
  assert.match(
    cargoAudit,
    /^          "\$CARGO_AUDIT_ROOT\/bin\/cargo-audit" audit --file Cargo\.lock$/mu,
  );
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

test("Linux CI retains backtrace lines without full debug symbols or weaker checks", () => {
  const desktopOps = readWorkflowJob(readFileSync(workflowPath, "utf8"), "desktop-ops");
  for (const profile of ["DEV", "TEST"]) {
    assert.match(
      desktopOps,
      new RegExp(`^      CARGO_PROFILE_${profile}_DEBUG: "line-tables-only"$`, "mu"),
    );
  }
  assert.doesNotMatch(
    desktopOps,
    /CARGO_PROFILE_\w+_(?:DEBUG_ASSERTIONS|OVERFLOW_CHECKS|OPT_LEVEL)|RUSTFLAGS/u,
  );
});

test("Linux CI releases debug artifacts only after debug checks and before release compilation", () => {
  const desktopOps = readWorkflowJob(readFileSync(workflowPath, "utf8"), "desktop-ops");
  const cleanup = readWorkflowStep(desktopOps, "Release debug build disk space");
  assert.match(cleanup, /working-directory: apps\/desktop\/src-tauri/u);
  assert.match(cleanup, /^          cargo clean --profile dev$/mu);
  assert.doesNotMatch(cleanup, /--release|rm\s+-rf|continue-on-error/u);
  const steps = [
    "Test Rust",
    "Lint Rust with Clippy",
    "Release debug build disk space",
    "Test GLib security backport with optimizations",
    "Build unsigned desktop native signal",
  ];
  for (let index = 1; index < steps.length; index += 1) {
    assert.ok(
      desktopOps.indexOf(`- name: ${steps[index - 1]}\n`) <
        desktopOps.indexOf(`- name: ${steps[index]}\n`),
    );
  }
  assert.match(
    readWorkflowStep(desktopOps, steps[3]),
    /cargo test --locked --release --test glib_variant_security/u,
  );
});

test("Linux CI records disk usage even after a failed build", () => {
  const desktopOps = readWorkflowJob(readFileSync(workflowPath, "utf8"), "desktop-ops");
  assert.match(readWorkflowStep(desktopOps, "Record initial desktop disk space"), /run: df -h \./u);
  const finalDisk = readWorkflowStep(desktopOps, "Record final desktop disk space");
  assert.match(finalDisk, /if: always\(\)/u);
  assert.match(finalDisk, /run: df -h \./u);
  assert.ok(
    desktopOps.indexOf("- name: Record final desktop disk space") >
      desktopOps.indexOf("- name: Build unsigned desktop native signal"),
  );
});
