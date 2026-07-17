import assert from "node:assert/strict";
import test from "node:test";
import {
  NATIVE_PROJECTS,
  buildCompilerArgs,
  buildPnpmInvocation,
  parseCheckerCount,
} from "./typescript-native-runner.mjs";

test("native project inventory covers every repository TypeScript project exactly once", () => {
  assert.deepEqual(NATIVE_PROJECTS, [
    { name: "db", tsconfig: "packages/db/tsconfig.json" },
    { name: "types", tsconfig: "packages/types/tsconfig.json" },
    { name: "ui", tsconfig: "packages/ui/tsconfig.json" },
    { name: "web", tsconfig: "apps/web/tsconfig.json" },
    { name: "mobile", tsconfig: "apps/mobile/tsconfig.json" },
  ]);
});

test("checker count accepts the bounded production range", () => {
  assert.equal(parseCheckerCount(undefined), 2);
  assert.equal(parseCheckerCount("1"), 1);
  assert.equal(parseCheckerCount("4"), 4);
  assert.throws(() => parseCheckerCount("0"), /between 1 and 4/);
  assert.throws(() => parseCheckerCount("2;rm"), /between 1 and 4/);
});

test("compiler arguments disable incremental output and pin worker count", () => {
  assert.deepEqual(buildCompilerArgs(NATIVE_PROJECTS[3], 1), [
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
});

test("pnpm invocation uses npm_execpath without a command shell", () => {
  assert.deepEqual(buildPnpmInvocation({ npm_execpath: "C:/pnpm/pnpm.cjs" }, ["exec", "tsc"]), {
    command: process.execPath,
    args: ["C:/pnpm/pnpm.cjs", "exec", "tsc"],
  });
  assert.throws(() => buildPnpmInvocation({}, []), /must be launched through pnpm/);
});
