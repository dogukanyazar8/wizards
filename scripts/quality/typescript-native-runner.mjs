import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

export const NATIVE_PROJECTS = Object.freeze([
  { name: "db", tsconfig: "packages/db/tsconfig.json" },
  { name: "types", tsconfig: "packages/types/tsconfig.json" },
  { name: "ui", tsconfig: "packages/ui/tsconfig.json" },
  { name: "web", tsconfig: "apps/web/tsconfig.json" },
  { name: "mobile", tsconfig: "apps/mobile/tsconfig.json" },
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const reportPath = join(root, "artifacts", "typescript", "native-typecheck.json");

export function parseCheckerCount(value) {
  if (value === undefined) return 2;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new Error("TypeScript native checker count must be an integer between 1 and 4");
  }
  return count;
}

export function buildCompilerArgs(project, checkers) {
  return [
    "exec",
    "tsc",
    "-p",
    project.tsconfig,
    "--noEmit",
    "--incremental",
    "false",
    "--pretty",
    "false",
    "--checkers",
    String(checkers),
  ];
}

export function buildPnpmInvocation(environment, args) {
  const pnpmCli = environment.npm_execpath;
  if (!pnpmCli) throw new Error("TypeScript native runner must be launched through pnpm");
  return { command: process.execPath, args: [pnpmCli, ...args] };
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

function parseArgs(argv) {
  let checkerValue;
  for (const argument of argv) {
    if (!argument.startsWith("--checkers=")) throw new Error(`Unknown argument: ${argument}`);
    checkerValue = argument.slice("--checkers=".length);
  }
  return { checkers: parseCheckerCount(checkerValue) };
}

export function runNativeTypecheck({ checkers }) {
  const versionResult = runPnpm(["exec", "tsc", "--version"], "pipe");
  assert.equal(versionResult.status, 0, versionResult.stderr || versionResult.stdout);
  const compilerVersion = versionResult.stdout.trim();
  assert.equal(compilerVersion, "Version 7.0.2");

  const generateResult = runPnpm(["--filter", "@wizards/db", "db:generate"]);
  if (generateResult.status !== 0) return generateResult.status ?? 1;

  const projects = [];
  for (const project of NATIVE_PROJECTS) {
    const startedAt = performance.now();
    const result = runPnpm(buildCompilerArgs(project, checkers));
    projects.push({
      name: project.name,
      tsconfig: project.tsconfig,
      durationMs: Math.round(performance.now() - startedAt),
      exitCode: result.status ?? 1,
    });
  }

  const report = {
    schemaVersion: 1,
    compilerVersion,
    checkers,
    generatedAt: new Date().toISOString(),
    projects,
    success: projects.every((project) => project.exitCode === 0),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report.success ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = runNativeTypecheck(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
