import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "pg";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const historicalMigrationsDirectory = resolve(packageRoot, "prisma", "migrations");
const baselineMigration = "20260725000000_uat_schema_baseline";
const confirmation = "rebaseline-uat-migration-history-20260725";
const recoveryConfirmation = "recover-interrupted-uat-migration-history-20260725";

function executable(name) {
  if (name !== "prisma") {
    throw new Error(`Unsupported executable: ${name}`);
  }
  return resolve(packageRoot, "node_modules", "prisma", "build", "index.js");
}

function readArtifact(path, name) {
  if (!path || !existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0) {
    throw new Error(`${name} must point to a non-empty, pre-captured UAT artifact.`);
  }
}

function readOptions(environment) {
  if (environment.PRISMA_UAT_REBASELINE_CONFIRM !== confirmation) {
    throw new Error(
      `Set PRISMA_UAT_REBASELINE_CONFIRM=${confirmation} to permit the metadata switch.`,
    );
  }

  const connectionString = environment.PRISMA_UAT_REBASELINE_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("PRISMA_UAT_REBASELINE_DATABASE_URL is required.");
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("PRISMA_UAT_REBASELINE_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("PRISMA_UAT_REBASELINE_DATABASE_URL must be a direct PostgreSQL URL.");
  }

  const expectedDatabase = environment.PRISMA_UAT_REBASELINE_EXPECTED_DATABASE?.trim();
  if (!expectedDatabase) {
    throw new Error("PRISMA_UAT_REBASELINE_EXPECTED_DATABASE is required for target verification.");
  }

  readArtifact(environment.PRISMA_UAT_REBASELINE_SCHEMA_ARTIFACT_PATH, "schema artifact");
  readArtifact(
    environment.PRISMA_UAT_REBASELINE_HISTORY_ARTIFACT_PATH,
    "migration-history artifact",
  );

  return { connectionString, expectedDatabase };
}

function readRecoveryOptions(environment) {
  const providedConfirmation = environment.PRISMA_UAT_HISTORY_RECOVERY_CONFIRM?.trim();
  if (!providedConfirmation) {
    return null;
  }
  if (providedConfirmation !== recoveryConfirmation) {
    throw new Error(
      `Set PRISMA_UAT_HISTORY_RECOVERY_CONFIRM=${recoveryConfirmation} to permit the metadata recovery.`,
    );
  }

  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for UAT migration metadata recovery.");
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      "DATABASE_URL must be a valid PostgreSQL URL for UAT migration metadata recovery.",
    );
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(
      "DATABASE_URL must be a direct PostgreSQL URL for UAT migration metadata recovery.",
    );
  }

  const expectedDatabase = environment.PRISMA_UAT_HISTORY_RECOVERY_EXPECTED_DATABASE?.trim();
  if (!expectedDatabase) {
    throw new Error(
      "PRISMA_UAT_HISTORY_RECOVERY_EXPECTED_DATABASE is required for target verification.",
    );
  }

  return { connectionString, expectedDatabase };
}

