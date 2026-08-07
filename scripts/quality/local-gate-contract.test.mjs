import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const profilesPath = join(root, "scripts", "quality", "local-gate-profiles.json");
const runnerPath = join(root, "scripts", "quality", "Invoke-LocalGate.ps1");
const hooksInstallerPath = join(root, "scripts", "quality", "Install-LocalGateHooks.ps1");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("local quality profiles are declarative, complete, and shell-free", () => {
  assert.ok(existsSync(profilesPath), "missing local quality profile registry");
  const profiles = readJson(profilesPath);
  const requiredProfiles = [
    "Fast",
    "Standard",
    "CI",
    "Mobile",
    "Desktop",
    "MobileRelease",
    "Security",
    "E2ESmoke",
    "E2EApi",
    "E2ERealtime",
    "E2EFull",
  ];

  assert.equal(profiles.schemaVersion, 1);
  assert.deepEqual(Object.keys(profiles.profiles), requiredProfiles);

  for (const [profileName, profile] of Object.entries(profiles.profiles)) {
    assert.equal(typeof profile.description, "string", `${profileName} description`);
    assert.equal(typeof profile.estimatedImpact, "string", `${profileName} estimated impact`);
    assert.ok(Array.isArray(profile.steps) && profile.steps.length > 0, `${profileName} steps`);

    for (const step of profile.steps) {
      assert.equal(typeof step.id, "string", `${profileName} step id`);
      assert.equal(typeof step.executable, "string", `${profileName} executable`);
      assert.ok(Array.isArray(step.arguments), `${profileName} arguments`);
      assert.ok(
        step.arguments.every((argument) => typeof argument === "string"),
        `${profileName} args`,
      );
      assert.equal(step.command, undefined, `${profileName} must not define a shell command`);
      assert.doesNotMatch(JSON.stringify(step), /(?:cmd\s*\/c|\||&&|;|Invoke-Expression)/iu);
    }
  }

  assert.deepEqual(
    profiles.profiles.Fast.steps.map((step) => [step.executable, step.arguments]),
    [
      ["git", ["diff", "--cached", "--check"]],
      ["pnpm", ["actionlint"]],
      ["pnpm", ["test:toolchain"]],
      ["node", ["scripts/quality/prettier-changed.mjs", "--staged"]],
      ["node", ["scripts/quality/staged-eslint.mjs"]],
    ],
  );
  assert.deepEqual(
    profiles.profiles.CI.steps.map((step) => [step.executable, step.arguments]),
    [["pnpm", ["ci"]]],
  );
  assert.deepEqual(
    profiles.profiles.Security.steps.map((step) => [step.executable, step.arguments]),
    [["node", ["scripts/quality/e2e-password-guard.mjs"]]],
  );
  assert.deepEqual(
    profiles.profiles.Desktop.steps.map((step) => [step.executable, step.arguments]),
    [
      ["pnpm", ["--filter", "@wizards/desktop", "test"]],
      [
        "cargo",
        ["fmt", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml", "--all", "--", "--check"],
      ],
      ["pnpm", ["--filter", "@wizards/desktop", "lint:rust"]],
      ["cargo", ["test", "--locked", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml"]],
    ],
  );
  assert.deepEqual(profiles.profiles.MobileRelease.steps, [
    {
      id: "android-uat-release",
      executable: "powershell",
      arguments: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "apps/mobile/scripts/build-android-uat.ps1",
        "-BuildType",
        "release",
        "-SkipInstall",
        "-SkipUninstall",
        "-NoStartMetro",
      ],
    },
  ]);
  assert.deepEqual(
    profiles.profiles.E2EFull.steps.map((step) => [step.executable, step.arguments]),
    [
      ["pnpm", ["e2e:seed"]],
      ["pnpm", ["e2e"]],
    ],
  );
  assert.deepEqual(
    profiles.profiles.E2EFull.preconditions.map((precondition) => precondition.type),
    [
      "repository",
      "nodeModules",
      "executable",
      "environment",
      "destructiveE2EDatabase",
      "loopbackTcpEnvironment",
    ],
  );
});

test("local gate runner, hook installer, hooks, and CI share the safe contracts", () => {
  assert.ok(existsSync(runnerPath), "missing local gate runner");
  assert.ok(existsSync(hooksInstallerPath), "missing hook installer");
  assert.ok(existsSync(join(root, ".githooks", "pre-commit")), "missing pre-commit hook");
  assert.ok(existsSync(join(root, ".githooks", "pre-push")), "missing pre-push hook");

  const runner = readFileSync(runnerPath, "utf8");
  const installer = readFileSync(hooksInstallerPath, "utf8");
  const preCommit = readFileSync(join(root, ".githooks", "pre-commit"), "utf8");
  const prePush = readFileSync(join(root, ".githooks", "pre-push"), "utf8");
  const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");

  assert.match(runner, /pnpm\.cmd/u);
  assert.match(runner, /corepack\.cmd/u);
  assert.match(
    runner,
    /\$pnpm = @\(Get-Command "pnpm\.cmd" -CommandType Application -ErrorAction SilentlyContinue\)\[0\]/u,
  );
  assert.match(runner, /\$previousNativeErrorAction = \$ErrorActionPreference/u);
  assert.match(runner, /fast-staged-eslint/u);
  assert.match(runner, /fast-actionlint/u);
  assert.match(runner, /\[ValidateSet\("Text", "Json"\)\]/u);
  assert.match(runner, /\[switch\]\$AllowMobileRelease/u);
  assert.match(runner, /\[switch\]\$AllowDestructiveE2E/u);
  assert.match(runner, /\[string\]\$EventStreamPath/u);
  assert.match(runner, /\$Profile -eq "MobileRelease" -and -not \$AllowMobileRelease/u);
  assert.match(runner, /\$Profile -eq "E2EFull" -and -not \$AllowDestructiveE2E/u);
  assert.match(runner, /ValidateSet\("git", "node", "pnpm", "powershell", "cargo"\)/u);
  assert.match(runner, /Resolve-EventStreamPath/u);
  assert.match(runner, /Write-GateEvent/u);
  assert.match(runner, /E2E_DATABASE_URL/u);
  assert.match(runner, /(?:whispr|wizards)_e2e|_e2e/u);
  assert.match(runner, /exit \$ExitCode/u);
  assert.doesNotMatch(runner, /Invoke-Expression|cmd\s*\/c|Start-Process/iu);
  assert.doesNotMatch(installer, /--local\s+core\.hooksPath/iu);
  assert.match(installer, /--worktree\s+core\.hooksPath/u);
  assert.ok(
    installer.indexOf('$worktreePath -and $worktreePath -cne ".githooks"') <
      installer.indexOf('if ($Action -eq "Install")'),
    "a foreign worktree hook path must block both install and uninstall",
  );
  assert.match(preCommit, /-Profile Fast/u);
  assert.match(prePush, /-Profile Fast/u);
  assert.match(
    workflow,
    /- name: Check E2E password guard\r?\n\s+run: node scripts\/quality\/e2e-password-guard\.mjs/u,
  );
  assert.doesNotMatch(workflow, /if grep -RE/u);
});
