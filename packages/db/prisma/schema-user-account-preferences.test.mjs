import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    prismaDir,
    "rebaseline-migrations",
    "20260813100000_user_account_preferences",
    "migration.sql",
  ),
  "utf8",
);

function enumMembers(name) {
  const match = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  assert.ok(match, `${name} enum is missing`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function modelBody(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\n\\}`));
  assert.ok(match, `${name} model is missing`);
  return match[1];
}

describe("user account preference schema", () => {
  it("keeps profile and presence policies independently typed", () => {
    assert.deepEqual(enumMembers("ProfileVisibility"), ["EVERYONE", "FRIENDS", "NOBODY"]);
    assert.deepEqual(enumMembers("PresenceVisibility"), ["EVERYONE", "FRIENDS", "NOBODY"]);
  });

  it("declares the approved regional and density values", () => {
    assert.deepEqual(enumMembers("UserDateFormat"), ["LOCALE", "DMY", "MDY", "YMD"]);
    assert.deepEqual(enumMembers("UserTimeFormat"), ["LOCALE", "H12", "H24"]);
    assert.deepEqual(enumMembers("InterfaceDensity"), ["COMFORTABLE", "COMPACT"]);
  });

  it("adds six fields with compatibility-preserving defaults and no index", () => {
    const settings = modelBody("UserSettings");

    assert.match(settings, /profileVisibility\s+ProfileVisibility\s+@default\(EVERYONE\)/);
    assert.match(settings, /presenceVisibility\s+PresenceVisibility\s+@default\(EVERYONE\)/);
    assert.match(settings, /timeZone\s+String\?/);
    assert.match(settings, /dateFormat\s+UserDateFormat\s+@default\(LOCALE\)/);
    assert.match(settings, /timeFormat\s+UserTimeFormat\s+@default\(LOCALE\)/);
    assert.match(settings, /interfaceDensity\s+InterfaceDensity\s+@default\(COMFORTABLE\)/);
    assert.doesNotMatch(settings, /@@index/);
  });

  it("ships an additive migration after the current rebaseline head", () => {
    assert.match(
      migration,
      /CREATE TYPE "ProfileVisibility" AS ENUM \('EVERYONE', 'FRIENDS', 'NOBODY'\)/,
    );
    assert.match(
      migration,
      /CREATE TYPE "PresenceVisibility" AS ENUM \('EVERYONE', 'FRIENDS', 'NOBODY'\)/,
    );
    assert.match(
      migration,
      /CREATE TYPE "UserDateFormat" AS ENUM \('LOCALE', 'DMY', 'MDY', 'YMD'\)/,
    );
    assert.match(migration, /CREATE TYPE "UserTimeFormat" AS ENUM \('LOCALE', 'H12', 'H24'\)/);
    assert.match(migration, /CREATE TYPE "InterfaceDensity" AS ENUM \('COMFORTABLE', 'COMPACT'\)/);
    assert.match(
      migration,
      /ADD COLUMN "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'EVERYONE'/,
    );
    assert.match(
      migration,
      /ADD COLUMN "presenceVisibility" "PresenceVisibility" NOT NULL DEFAULT 'EVERYONE'/,
    );
    assert.match(migration, /ADD COLUMN "timeZone" TEXT/);
    assert.match(migration, /ADD COLUMN "dateFormat" "UserDateFormat" NOT NULL DEFAULT 'LOCALE'/);
    assert.match(migration, /ADD COLUMN "timeFormat" "UserTimeFormat" NOT NULL DEFAULT 'LOCALE'/);
    assert.match(
      migration,
      /ADD COLUMN "interfaceDensity" "InterfaceDensity" NOT NULL DEFAULT 'COMFORTABLE'/,
    );
    assert.doesNotMatch(migration, /CREATE INDEX|UPDATE "UserSettings"|DROP /);
  });
});
