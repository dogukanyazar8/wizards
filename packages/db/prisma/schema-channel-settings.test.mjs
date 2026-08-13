import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

function modelBody(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${name} is missing`);
  return match[1];
}

describe("channel advanced settings schema", () => {
  it("removes NSFW state from current models", () => {
    assert.doesNotMatch(modelBody("Channel"), /\bisNsfw\b/);
    assert.doesNotMatch(modelBody("Server"), /\bisNsfw\b/);
    assert.doesNotMatch(modelBody("UserSettings"), /\bnsfwAllowed\b/);
  });

  it("keeps channel runtime settings with safe database defaults", () => {
    const channel = modelBody("Channel");
    assert.match(channel, /slowModeDelay\s+Int\s+@default\(0\)/);
    assert.match(channel, /bitrate\s+Int\s+@default\(64000\)/);
    assert.match(channel, /userLimit\s+Int\s+@default\(0\)/);
    assert.match(channel, /rtcRegion\s+String\?/);
    assert.match(channel, /videoQualityMode\s+VideoQualityMode\s+@default\(AUTO\)/);
  });

  it("ships a forward migration on the configured migration path", () => {
    const migrationName = readdirSync(join(prismaDir, "rebaseline-migrations"))
      .filter((name) => name.endsWith("_remove_nsfw_state"))
      .sort()
      .at(-1);
    assert.ok(migrationName, "remove_nsfw_state migration is missing");

    const sql = readFileSync(
      join(prismaDir, "rebaseline-migrations", migrationName, "migration.sql"),
      "utf8",
    );
    assert.match(sql, /ALTER TABLE "Channel" DROP COLUMN "isNsfw"/);
    assert.match(sql, /ALTER TABLE "Server" DROP COLUMN "isNsfw"/);
    assert.match(sql, /ALTER TABLE "UserSettings" DROP COLUMN "nsfwAllowed"/);
  });
});
