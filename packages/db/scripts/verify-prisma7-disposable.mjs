import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "pg";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const confirmation = "run-disposable-prisma7-verification";
const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

function executable(name) {
  const entries = {
    prisma: ["prisma", "build", "index.js"],
    tsx: ["tsx", "dist", "cli.mjs"],
  };
  return resolve(packageRoot, "node_modules", ...entries[name]);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function assertDisposableDatabaseUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    const database = decodeURIComponent(url.pathname.slice(1));

    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !loopbackHosts.has(hostname) ||
      !/^[A-Za-z0-9_]+_prisma7_verify$/u.test(database)
    ) {
      throw new Error();
    }

    return { database, url };
  } catch {
    throw new Error(
      "PRISMA7_VERIFY_DATABASE_URL must use loopback PostgreSQL and a database ending in _prisma7_verify.",
    );
  }
}

function assertVerificationEnvironment(environment) {
  if (environment.PRISMA7_VERIFY_CONFIRM !== confirmation) {
    throw new Error(
      `Set PRISMA7_VERIFY_CONFIRM=${confirmation} to recreate the disposable database.`,
    );
  }

  if (!environment.SEED_DEMO_PASSWORD?.trim()) {
    throw new Error("SEED_DEMO_PASSWORD is required because Prisma 7 seeds only explicitly.");
  }
}

function run(command, args, environment) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: packageRoot,
    env: environment,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
}

function adminUrl(targetUrl) {
  const url = new URL(targetUrl);
  url.pathname = "/postgres";
  return url.toString();
}

async function recreateDatabase(target) {
  const client = new Client({ connectionString: adminUrl(target.url) });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [target.database],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(target.database)}`);
    await client.query(`CREATE DATABASE ${quoteIdentifier(target.database)}`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(target) {
  const client = new Client({ connectionString: adminUrl(target.url) });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [target.database],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(target.database)}`);
  } finally {
    await client.end();
  }
}

export async function verifyDisposableDatabase(environment = process.env) {
  assertVerificationEnvironment(environment);
  const rawUrl = environment.PRISMA7_VERIFY_DATABASE_URL;
  const target = assertDisposableDatabaseUrl(rawUrl ?? "");
  const commandEnvironment = {
    ...environment,
    DATABASE_URL: target.url.toString(),
  };

  await recreateDatabase(target);
  try {
    run(executable("prisma"), ["generate"], commandEnvironment);
    run(executable("prisma"), ["migrate", "deploy"], commandEnvironment);
    run(executable("prisma"), ["db", "seed"], commandEnvironment);
    run(executable("tsx"), ["scripts/disposable-query-smoke.ts"], commandEnvironment);
    run(executable("prisma"), ["migrate", "reset", "--force"], commandEnvironment);
    run(executable("prisma"), ["db", "seed"], commandEnvironment);
    run(executable("tsx"), ["scripts/disposable-query-smoke.ts"], commandEnvironment);
    run(executable("prisma"), ["migrate", "status"], commandEnvironment);
  } finally {
    if (environment.PRISMA7_VERIFY_KEEP_DATABASE !== "true") {
      await dropDatabase(target);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  verifyDisposableDatabase().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
