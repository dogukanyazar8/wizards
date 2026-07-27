import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(resolve(packageRoot, relativePath), "utf8");
const BASELINE_MIGRATION = "20260725000000_uat_schema_baseline";
const FEEDBACK_ATTACHMENT_MIGRATION =
  "20260727130000_allow_feedback_attachment_uploads/migration.sql";
const TELEMETRY_PLATFORM_DIMS_MIGRATION = "20260727150000_telemetry_platform_dims/migration.sql";

test("uses Prisma 7 ESM generation, central CLI configuration, and explicit seed", () => {
  const schema = read("prisma/schema.prisma");
  const config = read("prisma.config.ts");
  const packageJson = JSON.parse(read("package.json"));

  assert.match(schema, /provider\s*=\s*"prisma-client"/);
  assert.match(schema, /output\s*=\s*"\.\.\/src\/generated\/prisma"/);
  assert.doesNotMatch(schema, /^\s*url\s*=/m);
  assert.match(config, /path:\s*"prisma\/rebaseline-migrations"/);
  assert.match(config, /seed:\s*"tsx src\/seed\.ts"/);
  assert.equal(packageJson.scripts["db:seed"], "prisma db seed");
  assert.equal(packageJson.scripts["prisma:ensure-runtime"], undefined);
});

/**
 * `prisma.config.ts` moved the migrations path to `prisma/rebaseline-migrations`
 * when UAT was squashed, but `prisma/migrations` is still on disk as the frozen
 * pre-baseline archive. A new migration written into the archive is silently
 * never applied — the schema typechecks, the tests pass, and the table simply
 * does not exist at runtime. That is exactly how the feedback tables shipped
 * missing, so the two directories are now checked against each other.
 */
test("every post-baseline migration lives on the path Prisma actually reads", () => {
  const config = read("prisma.config.ts");
  const [, configuredPath] = /path:\s*"([^"]+)"/.exec(config) ?? [];
  assert.equal(configuredPath, "prisma/rebaseline-migrations");

  const archived = readdirSync(resolve(packageRoot, "prisma/migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const live = readdirSync(resolve(packageRoot, configuredPath), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(live.includes(BASELINE_MIGRATION), "the baseline must stay on the live path");
  // The archive is frozen at the rebaseline point: nothing newer belongs there.
  const strandedNewerThanBaseline = archived.filter((name) => name > BASELINE_MIGRATION);
  assert.deepEqual(
    strandedNewerThanBaseline,
    [],
    `migrations newer than the baseline must live in ${configuredPath}, not prisma/migrations`,
  );
});

test("contains a replayable current-state baseline with raw PostgreSQL objects", () => {
  const baseline = read(
    "prisma/rebaseline-migrations/20260725000000_uat_schema_baseline/migration.sql",
  );

  assert.match(baseline, /GENERATED ALWAYS AS \(to_tsvector/);
  assert.doesNotMatch(baseline, /\\'/);
  assert.match(baseline, /message_content_search_idx/);
  assert.match(baseline, /MobileMediaUpload_purpose_target_check/);
  assert.equal(
    createHash("sha256").update(baseline).digest("hex"),
    "2c2f7a362e52f38d7a4bb74844e3f84479b987717d0310677f9b40fa9a9b22f3",
  );
});

test("allows feedback attachments only as owner-scoped mobile uploads", () => {
  const migration = read(`prisma/rebaseline-migrations/${FEEDBACK_ATTACHMENT_MIGRATION}`);

  assert.match(migration, /DROP CONSTRAINT "MobileMediaUpload_purpose_target_check";/);
  assert.match(
    migration,
    /"purpose" IN \('PROFILE_AVATAR', 'PROFILE_BANNER', 'FEEDBACK_ATTACHMENT'\)\s*AND "targetServerId" IS NULL/,
  );
  assert.match(migration, /"purpose" = 'SERVER_ICON'\s*AND "targetServerId" IS NOT NULL/);
});

test("replaces the baseline UserDailyMetric unique index by index kind", () => {
  const migration = read(`prisma/rebaseline-migrations/${TELEMETRY_PLATFORM_DIMS_MIGRATION}`);

  assert.match(migration, /^DROP INDEX "UserDailyMetric_date_userId_key";$/m);
  assert.doesNotMatch(migration, /DROP CONSTRAINT "UserDailyMetric_date_userId_key"/);
});

test("exposes Prisma enums to browser code without exporting the Node adapter", () => {
  const packageJson = JSON.parse(read("package.json"));
  const browser = read("src/browser.ts");

  assert.equal(packageJson.exports["./browser"], "./src/browser.ts");
  assert.match(browser, /from "\.\/generated\/prisma\/browser"/);
  assert.doesNotMatch(browser, /from "[^\"]*(?:adapter-pg|client-factory)[^\"]*"/);
  assert.doesNotMatch(browser, /new PrismaClient/);
});
