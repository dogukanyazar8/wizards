import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

const buildIdentityModule = path.join(__dirname, "mobile-android-build-identity.psm1");
const temporaryDirectories: string[] = [];
const windowsOnly = process.platform === "win32" ? it : it.skip;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function runGit(repository: string, ...args: readonly string[]): string {
  const result = spawnSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createRepository(): string {
  const repository = mkdtempSync(path.join(tmpdir(), "whispr-mobile-build-identity-"));
  temporaryDirectories.push(repository);
  runGit(repository, "init");
  runGit(repository, "config", "user.email", "build-identity@example.test");
  runGit(repository, "config", "user.name", "Build Identity Test");
  writeFileSync(path.join(repository, "fixture.txt"), "initial\n");
  runGit(repository, "add", "fixture.txt");
  runGit(repository, "commit", "-m", "fixture");
  return repository;
}

function setUatTrackingRef(repository: string, commit: string): void {
  runGit(repository, "update-ref", "refs/remotes/origin/uat", commit);
}

function invokeBuildIdentity(input: {
  readonly expectedCommit?: string;
  readonly repository: string;
  readonly statement: string;
}) {
  return spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        "Import-Module -Force $env:WHISPR_BUILD_IDENTITY_MODULE",
        input.statement,
      ].join("; "),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ...(input.expectedCommit ? { WHISPR_EXPECTED_COMMIT: input.expectedCommit } : {}),
        SOURCE_ROOT: input.repository,
        WHISPR_BUILD_IDENTITY_MODULE: buildIdentityModule,
      },
      windowsHide: true,
    },
  );
}

describe("mobile Android release build identity", () => {
  windowsOnly("returns the full HEAD SHA for a clean source repository", () => {
    const repository = createRepository();
    const expectedCommit = runGit(repository, "rev-parse", "--verify", "HEAD");
    const result = invokeBuildIdentity({
      repository,
      statement: "Get-WhisprCleanGitCommit -SourceRoot $env:SOURCE_ROOT",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expectedCommit);
  });

  windowsOnly("rejects a dirty source repository before a release snapshot", () => {
    const repository = createRepository();
    writeFileSync(path.join(repository, "untracked.txt"), "dirty\n");
    const result = invokeBuildIdentity({
      repository,
      statement: "Get-WhisprCleanGitCommit -SourceRoot $env:SOURCE_ROOT",
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /source must be clean/i);
  });

  windowsOnly("rejects a source commit that changed during workspace sync", () => {
    const repository = createRepository();
    const expectedCommit = runGit(repository, "rev-parse", "--verify", "HEAD");
    writeFileSync(path.join(repository, "fixture.txt"), "changed\n");
    runGit(repository, "add", "fixture.txt");
    runGit(repository, "commit", "-m", "changed");
    const result = invokeBuildIdentity({
      expectedCommit,
      repository,
      statement:
        "Assert-WhisprGitCommitUnchanged -SourceRoot $env:SOURCE_ROOT -ExpectedCommit $env:WHISPR_EXPECTED_COMMIT",
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /changed during workspace sync/i);
  });

  windowsOnly("rejects release builds that skip their source workspace sync", () => {
    const repository = createRepository();
    const result = invokeBuildIdentity({
      repository,
      statement: "Assert-WhisprReleaseBuildCanSync -BuildType release -SkipSync $true",
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /cannot use -SkipSync/i);
  });

  windowsOnly("starts Metro only for a debug build that did not opt out", () => {
    const repository = createRepository();
    const release = invokeBuildIdentity({
      repository,
      statement: "Test-WhisprShouldStartMetro -BuildType release -NoStartMetro $false",
    });
    const debug = invokeBuildIdentity({
      repository,
      statement: "Test-WhisprShouldStartMetro -BuildType debug -NoStartMetro $false",
    });

    assert.equal(release.status, 0, release.stderr);
    assert.equal(release.stdout.trim(), "False");
    assert.equal(debug.status, 0, debug.stderr);
    assert.equal(debug.stdout.trim(), "True");
  });

  windowsOnly("requires release source to be the current origin/uat commit", () => {
    const repository = createRepository();
    const expectedCommit = runGit(repository, "rev-parse", "--verify", "HEAD");
    runGit(repository, "branch", "-M", "uat");
    setUatTrackingRef(repository, expectedCommit);

    const valid = invokeBuildIdentity({
      expectedCommit,
      repository,
      statement:
        "Assert-WhisprUatReleaseProvenance -SourceRoot $env:SOURCE_ROOT -ExpectedCommit $env:WHISPR_EXPECTED_COMMIT",
    });
    assert.equal(valid.status, 0, valid.stderr);

    writeFileSync(path.join(repository, "fixture.txt"), "newer\n");
    runGit(repository, "add", "fixture.txt");
    runGit(repository, "commit", "-m", "newer");
    const divergent = invokeBuildIdentity({
      expectedCommit: runGit(repository, "rev-parse", "--verify", "HEAD"),
      repository,
      statement:
        "Assert-WhisprUatReleaseProvenance -SourceRoot $env:SOURCE_ROOT -ExpectedCommit $env:WHISPR_EXPECTED_COMMIT",
    });
    assert.notEqual(divergent.status, 0);
    assert.match(`${divergent.stdout}\n${divergent.stderr}`, /not at origin\/uat/i);
  });

  windowsOnly("rejects a release source that is not checked out on uat", () => {
    const repository = createRepository();
    const expectedCommit = runGit(repository, "rev-parse", "--verify", "HEAD");
    setUatTrackingRef(repository, expectedCommit);

    const result = invokeBuildIdentity({
      expectedCommit,
      repository,
      statement:
        "Assert-WhisprUatReleaseProvenance -SourceRoot $env:SOURCE_ROOT -ExpectedCommit $env:WHISPR_EXPECTED_COMMIT",
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /branch uat/i);
  });
});
