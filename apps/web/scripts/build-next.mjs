import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const JAVASCRIPT_CLI_EXTENSION = /\.(?:cjs|mjs|js)$/iu;
const PNPM_BUILD_ARGS = Object.freeze(["exec", "next", "build"]);

export function buildPnpmInvocation(environment, nodeExecutable = process.execPath) {
  const pnpmCli = environment.npm_execpath;
  if (!pnpmCli) {
    throw new Error("The production build must be launched through pnpm");
  }

  const args = [...PNPM_BUILD_ARGS];
  return JAVASCRIPT_CLI_EXTENSION.test(pnpmCli)
    ? { command: nodeExecutable, args: [pnpmCli, ...args] }
    : { command: pnpmCli, args };
}

function runNextBuild() {
  const buildEnvironment = {
    ...process.env,
    // Railway supplies DATABASE_URL at runtime. PrismaPg validates its URL at
    // module evaluation, while Next imports route modules during static build.
    // pg pools connect lazily, so this loopback value cannot reach a database.
    DATABASE_URL:
      process.env.DATABASE_URL ?? "postgresql://prisma:prisma@127.0.0.1:5432/wizards_build",
  };
  const invocation = buildPnpmInvocation(process.env);
  const result = spawnSync(invocation.command, invocation.args, {
    env: buildEnvironment,
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
