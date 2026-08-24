import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

const migrationDir = readdirSync(join(prismaDir, "rebaseline-migrations")).find((entry) =>
  entry.endsWith("_events_screen"),
);
const migration = migrationDir
  ? readFileSync(join(prismaDir, "rebaseline-migrations", migrationDir, "migration.sql"), "utf8")
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

describe("Etkinlikler screen schema", () => {
  it("ships the migration in the directory Prisma actually reads", () => {
    // Tuzak #1: Prisma reads `rebaseline-migrations`, not `prisma/migrations`. A migration in
    // the wrong folder never runs and nothing says so.
    assert.ok(migrationDir, "migration is missing from rebaseline-migrations");
    assert.ok(migration.length > 0);
  });

  describe("presentation kind (K2)", () => {
    it("names the six kinds the design draws", () => {
      assert.deepEqual(enumMembers("ScheduledEventKind"), [
        "VOICE",
        "MEETING",
        "GAME",
        "LIVE",
        "COMMUNITY",
        "WORKSHOP",
      ]);
    });

    it("keeps entityType as the technical binding", () => {
      // Six presentation kinds squeezed into three technical types leaves "is game night voice
      // or external" unanswered, and the `Yayına katıl` CTA with nowhere to go.
      assert.deepEqual(enumMembers("ScheduledEventEntityType"), ["STAGE", "VOICE", "EXTERNAL"]);
      assert.match(model("ScheduledEvent"), /entityType\s+ScheduledEventEntityType/);
    });

    it("gives ScheduledEvent a kind column defaulting to MEETING", () => {
      assert.match(model("ScheduledEvent"), /kind\s+ScheduledEventKind\s+@default\(MEETING\)/);
    });

    it("backfills kind from the technical type instead of leaving every row MEETING", () => {
      assert.match(migration, /UPDATE "ScheduledEvent"[\s\S]*?SET "kind" = 'VOICE'/);
      assert.match(migration, /UPDATE "ScheduledEvent"[\s\S]*?SET "kind" = 'LIVE'/);
      assert.match(migration, /UPDATE "ScheduledEvent"[\s\S]*?SET "kind" = 'MEETING'/);
      assert.match(migration, /"entityType" = 'STAGE'/);
      assert.match(migration, /"entityType" = 'EXTERNAL'/);
    });
  });

  describe("RSVP lives on the existing row (K1)", () => {
    it("names the two answers a row can carry", () => {
      assert.deepEqual(enumMembers("ScheduledEventRsvpStatus"), ["GOING", "MAYBE"]);
    });

    it("adds no second interest table", () => {
      // Two tables meant two counters and an inevitable drift; one table keeps one unique key.
      assert.doesNotMatch(schema, /model ScheduledEventRsvp \{/);
      assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS "ScheduledEventRsvp"/);
    });

    it("gives ScheduledEventInterest a status defaulting to GOING", () => {
      assert.match(
        model("ScheduledEventInterest"),
        /status\s+ScheduledEventRsvpStatus\s+@default\(GOING\)/,
      );
    });

    it("keeps the single unique key", () => {
      assert.match(model("ScheduledEventInterest"), /@@unique\(\[eventId, userId\]\)/);
    });

    it("lets the default do the backfill instead of an UPDATE", () => {
      // Every existing row was written with "I'm going" intent, so GOING is already the truth.
      assert.doesNotMatch(migration, /UPDATE "ScheduledEventInterest"/);
    });

    it("indexes the going tab and the mine filter", () => {
      assert.match(model("ScheduledEventInterest"), /@@index\(\[userId, status\]\)/);
      assert.match(migration, /"ScheduledEventInterest_userId_status_idx"/);
    });
  });

  describe("counters (K1)", () => {
    it("keeps interestedCount by name and narrows it to going", () => {
      const body = model("ScheduledEvent");

      assert.match(body, /interestedCount\s+Int\s+@default\(0\)/);
      assert.doesNotMatch(migration, /RENAME COLUMN "interestedCount"/);
    });

    it("adds maybeCount as its twin", () => {
      assert.match(model("ScheduledEvent"), /maybeCount\s+Int\s+@default\(0\)/);
      assert.match(migration, /ADD COLUMN IF NOT EXISTS "maybeCount" INTEGER NOT NULL DEFAULT 0/);
    });
  });

  describe("public events keep a server (K3)", () => {
    it("adds isPublic rather than a nullable server FK", () => {
      const body = model("ScheduledEvent");

      assert.match(body, /isPublic\s+Boolean\s+@default\(false\)/);
      assert.match(body, /serverId\s+String\n/);
    });

    it("indexes the membership-free feed branch", () => {
      assert.match(model("ScheduledEvent"), /@@index\(\[isPublic, status, scheduledStartAt\]\)/);
      assert.match(migration, /"ScheduledEvent_isPublic_status_scheduledStartAt_idx"/);
    });
  });

  describe("recurrence stores the rule, not the label (K6)", () => {
    it("adds a bounded RRULE column", () => {
      assert.match(model("ScheduledEvent"), /recurrenceRule\s+String\?\s+@db\.VarChar\(255\)/);
    });

    it("ships no occurrence table, because the generator is not in this package", () => {
      assert.doesNotMatch(schema, /model ScheduledEventOccurrence \{/);
    });
  });

  describe("reminders (K5)", () => {
    it("keys one row per event and viewer", () => {
      const body = model("ScheduledEventReminder");

      assert.match(body, /eventId\s+String/);
      assert.match(body, /userId\s+String/);
      assert.match(body, /@@unique\(\[eventId, userId\]\)/);
      assert.match(body, /@@index\(\[userId\]\)/);
    });

    it("carries the design's five options with 10 as the default", () => {
      assert.match(model("ScheduledEventReminder"), /minutesBefore\s+Int\s+@default\(10\)/);
      assert.match(model("ScheduledEventReminder"), /enabled\s+Boolean\s+@default\(true\)/);
    });

    it("cascades from both sides", () => {
      const body = model("ScheduledEventReminder");

      assert.match(
        body,
        /event\s+ScheduledEvent\s+@relation\(fields: \[eventId\][^)]*onDelete: Cascade\)/,
      );
      assert.match(body, /user\s+User\s+@relation\(fields: \[userId\][^)]*onDelete: Cascade\)/);
      assert.match(migration, /ON DELETE CASCADE/);
    });

    it("hangs off both parents", () => {
      assert.match(model("ScheduledEvent"), /reminders\s+ScheduledEventReminder\[\]/);
      assert.match(model("User"), /scheduledEventReminders\s+ScheduledEventReminder\[\]/);
    });
  });

  describe("event notifications (K7)", () => {
    it("extends the existing settings table instead of adding a second one", () => {
      assert.doesNotMatch(schema, /model UserEventSettings \{/);
      assert.match(
        model("UserNotificationSettings"),
        /eventNotifications\s+Boolean\s+@default\(true\)/,
      );
    });

    it("ships the column additively", () => {
      assert.match(
        migration,
        /ADD COLUMN IF NOT EXISTS "eventNotifications" BOOLEAN NOT NULL DEFAULT true/,
      );
    });
  });

  describe("migration safety", () => {
    it("drops nothing", () => {
      assert.doesNotMatch(migration, /DROP TABLE/);
      assert.doesNotMatch(migration, /DROP COLUMN/);
      assert.doesNotMatch(migration, /RENAME/);
    });

    it("is re-runnable", () => {
      const indexes = migration.match(/CREATE (?:UNIQUE )?INDEX(?! IF NOT EXISTS)/g) ?? [];
      assert.deepEqual(indexes, []);
      const tables = migration.match(/CREATE TABLE(?! IF NOT EXISTS)/g) ?? [];
      assert.deepEqual(tables, []);
    });

    it("carries its own timestamp, so ordering against the discover migration is decided", () => {
      // `20260821140000_discover_category_languages_channel_activity` already owns that
      // timestamp; sharing it would leave two migrations with an ambiguous apply order.
      assert.notEqual(migrationDir, "20260821140000_events_screen");
      assert.match(migrationDir ?? "", /^\d{14}_events_screen$/);
    });
  });
});
