import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

describe("server type and counter schema", () => {
  it("declares the ServerType enum with exactly two members", () => {
    const match = schema.match(/enum ServerType \{([^}]*)\}/);
    assert.ok(match, "ServerType enum is missing from schema.prisma");
    const members = match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    assert.deepEqual(members, ["PERSONAL", "COMMUNITY"]);
  });

  it("adds type and memberCount to Server with safe defaults", () => {
    const model = schema.match(/model Server \{([\s\S]*?)\n\}/);
    assert.ok(model, "model Server is missing");
    assert.match(model[1], /type\s+ServerType\s+@default\(PERSONAL\)/);
    assert.match(model[1], /memberCount\s+Int\s+@default\(0\)/);
    assert.match(model[1], /@@index\(\[type, discoverable, memberCount\]\)/);
  });

  it("ships the migration in the directory Prisma actually reads", () => {
    const live = readdirSync(join(prismaDir, "rebaseline-migrations"));
    const migration = live.find((entry) => entry.endsWith("_server_type_and_counters"));
    assert.ok(migration, "migration is missing from rebaseline-migrations");
    assert.ok(
      migration > "20260805100000_user_badges",
      "migration must sort after the current last entry",
    );

    const sql = readFileSync(
      join(prismaDir, "rebaseline-migrations", migration, "migration.sql"),
      "utf8",
    );
    assert.match(sql, /CREATE TYPE "ServerType"/);
    assert.match(sql, /ADD COLUMN "type" "ServerType" NOT NULL DEFAULT 'PERSONAL'/);
    assert.match(sql, /ADD COLUMN "memberCount" INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /UPDATE "Server"/);
    assert.match(sql, /CREATE INDEX/);
  });

  it("never places the migration in the stale directory", () => {
    const stale = readdirSync(join(prismaDir, "migrations"));
    assert.ok(
      !stale.some((entry) => entry.endsWith("_server_type_and_counters")),
      "migration landed in the stale migrations/ directory; Prisma will never run it",
    );
  });
});
