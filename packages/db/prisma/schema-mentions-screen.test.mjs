import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

const migrationDir = readdirSync(join(prismaDir, "rebaseline-migrations")).find((entry) =>
  entry.endsWith("_mentions_screen"),
);
const migration = migrationDir
  ? readFileSync(join(prismaDir, "rebaseline-migrations", migrationDir, "migration.sql"), "utf8")
  : "";
const threadLifecycleMigrationDir = readdirSync(join(prismaDir, "rebaseline-migrations")).find(
  (entry) => entry.endsWith("_thread_lifecycle"),
);
const threadLifecycleMigration = threadLifecycleMigrationDir
  ? readFileSync(
      join(prismaDir, "rebaseline-migrations", threadLifecycleMigrationDir, "migration.sql"),
      "utf8",
    )
  : "";

function model(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${name} is missing`);
  return match[1];
}

function enumMembers(name) {
  const match = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  assert.ok(match, `enum ${name} is missing`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("///"));
}

describe("Bahsedilmeler screen schema", () => {
  it("ships the migration in the directory Prisma actually reads", () => {
    assert.ok(migrationDir, "migration is missing from rebaseline-migrations");
    assert.ok(migration.length > 0);
  });

  describe("mention kinds (K1, K2)", () => {
    it("names the three kinds a row can carry", () => {
      assert.deepEqual(enumMembers("MentionKind"), ["SELF", "ROLE", "THREAD"]);
    });

    it("has no EVERYONE member, because @everyone writes no row", () => {
      // K2: a mass mention is derived from Message.mentionEveryone. An EVERYONE member here
      // would invite exactly the per-member fan-out the decision rules out.
      assert.ok(!enumMembers("MentionKind").includes("EVERYONE"));
    });

    it("gives MessageMention kind and roleId", () => {
      const body = model("MessageMention");

      assert.match(body, /kind\s+MentionKind\s+@default\(SELF\)/);
      assert.match(body, /roleId\s+String\?/);
      assert.match(body, /role\s+Role\?\s+@relation\(fields: \[roleId\][^)]*onDelete: SetNull\)/);
    });

    it("gives DMMessageMention the same kind column", () => {
      assert.match(model("DMMessageMention"), /kind\s+MentionKind\s+@default\(SELF\)/);
    });

    it("indexes kind alongside user and time", () => {
      assert.match(model("MessageMention"), /@@index\(\[userId, kind, createdAt\]\)/);
      assert.match(migration, /"MessageMention_userId_kind_createdAt_idx"/);
    });

    it("defaults every existing row to SELF instead of backfilling", () => {
      // Every mention written before this migration came from a username match, so the
      // default is already the truth. A backfill UPDATE would rewrite millions of rows to
      // the value they would have had anyway.
      assert.doesNotMatch(migration, /UPDATE "MessageMention"/);
      assert.doesNotMatch(migration, /UPDATE "DMMessageMention"/);
    });
  });

  describe("@everyone derives from the existing flag (K2)", () => {
    it("adds no table for mass mentions", () => {
      assert.doesNotMatch(schema, /model MassMention \{/);
      assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS "MassMention"/);
    });

    it("indexes the flag partially so the feed branch is cheap", () => {
      assert.match(
        migration,
        /CREATE INDEX IF NOT EXISTS "Message_mentionEveryone_channelId_createdAt_idx"/,
      );
      assert.match(migration, /WHERE "mentionEveryone" = true/);
    });
  });

  describe("MentionState (K4, K5)", () => {
    it("keys one row per viewer, source and reference", () => {
      const body = model("MentionState");

      assert.match(body, /source\s+MentionStateSource/);
      assert.match(body, /refId\s+String/);
      assert.match(body, /@@unique\(\[userId, source, refId\]\)/);
    });

    it("carries read, read-later and dismissed as nullable instants", () => {
      const body = model("MentionState");

      assert.match(body, /readAt\s+DateTime\?/);
      assert.match(body, /readLaterAt\s+DateTime\?/);
      assert.match(body, /dismissedAt\s+DateTime\?/);
    });

    it("covers all four feed branches", () => {
      assert.deepEqual(enumMembers("MentionStateSource"), ["CHANNEL", "DM", "EVERYONE", "THREAD"]);
    });

    it("indexes the counter and the read-later group", () => {
      const body = model("MentionState");

      assert.match(body, /@@index\(\[userId, readAt\]\)/);
      assert.match(body, /@@index\(\[userId, readLaterAt\]\)/);
    });

    it("starts empty", () => {
      // Read state keeps coming from the Notification row until a mention is touched;
      // seeding this table would turn every already-read mention into a fresh write.
      assert.doesNotMatch(migration, /INSERT INTO "MentionState"/);
    });
  });

  describe("ThreadFollow (K3)", () => {
    it("keys on the parent message, not the thread channel", () => {
      const body = model("ThreadFollow");

      assert.match(body, /parentMessageId\s+String/);
      assert.match(body, /@@unique\(\[userId, parentMessageId\]\)/);
      assert.ok(!/threadId\s+String/.test(body));
    });

    it("records why the follow exists", () => {
      assert.deepEqual(enumMembers("ThreadFollowOrigin"), [
        "AUTHOR",
        "REPLY",
        "MENTION",
        "EXPLICIT",
      ]);
    });

    it("mutes rather than deletes when unfollowed", () => {
      assert.match(model("ThreadFollow"), /mutedAt\s+DateTime\?/);
    });

    it("indexes both directions of the question", () => {
      const body = model("ThreadFollow");

      assert.match(body, /@@index\(\[parentMessageId\]\)/);
      assert.match(body, /@@index\(\[userId, createdAt\]\)/);
    });

    it("hangs off Message under its own relation name", () => {
      assert.match(
        model("Message"),
        /threadFollows\s+ThreadFollow\[\]\s+@relation\("ThreadFollowParent"\)/,
      );
    });
  });

  describe("thread lifecycle", () => {
    it("stores closure state on the root message", () => {
      const body = model("Message");

      assert.match(body, /threadClosedAt\s+DateTime\?/);
      assert.match(body, /threadClosedById\s+String\?/);
    });

    it("ships an additive migration", () => {
      assert.ok(threadLifecycleMigrationDir, "thread lifecycle migration is missing");
      assert.match(
        threadLifecycleMigration,
        /ADD COLUMN IF NOT EXISTS "threadClosedAt" TIMESTAMP\(3\)/,
      );
      assert.match(threadLifecycleMigration, /ADD COLUMN IF NOT EXISTS "threadClosedById" TEXT/);
      assert.doesNotMatch(threadLifecycleMigration, /DROP COLUMN|DROP TABLE/);
    });
  });

  describe("mention notification settings (K6)", () => {
    it("extends the existing table instead of adding a second one", () => {
      assert.doesNotMatch(schema, /model UserMentionSettings \{/);
    });

    it("adds the two new switches with the design's defaults", () => {
      const body = model("UserNotificationSettings");

      assert.match(body, /mentionSelf\s+Boolean\s+@default\(true\)/);
      // SPEC §7: thread replies ship off.
      assert.match(body, /mentionThreadReplies\s+Boolean\s+@default\(false\)/);
    });

    it("keeps the inverted suppress columns rather than duplicating them", () => {
      const body = model("UserNotificationSettings");

      assert.match(body, /suppressRoleMentions\s+Boolean\s+@default\(false\)/);
      assert.match(body, /suppressEveryoneMentions\s+Boolean\s+@default\(false\)/);
      assert.ok(!/mentionRole\s+Boolean/.test(body));
      assert.ok(!/mentionEveryone\s+Boolean/.test(body));
    });

    it("replaces the desktop boolean with a three-way mode, defaulting to MENTIONS", () => {
      const body = model("UserNotificationSettings");

      assert.deepEqual(enumMembers("DesktopMentionMode"), ["ALL", "MENTIONS", "OFF"]);
      assert.match(body, /desktopMentionMode\s+DesktopMentionMode\s+@default\(MENTIONS\)/);
    });

    it("keeps desktopNotifications for one release", () => {
      // Dropping a column in the same release that stops writing it leaves no way back if a
      // reader was missed.
      assert.match(model("UserNotificationSettings"), /desktopNotifications\s+Boolean/);
      assert.doesNotMatch(migration, /DROP COLUMN/);
    });

    it("carries the quiet-hours range, not just a mute instant", () => {
      const body = model("UserNotificationSettings");

      assert.match(body, /quietHoursEnabled\s+Boolean\s+@default\(false\)/);
      assert.match(body, /quietHoursFrom\s+String\?\s+@db\.VarChar\(5\)/);
      assert.match(body, /quietHoursTo\s+String\?\s+@db\.VarChar\(5\)/);
      assert.match(body, /quietHoursTimeZone\s+String\?/);
    });

    it("migrates an off desktop boolean onto the OFF mode", () => {
      assert.match(migration, /SET "desktopMentionMode" = 'OFF'/);
      assert.match(migration, /WHERE "desktopNotifications" = false/);
    });
  });

  describe("migration safety", () => {
    it("drops nothing", () => {
      assert.doesNotMatch(migration, /DROP TABLE/);
      assert.doesNotMatch(migration, /DROP COLUMN/);
      assert.doesNotMatch(migration, /RENAME/);
    });

    it("is re-runnable", () => {
      const creates = migration.match(/CREATE (?:UNIQUE )?INDEX(?! IF NOT EXISTS)/g) ?? [];
      assert.deepEqual(creates, []);
      const tables = migration.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? [];
      assert.deepEqual(tables, []);
    });
  });
});
