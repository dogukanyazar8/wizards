import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "../../..");

function readWorkflowJob(source, jobName) {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `  ${jobName}:`);

  assert.notEqual(start, -1, `Expected workflow job: ${jobName}`);

  const jobLines = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (/^  [\w-]+:\s*$/u.test(line)) {
      break;
    }
    jobLines.push(line);
  }

  return jobLines.join("\n");
}

test("desktop-native-build is path-filtered, SHA-pinned, and unsigned", async () => {
  const workflow = await readFile(
    path.join(workspaceRoot, ".github", "workflows", "desktop-native-build.yml"),
    "utf8",
  );

  assert.match(workflow, /^  pull_request:\r?\n    paths:/m);
  assert.match(workflow, /^  push:\r?\n    branches:/m);
  assert.match(workflow, /- "apps\/desktop\/\*\*"/);
  assert.match(workflow, /- "pnpm-lock\.yaml"/);
  assert.match(workflow, /^permissions:\r?\n  contents: read$/m);
  assert.match(workflow, /^  native-build:\r?\n/m);
  assert.match(workflow, /os: windows-latest/);
  assert.match(workflow, /os: macos-latest/);
  assert.match(workflow, /WHISPR_DESKTOP_UPDATER_ENABLED: "false"/);
  assert.match(workflow, /WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: "false"/);
  assert.match(workflow, /pnpm --filter @wizards\/desktop build:desktop -- --no-bundle/);
  assert.match(workflow, /Get-ChildItem .*whispr-desktop\.exe/);
  assert.doesNotMatch(workflow, /secrets\.|environment:|contents: write|publish/i);

  const actionReferences = [...workflow.matchAll(/^\s+uses:\s*[^@\s]+@([^\s#]+)/gmu)];
  assert.ok(actionReferences.length >= 5, "Expected checkout, pnpm, Node, Rust, and cache actions");
  assert.ok(
    actionReferences.every(([, reference]) => /^[a-f0-9]{40}$/u.test(reference)),
    "All desktop native build actions must be immutable SHA pins.",
  );
});

test("only the protected Windows release job receives signing secrets", async () => {
  const [ci, nativeBuild, release] = await Promise.all([
    readFile(path.join(workspaceRoot, ".github", "workflows", "ci.yml"), "utf8"),
    readFile(path.join(workspaceRoot, ".github", "workflows", "desktop-native-build.yml"), "utf8"),
    readFile(path.join(workspaceRoot, ".github", "workflows", "desktop-release.yml"), "utf8"),
  ]);
  const buildWindows = readWorkflowJob(release, "build-windows");
  const releaseWithoutBuildWindows = release.replace(buildWindows, "");

  assert.doesNotMatch(ci, /^  desktop-build:/m);
  assert.doesNotMatch(ci, /TAURI_SIGNING_PRIVATE_KEY|WINDOWS_CERTIFICATE_/);
  assert.doesNotMatch(nativeBuild, /TAURI_SIGNING_PRIVATE_KEY|WINDOWS_CERTIFICATE_|secrets\./);
  assert.match(
    buildWindows,
    /^    environment: desktop-\$\{\{ needs\.release-contract\.outputs\.release_ring \}\}$/m,
  );
  assert.match(buildWindows, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(buildWindows, /WINDOWS_CERTIFICATE_PFX_BASE64/);
  assert.doesNotMatch(releaseWithoutBuildWindows, /TAURI_SIGNING_PRIVATE_KEY|WINDOWS_CERTIFICATE_/);
});

test("protected R2 publishing uses the runner AWS CLI instead of an unpinned pip install", async () => {
  const release = await readFile(
    path.join(workspaceRoot, ".github", "workflows", "desktop-release.yml"),
    "utf8",
  );
  const publishRelease = readWorkflowJob(release, "publish-release");

  assert.doesNotMatch(publishRelease, /python -m pip install|pip install/i);
  assert.match(publishRelease, /command -v aws/);
  assert.match(publishRelease, /aws-cli\/2\.\*/);
  assert.match(publishRelease, /aws --version/);
});
