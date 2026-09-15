import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pnpmInvocation } from "./pnpm-invocation.mjs";

export const PROJECTS = Object.freeze({
  db: "packages/db/tsconfig.json",
  types: "packages/types/tsconfig.json",
  ui: "packages/ui/tsconfig.json",
  web: "apps/web/tsconfig.json",
  mobile: "apps/mobile/tsconfig.json",
});

const MODES = new Set(["build", "check", "watch"]);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function parseCheckerCount(value) {
  if (value === undefined) return 2;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new Error("TypeScript checker count must be an integer between 1 and 4");
  }
  return count;
}

export function parseProjectRunnerArgs(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = /^--(project|mode|checkers)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unknown argument: ${argument}`);
    const [, key, value] = match;
    if (values.has(key)) throw new Error(`Duplicate argument: --${key}`);
    values.set(key, value);
  }

  const project = values.get("project");
  const mode = values.get("mode");
  if (!Object.hasOwn(PROJECTS, project)) {
    throw new Error(`Unknown TypeScript project: ${project ?? "missing"}`);
  }
  if (!MODES.has(mode)) {
    throw new Error(`Unknown TypeScript project mode: ${mode ?? "missing"}`);
  }

  return {
    project,
    mode,
    checkers: parseCheckerCount(values.get("checkers")),
  };
}

export function buildCompilerArgs({ project, mode, checkers }) {
  if (!Object.hasOwn(PROJECTS, project)) throw new Error(`Unknown TypeScript project: ${project}`);
  if (!MODES.has(mode)) throw new Error(`Unknown TypeScript project mode: ${mode}`);
  const checkerCount = parseCheckerCount(String(checkers));
  const args = ["exec", "tsc", "-p", PROJECTS[project]];

  if (mode === "check") {
    args.push("--noEmit", "--incremental", "false", "--pretty", "false");
  } else if (mode === "build") {
    args.push("--incremental", "false", "--pretty", "false");
  } else {
    args.push("--watch", "--preserveWatchOutput");
  }

  args.push("--checkers", String(checkerCount));
  return args;
}

export function buildPnpmInvocation(environment, args) {
  const pnpmCli = environment.npm_execpath;
  if (!pnpmCli) throw new Error("TypeScript project runner must be launched through pnpm");
  return pnpmInvocation(pnpmCli, args);
}

function runPnpm(args, stdio = "inherit") {
  const invocation = buildPnpmInvocation(process.env, args);
  return spawnSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: stdio === "pipe" ? "utf8" : undefined,
    shell: false,
    stdio,
  });
}

export function runProjectCompiler(options) {
  const versionResult = runPnpm(["exec", "tsc", "--version"], "pipe");
  assert.equal(versionResult.status, 0, versionResult.stderr || versionResult.stdout);
  assert.equal(versionResult.stdout.trim(), "Version 7.0.2");

  const result = runPnpm(buildCompilerArgs(options));
  return result.status ?? 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = runProjectCompiler(parseProjectRunnerArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
