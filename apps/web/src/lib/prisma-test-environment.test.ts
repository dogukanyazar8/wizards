import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync(new URL("../../scripts/run-node-tests.mjs", import.meta.url), "utf8");

test("web unit test runner provides an adapter-safe URL without overriding caller configuration", () => {
  assert.match(
    runner,
    /DATABASE_URL:\s*process\.env\.DATABASE_URL\s*\?\?\s*"postgresql:\/\/prisma:prisma@127\.0\.0\.1:5432\/wizards_unit_tests"/,
  );
});

test("production build receives a temporary adapter-safe URL without changing runtime configuration", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts.build,
    "pnpm --filter @wizards/db db:generate && node scripts/build-next.mjs && pnpm run build:server",
  );

  const builder = readFileSync(new URL("../../scripts/build-next.mjs", import.meta.url), "utf8");
  assert.match(
    builder,
    /DATABASE_URL:\s*process\.env\.DATABASE_URL\s*\?\?\s*"postgresql:\/\/prisma:prisma@127\.0\.0\.1:5432\/wizards_build"/,
  );
});

test("externalized Prisma server runtime dependencies belong to the web package", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageJson.dependencies["@prisma/adapter-pg"], "7.9.0");
  assert.equal(packageJson.dependencies["@prisma/client"], "7.9.0");
  assert.equal(packageJson.dependencies.pg, "^8.22.0");
});
