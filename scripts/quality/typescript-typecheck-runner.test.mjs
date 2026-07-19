import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runnerPath = resolve(root, "scripts", "quality", "typescript-typecheck-runner.mjs");

test("typecheck runner exposes distinct main and compatibility compiler contracts", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript typecheck runner is missing");
  const runner = await import(pathToFileURL(runnerPath));

  assert.deepEqual(runner.COMPILERS, {
    main: {
      executable: "tsc",
      version: "Version 7.0.2",
      report: "main-typecheck.json",
      supportsCheckers: true,
    },
    compat: {
      executable: "tsc6",
      version: "Version 6.0.3",
      report: "compatibility-typecheck.json",
      supportsCheckers: false,
    },
  });
});

test("typecheck runner covers all TypeScript projects exactly once", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript typecheck runner is missing");
  const runner = await import(pathToFileURL(runnerPath));

  assert.deepEqual(runner.TYPECHECK_PROJECTS, [
    { name: "db", tsconfig: "packages/db/tsconfig.json" },
    { name: "types", tsconfig: "packages/types/tsconfig.json" },
    { name: "ui", tsconfig: "packages/ui/tsconfig.json" },
    { name: "web", tsconfig: "apps/web/tsconfig.json" },
    { name: "mobile", tsconfig: "apps/mobile/tsconfig.json" },
  ]);
});

test("typecheck runner accepts only a known compiler and bounded checker count", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript typecheck runner is missing");
  const runner = await import(pathToFileURL(runnerPath));

  assert.deepEqual(runner.parseTypecheckArgs(["--compiler=main", "--checkers=1"]), {
    compiler: "main",
    checkers: 1,
  });
  assert.deepEqual(runner.parseTypecheckArgs(["--compiler=compat"]), {
    compiler: "compat",
    checkers: 2,
  });
  assert.throws(() => runner.parseTypecheckArgs([]), /compiler: missing/);
  assert.throws(() => runner.parseTypecheckArgs(["--compiler=nightly"]), /compiler: nightly/);
  assert.throws(
    () => runner.parseTypecheckArgs(["--compiler=main", "--checkers=0"]),
    /integer between 1 and 4/,
  );
  assert.throws(
    () => runner.parseTypecheckArgs(["--compiler=main", "--project=web"]),
    /Unknown argument/,
  );
});

test("typecheck runner builds compiler-specific no-emit arguments", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript typecheck runner is missing");
  const runner = await import(pathToFileURL(runnerPath));
  const web = runner.TYPECHECK_PROJECTS[3];

  assert.deepEqual(
    runner.buildTypecheckCompilerArgs({ compiler: "main", project: web, checkers: 1 }),
    [
      "exec",
      "tsc",
      "-p",
      "apps/web/tsconfig.json",
      "--noEmit",
      "--incremental",
      "false",
      "--pretty",
      "false",
      "--checkers",
      "1",
    ],
  );
  assert.deepEqual(
    runner.buildTypecheckCompilerArgs({ compiler: "compat", project: web, checkers: 2 }),
    [
      "exec",
      "tsc6",
      "-p",
      "apps/web/tsconfig.json",
      "--noEmit",
      "--incremental",
      "false",
      "--pretty",
      "false",
    ],
  );
});
