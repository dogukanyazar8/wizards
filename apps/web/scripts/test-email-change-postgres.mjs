import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbRoot = resolve(webRoot, "../../packages/db");
const name = `codex-email-change-${randomBytes(5).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const temp = mkdtempSync(join(tmpdir(), "whispr-email-change-"));
let started = false;
function run(command, args, env = process.env, cwd = webRoot) {
  const result = spawnSync(command, args, { env, cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr || result.error || result.stdout}`);
  return result.stdout.trim();
}

try {
  run(
    "docker",
    [
      "run",
      "--rm",
      "--detach",
      "--name",
      name,
      "--label",
      "whispr-test=email-change",
      "--env",
      "POSTGRES_PASSWORD",
      "--env",
      "POSTGRES_DB=email_change_disposable",
      "--publish",
      "127.0.0.1::5432",
      "postgres:18.6-bookworm",
    ],
    { ...process.env, POSTGRES_PASSWORD: password },
  );
  started = true;
  const port = run("docker", ["port", name, "5432/tcp"]).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (!port) throw new Error("Disposable PostgreSQL must bind only to loopback");
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (result.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not start");
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/email_change_disposable`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    AUTH_SECRET: randomBytes(32).toString("hex"),
    EMAIL_CHANGE_DISPOSABLE_TEST: "1",
  };
  delete env.NEXTAUTH_SECRET;
  // Build a disposable predecessor schema, then execute the exact delivery migration.
  const original = readFileSync(resolve(dbRoot, "prisma/schema.prisma"), "utf8");
  const schema = original
    .replace(/^\s*emailChangeChallenge\s+EmailChangeChallenge\?\s*$/m, "")
    .replace(/model EmailChangeChallenge \{[^}]*\}/u, "");
  if (schema === original || schema.includes("EmailChangeChallenge"))
    throw new Error("Predecessor schema extraction failed");
  const schemaPath = join(temp, "schema.prisma");
  writeFileSync(schemaPath, schema);
  run(
    process.execPath,
    [resolve(dbRoot, "node_modules/prisma/build/index.js"), "db", "push", "--schema", schemaPath],
    env,
    dbRoot,
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      readFileSync(
        resolve(
          dbRoot,
          "prisma/rebaseline-migrations/20260911120000_account_email_change/migration.sql",
        ),
        "utf8",
      ),
    );
  } finally {
    await client.end();
  }
  console.info("PASS: email change migration applied to disposable PostgreSQL");
  console.info(
    run(
      process.execPath,
      ["--import", "tsx", "--test", "--test-force-exit", "scripts/email-change-postgres.test.ts"],
      env,
    ),
  );
} finally {
  if (started) run("docker", ["rm", "--force", name]);
  // mkdtemp owns this exact directory; never derive a removal target from user input.
  if (!resolve(temp).startsWith(`${resolve(tmpdir())}${sep}whispr-email-change-`))
    throw new Error("Unexpected temporary directory");
  rmSync(temp, { recursive: true, force: true });
}
