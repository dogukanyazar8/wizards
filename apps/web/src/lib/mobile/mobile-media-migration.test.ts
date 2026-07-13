import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "../../packages/db/prisma/migrations/20260713120000_add_mobile_media_upload_claims/migration.sql",
);

function readMigrationSql() {
  return readFileSync(migrationPath, "utf8");
}

describe("mobile media upload migration SQL", () => {
  it("creates the upload purpose enum, table, and unique storage-key contract", () => {
    const sql = readMigrationSql();

    assert.match(
      sql,
      /CREATE TYPE "MobileMediaUploadPurpose" AS ENUM \('PROFILE_AVATAR', 'SERVER_ICON'\);/,
    );
    assert.match(sql, /CREATE TABLE "MobileMediaUpload" \(/);
    assert.match(
      sql,
      /CREATE UNIQUE INDEX "MobileMediaUpload_storageKey_key" ON "MobileMediaUpload"\("storageKey"\);/,
    );
  });

  it("creates the owner, expiry, and cleanup lookup indexes", () => {
    const sql = readMigrationSql();

    assert.match(
      sql,
      /CREATE INDEX "MobileMediaUpload_ownerId_purpose_targetServerId_idx" ON "MobileMediaUpload"\("ownerId", "purpose", "targetServerId"\);/,
    );
    assert.match(
      sql,
      /CREATE INDEX "MobileMediaUpload_expiresAt_claimedAt_idx" ON "MobileMediaUpload"\("expiresAt", "claimedAt"\);/,
    );
    assert.match(
      sql,
      /CREATE INDEX "MobileMediaUpload_cleanupAfter_storageDeletedAt_idx" ON "MobileMediaUpload"\("cleanupAfter", "storageDeletedAt"\);/,
    );
  });

  it("enforces purpose, size, dimensions, and expiry invariants", () => {
    const sql = readMigrationSql();

    assert.match(
      sql,
      /CONSTRAINT "MobileMediaUpload_purpose_target_check" CHECK \(\("purpose" = 'PROFILE_AVATAR' AND "targetServerId" IS NULL\) OR \("purpose" = 'SERVER_ICON' AND "targetServerId" IS NOT NULL\)\)/,
    );
    assert.match(
      sql,
      /CONSTRAINT "MobileMediaUpload_size_check" CHECK \("sizeBytes" > 0 AND "sizeBytes" <= 4194304\)/,
    );
    assert.match(
      sql,
      /CONSTRAINT "MobileMediaUpload_dimensions_check" CHECK \("width" > 0 AND "height" > 0 AND "width" <= 4096 AND "height" <= 4096 AND \("width"::BIGINT \* "height"::BIGINT\) <= 16000000\)/,
    );
    assert.match(
      sql,
      /CONSTRAINT "MobileMediaUpload_expiry_check" CHECK \("expiresAt" > "createdAt"\)/,
    );
  });

  it("keeps cleanup records independent from owner and server lifecycles", () => {
    const sql = readMigrationSql();

    assert.doesNotMatch(sql, /\bFOREIGN\s+KEY\s*\(/i);
    assert.doesNotMatch(sql, /\bREFERENCES\s+"(?:User|Server)"\s*\(/i);
    assert.doesNotMatch(sql, /ALTER TABLE "(?:Attachment|User|Server)"/i);
  });
});
