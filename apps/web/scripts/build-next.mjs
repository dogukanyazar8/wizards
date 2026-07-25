import { spawnSync } from "node:child_process";

const buildEnvironment = {
  ...process.env,
  // Railway supplies DATABASE_URL at runtime. PrismaPg validates its URL at
  // module evaluation, while Next imports route modules during static build.
  // pg pools connect lazily, so this loopback value cannot reach a database.
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://prisma:prisma@127.0.0.1:5432/wizards_build",
};
const pnpmCli = process.env.npm_execpath;
const invocation = pnpmCli
  ? { args: [pnpmCli, "exec", "next", "build"], command: process.execPath }
  : {
      args: ["exec", "next", "build"],
      command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    };

const result = spawnSync(invocation.command, invocation.args, {
  env: buildEnvironment,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

if (result.signal || result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
