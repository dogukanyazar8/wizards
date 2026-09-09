import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

const migrationDir = readdirSync(join(prismaDir, "rebaseline-migrations")).find((entry) =>
  entry.endsWith("_server_screen"),
);
const migration = migrationDir
  ? readFileSync(join(prismaDir, "rebaseline-migrations", migrationDir, "migration.sql"), "utf8")
  : "";

function model(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${name} is missing`);
  return match[1];
}

describe("Sunucu screen schema", () => {
  it("ships the migration in the directory Prisma actually reads", () => {
    // Prisma reads `rebaseline-migrations`, not `prisma/migrations`. A migration in the wrong
    // folder never runs and nothing says so.
    assert.ok(migrationDir, "migration is missing from rebaseline-migrations");
    assert.ok(migration.length > 0);
  });

  describe("Server.iconColor (K2)", () => {
    it("is a nullable text column, because null means the old derivation", () => {
      assert.match(model("Server"), /iconColor\s+String\?/);
    });

    it("carries no default, so an untouched server keeps deriving its tone from the short name", () => {
      assert.doesNotMatch(model("Server"), /iconColor\s+String\?\s+@default/);
      assert.match(migration, /ADD COLUMN IF NOT EXISTS "iconColor" TEXT;/);
      assert.doesNotMatch(migration, /"iconColor" TEXT NOT NULL/);
    });

    it("is not backfilled", () => {
      // Backfilling would repaint every existing server's icon on deploy — a silent visual
      // migration nobody asked for.
      assert.doesNotMatch(migration, /UPDATE "Server"/);
    });
  });

  describe("Server.slowModeDelay (K2)", () => {
    it("is a non-null integer defaulting to zero", () => {
      assert.match(model("Server"), /slowModeDelay\s+Int\s+@default\(0\)/);
      assert.match(
        migration,
        /ADD COLUMN IF NOT EXISTS "slowModeDelay" INTEGER NOT NULL DEFAULT 0;/,
      );
    });

    it("shares its value set with the channel-level column that already exists", () => {
      // `max(server, channel)` only makes sense if both sides speak the same seconds.
      assert.match(model("Channel"), /slowModeDelay\s+Int\s+@default\(0\)/);
    });
  });

  describe("ban, timeout and targeted invite need no migration (K3)", () => {
    it("finds the ban table already in the schema", () => {
      assert.match(schema, /model ServerBan \{/);
      assert.doesNotMatch(migration, /CREATE TABLE/);
    });

    it("finds the timeout column already on the membership row", () => {
      assert.match(model("ServerMember"), /communicationDisabledUntil\s+DateTime\?/);
    });

    it("finds the targeted-invite column already on the invite row", () => {
      assert.match(model("ServerInvite"), /targetUserId\s+String\?/);
    });
  });

  describe("migration safety", () => {
    it("drops nothing", () => {
      assert.doesNotMatch(migration, /DROP TABLE/);
      assert.doesNotMatch(migration, /DROP COLUMN/);
      assert.doesNotMatch(migration, /RENAME/);
    });

    it("is re-runnable", () => {
      const columns = migration.match(/ADD COLUMN(?! IF NOT EXISTS)/g) ?? [];

      assert.deepEqual(columns, []);
    });

    it("carries its own timestamp, so ordering against the settings migration is decided", () => {
      // `20260825090000_settings_message_size_px` already owns that day's earlier slot; sharing a
      // timestamp would leave two migrations with an ambiguous apply order.
      assert.notEqual(migrationDir, "20260825090000_server_screen");
      assert.match(migrationDir ?? "", /^\d{14}_server_screen$/);
    });
  });
});
