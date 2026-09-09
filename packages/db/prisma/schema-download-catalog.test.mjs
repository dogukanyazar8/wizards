import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

function enumMembers(name) {
  const match = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  assert.ok(match, `enum ${name} is missing from schema.prisma`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("///"));
}

describe("download catalog schema", () => {
  it("declares the platform and delivery enums the window draws", () => {
    assert.deepEqual(enumMembers("DownloadPlatform"), [
      "WINDOWS",
      "MACOS",
      "LINUX",
      "ANDROID",
      "IOS",
    ]);
    assert.deepEqual(enumMembers("DownloadDelivery"), ["DIRECT", "STORE", "TESTFLIGHT"]);
  });

  it("keeps the catalog out of the mobile OTA artifact table", () => {
    const releaseArtifact = schema.match(/model ReleaseArtifact \{([\s\S]*?)\n\}/);
    assert.ok(releaseArtifact, "model ReleaseArtifact is missing");
    assert.match(releaseArtifact[1], /platform\s+MobileUpdatePlatform/);
    assert.doesNotMatch(releaseArtifact[1], /DownloadPlatform/);
  });

  it("stores both label languages and a nullable size, hash and build", () => {
    const model = schema.match(/model DownloadArtifact \{([\s\S]*?)\n\}/);
    assert.ok(model, "model DownloadArtifact is missing");

    assert.match(model[1], /channel\s+ReleaseChannel/);
    assert.match(model[1], /url\s+String\s+@db\.VarChar\(2048\)/);
    for (const column of ["extensionLabelTr", "extensionLabelEn", "metaLabelTr", "metaLabelEn"]) {
      assert.match(model[1], new RegExp(`${column}\\s+String\\s+@db\\.VarChar\\(120\\)`));
    }
    assert.match(model[1], /buildLabel\s+String\?/);
    assert.match(model[1], /sizeBytes\s+BigInt\?/);
    assert.match(model[1], /sha256\s+String\?\s+@db\.VarChar\(64\)/);
    assert.match(model[1], /publishedAt\s+DateTime\?/);
  });

  it("allows one current row per environment and platform, and indexes the published read", () => {
    const model = schema.match(/model DownloadArtifact \{([\s\S]*?)\n\}/);
    assert.ok(model);
    assert.match(model[1], /@@unique\(\[channel, platform\]\)/);
    assert.match(model[1], /@@index\(\[channel, publishedAt\]\)/);
  });

  it("ships the migration in the directory Prisma actually reads", () => {
    const live = readdirSync(join(prismaDir, "rebaseline-migrations"));
    const migration = live.find((entry) => entry.endsWith("_download_catalog"));
    assert.ok(migration, "migration is missing from rebaseline-migrations");
    assert.ok(
      migration > "20260825120000_server_screen",
      "migration must sort after the current last entry",
    );

    const sql = readFileSync(
      join(prismaDir, "rebaseline-migrations", migration, "migration.sql"),
      "utf8",
    );
    assert.match(sql, /CREATE TYPE "DownloadPlatform"/);
    assert.match(sql, /CREATE TYPE "DownloadDelivery"/);
    assert.match(sql, /CREATE TABLE "DownloadArtifact"/);
    assert.match(sql, /CREATE UNIQUE INDEX "DownloadArtifact_channel_platform_key"/);
    assert.match(sql, /CREATE INDEX "DownloadArtifact_channel_publishedAt_idx"/);
  });
});
