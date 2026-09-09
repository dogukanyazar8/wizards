import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

const migrationDirs = readdirSync(join(prismaDir, "rebaseline-migrations"));

function readMigration(suffix) {
  const dir = migrationDirs.find((entry) => entry.endsWith(suffix));
  return {
    dir,
    sql: dir
      ? readFileSync(join(prismaDir, "rebaseline-migrations", dir, "migration.sql"), "utf8")
      : "",
  };
}

const { dir: migrationDir, sql: migration } = readMigration("_messages_screen");
/** §15–§17 turu ayrı bir migration ile geldi; ilk tur dokunulmadan bıraktı. */
const { dir: profileMigrationDir, sql: profileMigration } =
  readMigration("_messages_profile_panel");

function model(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${name} is missing`);
  return match[1];
}

describe("Mesajlar screen schema", () => {
  it("ships the migration in the directory Prisma actually reads", () => {
    assert.ok(migrationDir, "migration is missing from rebaseline-migrations");
    assert.ok(migration.length > 0);
  });

  describe("history visibility (karar #9)", () => {
    it("adds LAST_7D between LAST_24H and LAST_30D", () => {
      const match = schema.match(/enum GroupHistoryVisibility \{([^}]*)\}/);
      assert.ok(match);
      const members = match[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("///"));

      assert.deepEqual(members, ["NONE", "LAST_24H", "LAST_7D", "LAST_30D", "ALL"]);
    });

    it("keeps LAST_24H rather than repurposing it", () => {
      // Renaming LAST_24H to LAST_7D would silently widen every existing
      // conversation's history window — a privacy change disguised as a rename.
      assert.doesNotMatch(migration, /RENAME VALUE/);
      assert.match(migration, /ADD VALUE IF NOT EXISTS 'LAST_7D'/);
    });

    it("leaves the column default alone", () => {
      // The create screen's default lives in `createInitialGroupCreateState()`;
      // moving it into the schema would change every existing conversation's
      // meaning on the next write.
      assert.match(
        model("DMConversation"),
        /historyVisibility GroupHistoryVisibility @default\(LAST_30D\)/,
      );
    });
  });

  describe("friends ordering (karar #8)", () => {
    it("declares FriendsSort with three members", () => {
      const match = schema.match(/enum FriendsSort \{([^}]*)\}/);
      assert.ok(match);
      const members = match[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("///"));

      assert.deepEqual(members, ["STATUS", "NAME", "RECENT"]);
    });

    it("persists the preference on UserSettings with the screen's default", () => {
      assert.match(model("UserSettings"), /friendsSort\s+FriendsSort\s+@default\(STATUS\)/);
      assert.match(migration, /ADD COLUMN IF NOT EXISTS "friendsSort"/);
    });
  });

  describe("multi-pin (karar #7)", () => {
    it("declares DMPinnedMessage with the conversation reading index", () => {
      const pinned = model("DMPinnedMessage");

      assert.match(pinned, /@@unique\(\[conversationId, messageId\]\)/);
      assert.match(pinned, /@@index\(\[conversationId, pinnedAt\]\)/);
      assert.match(pinned, /onDelete: Cascade/);
    });

    it("creates the unique index before the backfill", () => {
      const uniqueAt = migration.indexOf('"DMPinnedMessage_conversationId_messageId_key"');
      const insertAt = migration.indexOf('INSERT INTO "DMPinnedMessage"');
      const readIndexAt = migration.indexOf('"DMPinnedMessage_conversationId_pinnedAt_idx"');

      assert.ok(uniqueAt > 0 && insertAt > 0 && readIndexAt > 0);
      // Without a constraint to conflict on, ON CONFLICT DO NOTHING dedupes nothing.
      assert.ok(uniqueAt < insertAt, "unique index must precede the backfill");
      // The keyset index goes last so the bulk insert does not maintain it row by row.
      assert.ok(insertAt < readIndexAt, "reading index must follow the backfill");
    });

    it("backfills every pin, including rows with no recorded pinner", () => {
      assert.match(migration, /COALESCE\(c\."pinnedById", c\."ownerId", m\."userId"\)/);
    });

    it("keeps the single-pin column for one release", () => {
      // Dropping a column in the same release that stops writing it leaves no
      // way back if a reader was missed.
      assert.match(model("DMConversation"), /pinnedMessageId String\?/);
      assert.doesNotMatch(migration, /DROP COLUMN "pinnedMessageId"/);
    });
  });

  describe("polls (karar #1)", () => {
    it("attaches a poll to exactly one message", () => {
      const poll = model("Poll");

      assert.match(poll, /dmMessageId String\?\s+@unique/);
      assert.match(poll, /messageId\s+String\?\s+@unique/);
      // Prisma cannot express the exclusivity, so the migration carries it.
      assert.match(migration, /CHECK \(num_nonnulls\("dmMessageId", "messageId"\) = 1\)/);
    });

    it("stores the resolved closing instant, not the chosen duration", () => {
      const poll = model("Poll");

      assert.match(poll, /closesAt\s+DateTime/);
      // A stored unit would be a second answer to "is this poll closed".
      assert.doesNotMatch(poll, /duration/i);
      assert.doesNotMatch(schema, /enum PollDuration/);
    });

    it("defaults to anonymous voting", () => {
      // The safer default for a vote is the one that reveals less, and the
      // design ships the toggle enabled.
      assert.match(model("Poll"), /anonymous\s+Boolean\s+@default\(true\)/);
    });

    it("makes a repeated vote for the same option idempotent", () => {
      assert.match(model("PollVote"), /@@unique\(\[optionId, userId\]\)/);
      assert.match(migration, /"PollVote_optionId_userId_key"/);
    });

    it("indexes the tally and the viewer's own vote", () => {
      assert.match(model("PollVote"), /@@index\(\[pollId, userId\]\)/);
    });

    it("keeps option order unique per poll", () => {
      assert.match(model("PollOption"), /@@unique\(\[pollId, position\]\)/);
    });

    it("caps the stored text at the lengths the composer enforces", () => {
      assert.match(model("Poll"), /question\s+String\s+@db\.VarChar\(300\)/);
      assert.match(model("PollOption"), /label\s+String\s+@db\.VarChar\(80\)/);
    });

    it("removes every poll row with its message", () => {
      for (const name of ["Poll", "PollOption", "PollVote"]) {
        assert.match(model(name), /onDelete: Cascade/);
      }
    });
  });

  describe("group swatch names (karar #4)", () => {
    it("widens avatarColor past the hex width it outgrew", () => {
      // "primary", "success" and "warning" are exactly seven characters, so the
      // old VARCHAR(7) held them only by accident.
      assert.match(model("DMConversation"), /avatarColor\s+String\?\s+@db\.VarChar\(16\)/);
      assert.match(
        migration,
        /ALTER TABLE "DMConversation" ALTER COLUMN "avatarColor" TYPE VARCHAR\(16\)/,
      );
    });

    it("rewrites no existing row", () => {
      // Stored hex is resolved on read by `mapLegacyGroupAvatarColor`; an UPDATE
      // here would touch every group for a value nobody asked to change.
      assert.doesNotMatch(migration, /UPDATE "DMConversation"/);
    });
  });

  describe("voice messages (karar #5)", () => {
    it("reuses the attachment columns that already exist", () => {
      // `duration` and `waveform` were declared long ago and `waveform` was
      // never written. Re-typing an empty column on a live database buys
      // nothing that zod validation does not already give the write path.
      const attachment = model("Attachment");

      assert.match(attachment, /duration\s+Float\?/);
      assert.match(attachment, /waveform\s+String\?/);
      assert.doesNotMatch(migration, /ALTER TABLE "Attachment"/);
    });
  });
});

describe("Mesajlar profil paneli schema (§15–§17)", () => {
  it("ships its own migration rather than editing the first one", () => {
    assert.ok(profileMigrationDir, "profile-panel migration is missing");
    assert.ok(profileMigration.length > 0);
    assert.notEqual(profileMigrationDir, migrationDir);
  });

  describe("timed mute (§17, karar K8)", () => {
    it("adds mutedUntil next to the muted flag it complements", () => {
      const participant = model("DMParticipant");

      assert.match(participant, /muted\s+Boolean\s+@default\(false\)/);
      assert.match(participant, /mutedUntil\s+DateTime\?/);
      assert.match(profileMigration, /ALTER TABLE "DMParticipant" ADD COLUMN "mutedUntil"/);
    });

    it("keeps the boolean so an indefinite mute still has a home", () => {
      // "Süresiz" is `muted = true, mutedUntil = null`. Dropping `muted` would force a
      // sentinel date and every read would have to know which date meant "forever".
      assert.doesNotMatch(profileMigration, /DROP COLUMN "muted"/);
    });

    it("adds no index for a column nothing filters on", () => {
      assert.doesNotMatch(profileMigration, /CREATE INDEX[^;]*"mutedUntil"/);
    });
  });

  describe("privacy switches (§15.5, karar K9)", () => {
    it("pairs showTypingIndicator with the read-receipt preference already there", () => {
      const settings = model("UserSettings");

      assert.match(settings, /showReadReceipts\s+Boolean\s+@default\(true\)/);
      assert.match(settings, /showTypingIndicator\s+Boolean\s+@default\(true\)/);
      assert.match(
        profileMigration,
        /ALTER TABLE "UserSettings" ADD COLUMN "showTypingIndicator" BOOLEAN NOT NULL DEFAULT true/,
      );
    });

    it("opens no third column for the read-only encryption row", () => {
      // §15.5's first row reports transport encryption; it is a status, not a preference.
      assert.doesNotMatch(model("UserSettings"), /encryption/i);
    });
  });

  it("backfills nothing — one column is nullable, the other defaulted", () => {
    assert.doesNotMatch(profileMigration, /UPDATE "DMParticipant"/);
    assert.doesNotMatch(profileMigration, /UPDATE "UserSettings"/);
  });
});
