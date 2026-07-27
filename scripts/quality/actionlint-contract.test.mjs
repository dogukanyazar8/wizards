import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const runnerPath = join(root, "scripts", "quality", "actionlint.mjs");

function runActionlint(workflowPath) {
  return spawnSync(process.execPath, [runnerPath, workflowPath], {
    cwd: root,
    encoding: "utf8",
  });
}

function withWorkflowFixture(source, assertion) {
  const directory = mkdtempSync(join(tmpdir(), "wizards-actionlint-"));
  const workflowPath = join(directory, "workflow.yml");
  writeFileSync(workflowPath, source, "utf8");

  try {
    assertion(workflowPath);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("actionlint command rejects invalid GitHub Action input, output, and expression", () => {
  withWorkflowFixture(
    `name: Invalid actionlint fixture

on: push

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - id: setup
        uses: actions/setup-node@v5
        with:
          node_version: "24"
      - run: echo "\${{ steps.setup.outputs.cache_miss }}"
      - if: \${{ matrix.platform == 'linux' }}
        run: echo invalid
`,
    (workflowPath) => {
      const result = runActionlint(workflowPath);
      const output = `${result.stdout}\n${result.stderr}`;

      assert.notEqual(result.status, 0, result.stdout);
      assert.match(output, /input "node_version" is not defined/u);
      assert.match(output, /property "cache_miss" is not defined/u);
      assert.match(output, /property "platform" is not defined/u);
    },
  );
});

test("actionlint command accepts a valid workflow fixture", () => {
  withWorkflowFixture(
    `name: Valid actionlint fixture

on: push

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - id: setup
        uses: actions/setup-node@v5
        with:
          node-version: "24"
      - run: echo "\${{ steps.setup.outputs.cache-hit }}"
`,
    (workflowPath) => {
      const result = runActionlint(workflowPath);

      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    },
  );
});
