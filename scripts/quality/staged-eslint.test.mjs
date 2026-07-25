import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const checkerPath = join(root, "scripts", "quality", "staged-eslint.mjs");
const gitLocalEnvironmentVariables = execFileSync("git", ["rev-parse", "--local-env-vars"], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);

function runGit(repository, args) {
  const environment = { ...process.env };
  for (const variable of gitLocalEnvironmentVariables) {
    delete environment[variable];
  }
  return execFileSync("git", args, { cwd: repository, encoding: "utf8", env: environment }).trim();
}

function createFixture(t) {
  const fixture = mkdtempSync(join(tmpdir(), "whispr-staged-eslint-"));
  t.after(() => rmSync(fixture, { force: true, recursive: true }));
  runGit(fixture, ["init", "--quiet"]);
  runGit(fixture, ["config", "core.autocrlf", "false"]);
  runGit(fixture, ["config", "user.email", "quality@whispr.invalid"]);
  runGit(fixture, ["config", "user.name", "Whispr Quality"]);
  mkdirSync(join(fixture, "apps", "web", "src"), { recursive: true });
  return fixture;
}

test("staged web lint succeeds without creating a snapshot when no lintable files are staged", async (t) => {
  const fixture = createFixture(t);
  const { checkStagedWebFiles, collectStagedWebFiles } = await import(
    pathToFileURL(checkerPath).href
  );

  assert.deepEqual(collectStagedWebFiles({ root: fixture }), []);
  assert.deepEqual(await checkStagedWebFiles({ root: fixture }), {
    checked: [],
    diagnostics: [],
    errorCount: 0,
    warningCount: 0,
  });
});

test("staged web lint snapshots source and flat config from the Git index", async (t) => {
  const fixture = createFixture(t);
  writeFileSync(
    join(fixture, "apps", "web", "eslint.config.mjs"),
    'export default [{ rules: { "no-undef": "error" } }];\n',
  );
  writeFileSync(join(fixture, "apps", "web", "package.json"), '{"type":"module"}\n');
  writeFileSync(join(fixture, "apps", "web", "src", "sample.ts"), "const stagedValue = 1;\n");
  runGit(fixture, ["add", "."]);

  writeFileSync(
    join(fixture, "apps", "web", "eslint.config.mjs"),
    'export default [{ rules: { "no-undef": "off" } }];\n',
  );
  writeFileSync(join(fixture, "apps", "web", "src", "sample.ts"), "const workingTreeValue = 2;\n");

  const { checkStagedWebFiles, collectStagedWebFiles } = await import(
    pathToFileURL(checkerPath).href
  );
  const files = collectStagedWebFiles({ root: fixture });
  const result = await checkStagedWebFiles({
    files,
    root: fixture,
    lint: async ({ cwd, files: snapshotFiles }) => {
      assert.deepEqual(snapshotFiles, ["eslint.config.mjs", "src/sample.ts"]);
      assert.equal(readFileSync(join(cwd, "src", "sample.ts"), "utf8"), "const stagedValue = 1;\n");
      assert.equal(
        readFileSync(join(cwd, "eslint.config.mjs"), "utf8"),
        'export default [{ rules: { "no-undef": "error" } }];\n',
      );
      return [];
    },
  });

  assert.deepEqual(files, ["eslint.config.mjs", "src/sample.ts"]);
  assert.deepEqual(result.checked, ["apps/web/eslint.config.mjs", "apps/web/src/sample.ts"]);
  assert.equal(result.errorCount, 0);
});

test("staged web lint excludes non-web and unsupported index files", async (t) => {
  const fixture = createFixture(t);
  mkdirSync(join(fixture, "apps", "mobile"), { recursive: true });
  writeFileSync(join(fixture, "apps", "web", "eslint.config.mjs"), "export default [];\n");
  writeFileSync(join(fixture, "apps", "web", "package.json"), '{"type":"module"}\n');
  writeFileSync(
    join(fixture, "apps", "web", "src", "checked.tsx"),
    "export const checked = true;\n",
  );
  writeFileSync(join(fixture, "apps", "web", "src", "ignored.txt"), "ignored\n");
  writeFileSync(join(fixture, "apps", "mobile", "screen.tsx"), "export const screen = true;\n");
  runGit(fixture, ["add", "."]);

  const { collectStagedWebFiles } = await import(pathToFileURL(checkerPath).href);
  assert.deepEqual(collectStagedWebFiles({ root: fixture }), [
    "eslint.config.mjs",
    "src/checked.tsx",
  ]);
});

test("staged web lint reports an index-only ESLint failure", async (t) => {
  const fixture = createFixture(t);
  writeFileSync(
    join(fixture, "apps", "web", "eslint.config.mjs"),
    'export default [{ rules: { "no-undef": "error" } }];\n',
  );
  writeFileSync(join(fixture, "apps", "web", "package.json"), '{"type":"module"}\n');
  writeFileSync(join(fixture, "apps", "web", "src", "sample.js"), "missingFromIndex();\n");
  runGit(fixture, ["add", "."]);

  writeFileSync(
    join(fixture, "apps", "web", "eslint.config.mjs"),
    'export default [{ rules: { "no-undef": "off" } }];\n',
  );
  writeFileSync(join(fixture, "apps", "web", "src", "sample.js"), "workingTreeOnly();\n");

  const { checkStagedWebFiles } = await import(pathToFileURL(checkerPath).href);
  const result = await checkStagedWebFiles({ root: fixture });

  assert.equal(result.errorCount, 1);
  assert.deepEqual(result.diagnostics, [
    {
      column: 1,
      line: 1,
      message: "'missingFromIndex' is not defined.",
      path: "apps/web/src/sample.js",
      ruleId: "no-undef",
      severity: 2,
    },
  ]);
});
