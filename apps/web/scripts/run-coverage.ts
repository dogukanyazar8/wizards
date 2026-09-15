import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pnpmInvocation } from "../../../scripts/quality/pnpm-invocation.mjs";
import {
  buildC8ReportEnv,
  buildC8ReportArgs,
  buildNodeCoverageEnv,
  type CoverageEnvironment,
  getApiE2ECoverageMode,
} from "../src/lib/e2e/coverage";
import { formatE2EEnvironmentValidation, validateE2EEnvironment } from "../src/lib/e2e/environment";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
const coverageTempDirectory = join(webRoot, "coverage", ".tmp", runId);

function toCliPath(path: string) {
  return relative(webRoot, path).split(sep).join("/");
}

function runCommand(
  label: string,
  command: string,
  args: string[],
  env: CoverageEnvironment = process.env,
) {
  console.info(`[coverage] ${label}`);

  const result = spawnSync(command, args, {
    cwd: webRoot,
    env: env as NodeJS.ProcessEnv,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.signal) {
    console.error(`${label} exited due to signal ${result.signal}.`);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPnpm(label: string, args: string[], env: CoverageEnvironment = process.env) {
  const invocation = pnpmInvocation(process.env.npm_execpath, args);
  runCommand(label, invocation.command, invocation.args, env);
}

mkdirSync(coverageTempDirectory, { recursive: true });

const coverageEnv = buildNodeCoverageEnv(process.env, coverageTempDirectory);

runCommand(
  "node unit/integration tests",
  process.execPath,
  ["scripts/run-node-tests.mjs", ...process.argv.slice(2)],
  coverageEnv,
);

const e2eValidation = validateE2EEnvironment(process.env);
const e2eMode = getApiE2ECoverageMode(e2eValidation, process.env);

if (e2eMode.mode === "run") {
  runPnpm(
    "API E2E tests with server V8 coverage",
    ["exec", "playwright", "test", "e2e/specs/api"],
    coverageEnv,
  );
} else if (e2eMode.mode === "fail") {
  console.error("[coverage] API E2E coverage is required but the E2E preflight failed.");
  console.error(formatE2EEnvironmentValidation(e2eValidation));
  process.exit(1);
} else {
  console.warn(
    `[coverage] Skipping API E2E coverage merge (${e2eMode.reason ?? "not available"}).`,
  );
  console.warn("[coverage] CI=true or WEB_COVERAGE_REQUIRE_API_E2E=1 fails this gate instead.");
}

runPnpm(
  "merged c8 report",
  [
    "exec",
    "c8",
    ...buildC8ReportArgs({
      reportsDir: "coverage",
      tempDirectory: toCliPath(coverageTempDirectory),
    }),
  ],
  buildC8ReportEnv(process.env),
);
