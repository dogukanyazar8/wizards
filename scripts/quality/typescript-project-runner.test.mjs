import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const runnerPath = resolve(root, "scripts", "quality", "typescript-project-runner.mjs");

test("project runner exposes the fixed repository project inventory", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript project runner is missing");
  const runner = await import(pathToFileURL(runnerPath));

  assert.deepEqual(runner.PROJECTS, {
    db: "packages/db/tsconfig.json",
    types: "packages/types/tsconfig.json",
    ui: "packages/ui/tsconfig.json",
    web: "apps/web/tsconfig.json",
    mobile: "apps/mobile/tsconfig.json",
  });
});

test("project runner accepts only bounded project compiler arguments", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript project runner is missing");
  const runner = await import(pathToFileURL(runnerPath));

  assert.deepEqual(
    runner.parseProjectRunnerArgs(["--project=web", "--mode=check", "--checkers=1"]),
    { project: "web", mode: "check", checkers: 1 },
  );
  assert.deepEqual(runner.parseProjectRunnerArgs(["--project=types", "--mode=watch"]), {
    project: "types",
    mode: "watch",
    checkers: 2,
  });
  assert.throws(
    () => runner.parseProjectRunnerArgs(["--project=../../secret", "--mode=check"]),
    /Unknown TypeScript project/,
  );
  assert.throws(
    () => runner.parseProjectRunnerArgs(["--project=web", "--mode=emitDeclarationOnly"]),
    /Unknown TypeScript project mode/,
  );
  assert.throws(
    () => runner.parseProjectRunnerArgs(["--project=web", "--mode=check", "--checkers=5"]),
    /integer between 1 and 4/,
  );
  assert.throws(
    () => runner.parseProjectRunnerArgs(["--project=web", "--mode=check", "--pretty=true"]),
    /Unknown argument/,
  );
});

test("project runner builds exact mode-specific TypeScript 7 arguments", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript project runner is missing");
  const runner = await import(pathToFileURL(runnerPath));

  assert.deepEqual(runner.buildCompilerArgs({ project: "web", mode: "check", checkers: 1 }), [
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
  ]);
  assert.deepEqual(runner.buildCompilerArgs({ project: "types", mode: "build", checkers: 2 }), [
    "exec",
    "tsc",
    "-p",
    "packages/types/tsconfig.json",
    "--incremental",
    "false",
    "--pretty",
    "false",
    "--checkers",
    "2",
  ]);
  assert.deepEqual(runner.buildCompilerArgs({ project: "ui", mode: "watch", checkers: 2 }), [
    "exec",
    "tsc",
    "-p",
    "packages/ui/tsconfig.json",
    "--watch",
    "--preserveWatchOutput",
    "--checkers",
    "2",
  ]);
});

test("project runner invokes trusted pnpm without a command shell", async () => {
  assert.ok(existsSync(runnerPath), "TypeScript project runner is missing");
  const runner = await import(pathToFileURL(runnerPath));

  assert.deepEqual(
    runner.buildPnpmInvocation({ npm_execpath: "C:/pnpm/pnpm.cjs" }, ["exec", "tsc"]),
    {
      command: process.execPath,
      args: ["C:/pnpm/pnpm.cjs", "exec", "tsc"],
    },
  );
  assert.throws(() => runner.buildPnpmInvocation({}, []), /must be launched through pnpm/);
});