function expectedHistoricalMigrations() {
  return readdirSync(historicalMigrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((migrationName) => ({
      checksum: createHash("sha256")
        .update(
          readFileSync(resolve(historicalMigrationsDirectory, migrationName, "migration.sql")),
        )
        .digest("hex"),
      migrationName,
    }));
}

function baselineChecksum() {
  return createHash("sha256")
    .update(
      readFileSync(
        resolve(packageRoot, "prisma", "rebaseline-migrations", baselineMigration, "migration.sql"),
      ),
    )
    .digest("hex");
}

function isCurrentBaseline(rows, checksum) {
  return (
    rows.length === 1 &&
    rows[0]?.migration_name === baselineMigration &&
    rows[0]?.checksum === checksum &&
    rows[0]?.finished_at !== null &&
    rows[0]?.rolled_back_at === null
  );
}

function isCompletedMigration(row) {
  return row.finished_at !== null && row.rolled_back_at === null;
}

export function isRecoverableInterruptedBaselineHistory(rows, checksum, expectedHistorical) {
  const baselineRows = rows.filter((row) => row.migration_name === baselineMigration);
  if (
    baselineRows.length !== 1 ||
    !isCompletedMigration(baselineRows[0]) ||
    baselineRows[0].checksum !== checksum
  ) {
    return false;
  }

  const historicalRows = rows
    .filter((row) => row.migration_name !== baselineMigration)
    .sort((left, right) => left.migration_name.localeCompare(right.migration_name));
  if (historicalRows.length === 0 || historicalRows.length > expectedHistorical.length) {
    return false;
  }

  return historicalRows.every((row, index) => {
    const expected = expectedHistorical[index];
    if (
      row.migration_name !== expected?.migrationName ||
      row.checksum !== expected.checksum ||
      row.rolled_back_at !== null
    ) {
      return false;
    }

    return index === historicalRows.length - 1
      ? row.finished_at === null
      : row.finished_at !== null;
  });
}

function assertExpectedHistoricalHistory(rows) {
  const actual = rows
    .map((row) => ({ checksum: row.checksum, migrationName: row.migration_name }))
    .sort((left, right) => left.migrationName.localeCompare(right.migrationName));
  const expected = expectedHistoricalMigrations();
  if (
    actual.length !== expected.length ||
    actual.some(
      (migration, index) =>
        migration.migrationName !== expected[index]?.migrationName ||
        migration.checksum !== expected[index]?.checksum,
    ) ||
    rows.some((row) => row.finished_at === null || row.rolled_back_at !== null)
  ) {
    throw new Error(
      `UAT migration history does not exactly match the expected ${expected.length} completed historical records; refusing metadata change.`,
    );
  }
}

function runPrisma(args, environment) {
  const result = spawnSync(process.execPath, [executable("prisma"), ...args], {
    cwd: packageRoot,
    env: environment,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `prisma ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`,
    );
  }
}

async function replaceHistoryWithBaseline(client, checksum) {
  await client.query('DELETE FROM public."_prisma_migrations"');
  await client.query(
    `INSERT INTO public."_prisma_migrations" (
      id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
    ) VALUES ($1, $2, clock_timestamp(), $3, '', NULL, clock_timestamp(), 0)`,
    [randomUUID(), checksum, baselineMigration],
  );
}

export async function rebaselineUatMigrationHistory(environment = process.env) {
  const options = readOptions(environment);
  const checksum = baselineChecksum();
  const client = new Client({ connectionString: options.connectionString });
  await client.connect();

  try {
    const identity = await client.query("SELECT current_database() AS database");
    if (identity.rows[0]?.database !== options.expectedDatabase) {
      throw new Error("Connected database does not match PRISMA_UAT_REBASELINE_EXPECTED_DATABASE.");
    }

    await client.query("BEGIN");
    try {
      await client.query('LOCK TABLE public."_prisma_migrations" IN ACCESS EXCLUSIVE MODE');
      const history = await client.query(
        'SELECT checksum, finished_at, migration_name, rolled_back_at FROM public."_prisma_migrations" ORDER BY migration_name',
      );

      if (!isCurrentBaseline(history.rows, checksum)) {
        assertExpectedHistoricalHistory(history.rows);
        await replaceHistoryWithBaseline(client, checksum);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }

  const prismaEnvironment = { ...environment, DATABASE_URL: options.connectionString };
  runPrisma(["migrate", "status"], prismaEnvironment);
}

export async function recoverInterruptedUatMigrationHistory(environment = process.env) {
  const options = readRecoveryOptions(environment);
  if (!options) {
    console.log("UAT migration metadata recovery is disabled; skipping.");
    return;
  }

  const checksum = baselineChecksum();
  const client = new Client({ connectionString: options.connectionString });
  await client.connect();

  try {
    const identity = await client.query("SELECT current_database() AS database");
    if (identity.rows[0]?.database !== options.expectedDatabase) {
      throw new Error(
        "Connected database does not match PRISMA_UAT_HISTORY_RECOVERY_EXPECTED_DATABASE.",
      );
    }

    await client.query("BEGIN");
    try {
      await client.query('LOCK TABLE public."_prisma_migrations" IN ACCESS EXCLUSIVE MODE');
      const history = await client.query(
        'SELECT checksum, finished_at, migration_name, rolled_back_at FROM public."_prisma_migrations" ORDER BY migration_name',
      );

      if (!isCurrentBaseline(history.rows, checksum)) {
        if (
          !isRecoverableInterruptedBaselineHistory(
            history.rows,
            checksum,
            expectedHistoricalMigrations(),
          )
        ) {
          throw new Error(
            "UAT migration history is not the recognized interrupted historical replay; refusing metadata recovery.",
          );
        }
        await replaceHistoryWithBaseline(client, checksum);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }

  runPrisma(["migrate", "status"], environment);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const operation = process.argv.includes("--recover-interrupted")
    ? recoverInterruptedUatMigrationHistory
    : rebaselineUatMigrationHistory;
  operation().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
