import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROJECTS, buildPnpmInvocation, parseCheckerCount } from "./typescript-project-runner.mjs";

export const COMPILERS = Object.freeze({
  main: Object.freeze({
    executable: "tsc",
    version: "Version 7.0.2",
    report: "main-typecheck.json",
    supportsCheckers: true,
  }),
  compat: Object.freeze({
    executable: "tsc6",
    version: "Version 6.0.3",
    report: "compatibility-typecheck.json",
    supportsCheckers: false,
  }),
});

export const TYPECHECK_PROJECTS = Object.freeze(
  Object.entries(PROJECTS).map(([name, tsconfig]) => Object.freeze({ name, tsconfig })),
);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function parseTypecheckArgs(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = /^--(compiler|checkers)=(.+)$/.exec(argument);
    if (!match) throw new Error(`Unknown argument: ${argument}`);
    const [, key, value] = match;
    if (values.has(key)) throw new Error(`Duplicate argument: --${key}`);
    values.set(key, value);
  }

  const compiler = values.get("compiler");
  if (!Object.hasOwn(COMPILERS, compiler)) {
    throw new Error(`Unknown TypeScript compiler: ${compiler ?? "missing"}`);
  }

  return {
    compiler,
    checkers: parseCheckerCount(values.get("checkers")),
  };
}

export function buildTypecheckCompilerArgs({ compiler, project, checkers }) {
  if (!Object.hasOwn(COMPILERS, compiler)) {
    throw new Error(`Unknown TypeScript compiler: ${compiler}`);
  }
  const compilerContract = COMPILERS[compiler];
  const args = [
    "exec",
    compilerContract.executable,
    "-p",
    project.tsconfig,
    "--noEmit",
    "--incremental",
    "false",
    "--pretty",
    "false",
  ];
  if (compilerContract.supportsCheckers) {
    args.push("--checkers", String(parseCheckerCount(String(checkers))));
  }
  return args;
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

export function runTypecheck({ compiler, checkers }) {
  const compilerContract = COMPILERS[compiler];
  assert.ok(compilerContract, `Unknown TypeScript compiler: ${compiler}`);

  const versionResult = runPnpm(["exec", compilerContract.executable, "--version"], "pipe");
  assert.equal(versionResult.status, 0, versionResult.stderr || versionResult.stdout);
  const compilerVersion = versionResult.stdout.trim();
  assert.equal(compilerVersion, compilerContract.version);

  const generateResult = runPnpm(["--filter", "@wizards/db", "db:generate"]);
  if (generateResult.status !== 0) return generateResult.status ?? 1;

  const projects = [];
  for (const project of TYPECHECK_PROJECTS) {
    const startedAt = performance.now();
    const result = runPnpm(buildTypecheckCompilerArgs({ compiler, project, checkers }));
    projects.push({
      name: project.name,
      tsconfig: project.tsconfig,
      durationMs: Math.round(performance.now() - startedAt),
      exitCode: result.status ?? 1,
    });
  }

  const report = {
    schemaVersion: 1,
    compiler,
    compilerVersion,
    checkers: compilerContract.supportsCheckers ? checkers : null,
    generatedAt: new Date().toISOString(),
    projects,
    success: projects.every((project) => project.exitCode === 0),
  };
  const reportPath = join(root, "artifacts", "typescript", compilerContract.report);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  return report.success ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = runTypecheck(parseTypecheckArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
