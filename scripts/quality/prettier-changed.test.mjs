import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const checkerPath = join(root, "scripts", "quality", "prettier-changed.mjs");

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function runGit(repository, args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}

test("format scripts use the changed-file ratchet and CI enforces it", () => {
  const rootManifest = readJson("package.json");
  const workspaceContracts = [
    ["apps/web/package.json", "apps/web"],
    ["packages/db/package.json", "packages/db"],
    ["packages/types/package.json", "packages/types"],
    ["packages/ui/package.json", "packages/ui"],
  ];

  assert.equal(rootManifest.scripts.format, "node scripts/quality/prettier-changed.mjs");
  assert.match(rootManifest.scripts.ci, /&& pnpm format &&/);

  for (const [manifestPath, scope] of workspaceContracts) {
    assert.equal(
      readJson(manifestPath).scripts.format,
      `node ../../scripts/quality/prettier-changed.mjs --scope ${scope}`,
    );
  }

  const prettierConfig = readFileSync(join(root, "prettier.config.cjs"), "utf8");
  assert.match(prettierConfig, /^  endOfLine: "auto",$/m);

  const prettierIgnore = readFileSync(join(root, ".prettierignore"), "utf8");
  assert.match(prettierIgnore, /^pnpm-lock\.yaml$/m);
  assert.match(prettierIgnore, /^package-lock\.json$/m);
  assert.match(prettierIgnore, /^yarn\.lock$/m);
  assert.match(prettierIgnore, /^graphify-out\/$/m);

  const workflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /- name: Format\r?\n(?:.|\r?\n)*?run: pnpm format/);
  assert.match(workflow, /PRETTIER_BASE_REF:/);
});

test("checker reports only supported, non-ignored files with format drift", async (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "whispr-prettier-"));
  t.after(() => rmSync(fixture, { force: true, recursive: true }));

  writeFileSync(join(fixture, "prettier.config.cjs"), 'module.exports = { endOfLine: "auto" };\n');
  writeFileSync(join(fixture, ".prettierignore"), "ignored.ts\n");
  writeFileSync(join(fixture, "formatted.ts"), "const value = 1;\n");
  writeFileSync(join(fixture, "unformatted.ts"), "const value=1\n");
  writeFileSync(join(fixture, "ignored.ts"), "const ignored=true\n");
  writeFileSync(join(fixture, "unsupported.rs"), "fn main() {}\n");

  const { checkFiles } = await import(pathToFileURL(checkerPath).href);
  const result = await checkFiles({
    files: ["ignored.ts", "unsupported.rs", "formatted.ts", "unformatted.ts"],
    root: fixture,
  });

  assert.deepEqual(result.checked, ["formatted.ts", "unformatted.ts"]);
  assert.deepEqual(result.unformatted, ["unformatted.ts"]);
});

test("collector combines committed, staged, unstaged, and untracked changes", async (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "whispr-format-git-"));
  t.after(() => rmSync(fixture, { force: true, recursive: true }));

  runGit(fixture, ["init", "--quiet"]);
  runGit(fixture, ["config", "core.autocrlf", "false"]);
  runGit(fixture, ["config", "user.email", "quality@whispr.invalid"]);
  runGit(fixture, ["config", "user.name", "Whispr Quality"]);
  writeFileSync(join(fixture, "tracked.ts"), "export const tracked = 1;\n");
  writeFileSync(join(fixture, "committed.ts"), "export const committed = 1;\n");
  runGit(fixture, ["add", "."]);
  runGit(fixture, ["commit", "--quiet", "-m", "baseline"]);
  const base = runGit(fixture, ["rev-parse", "HEAD"]);

  writeFileSync(join(fixture, "committed.ts"), "export const committed = 2;\n");
  runGit(fixture, ["add", "committed.ts"]);
  runGit(fixture, ["commit", "--quiet", "-m", "committed change"]);
  writeFileSync(join(fixture, "tracked.ts"), "export const tracked = 2;\n");
  writeFileSync(join(fixture, "staged.ts"), "export const staged = true;\n");
  runGit(fixture, ["add", "staged.ts"]);
  mkdirSync(join(fixture, "nested"));
  writeFileSync(join(fixture, "nested", "untracked.ts"), "export const fresh = true;\n");

  const { collectChangedFiles, filterFilesByScope } = await import(pathToFileURL(checkerPath).href);
  const files = collectChangedFiles({ base, root: fixture });

  assert.deepEqual(files, ["committed.ts", "nested/untracked.ts", "staged.ts", "tracked.ts"]);
  assert.deepEqual(filterFilesByScope(files, "nested"), ["nested/untracked.ts"]);
});

test("CI fallback uses the previous commit when the event has no base SHA", async (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "whispr-format-ci-base-"));
  t.after(() => rmSync(fixture, { force: true, recursive: true }));

  runGit(fixture, ["init", "--quiet"]);
  runGit(fixture, ["config", "core.autocrlf", "false"]);
  runGit(fixture, ["config", "user.email", "quality@whispr.invalid"]);
  runGit(fixture, ["config", "user.name", "Whispr Quality"]);
  writeFileSync(join(fixture, "tracked.ts"), "export const tracked = 1;\n");
  runGit(fixture, ["add", "."]);
  runGit(fixture, ["commit", "--quiet", "-m", "uat baseline"]);
  const uatBase = runGit(fixture, ["rev-parse", "HEAD"]);

  writeFileSync(join(fixture, "tracked.ts"), "export const tracked = 2;\n");
  runGit(fixture, ["commit", "--quiet", "-am", "previous commit"]);
  const previousCommit = runGit(fixture, ["rev-parse", "HEAD"]);
  writeFileSync(join(fixture, "tracked.ts"), "export const tracked = 3;\n");
  runGit(fixture, ["commit", "--quiet", "-am", "scheduled head"]);
  runGit(fixture, ["update-ref", "refs/remotes/origin/uat", uatBase]);

  const { resolveBaseRef } = await import(pathToFileURL(checkerPath).href);
  const base = resolveBaseRef({
    environment: { GITHUB_ACTIONS: "true" },
    root: fixture,
  });

  assert.equal(base, previousCommit);
});
