import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pnpmInvocation } from "../../../scripts/quality/pnpm-invocation.mjs";

const PNPM_BUILD_ARGS = Object.freeze(["exec", "next", "build"]);

export function buildPnpmInvocation(environment, nodeExecutable = process.execPath) {
  const pnpmCli = environment.npm_execpath;
  if (!pnpmCli) {
    throw new Error("The production build must be launched through pnpm");
  }

  return pnpmInvocation(pnpmCli, PNPM_BUILD_ARGS, nodeExecutable);
}

export function buildNextEnvironment(environment) {
  return {
    ...environment,
    // Next's TS6 worker exceeds the hosted runner's default 2 GiB heap.
    // Later operator options take precedence over this build-only default.
    NODE_OPTIONS: `--max-old-space-size=4096 ${environment.NODE_OPTIONS ?? ""}`.trim(),
    // Railway supplies DATABASE_URL at runtime. PrismaPg validates its URL at
    // module evaluation, while Next imports route modules during static build.
    // pg pools connect lazily, so this loopback value cannot reach a database.
    DATABASE_URL:
      environment.DATABASE_URL ?? "postgresql://prisma:prisma@127.0.0.1:5432/wizards_build",
  };
}

function runNextBuild() {
  const invocation = buildPnpmInvocation(process.env);
  const result = spawnSync(invocation.command, invocation.args, {
    env: buildNextEnvironment(process.env),
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal || result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runNextBuild();
}
