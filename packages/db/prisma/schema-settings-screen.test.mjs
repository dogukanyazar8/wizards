import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const prismaDir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(prismaDir, "schema.prisma"), "utf8");

const migrationDir = readdirSync(join(prismaDir, "rebaseline-migrations")).find((entry) =>
  entry.endsWith("_settings_notifications_screen"),
);
const migration = migrationDir
  ? readFileSync(join(prismaDir, "rebaseline-migrations", migrationDir, "migration.sql"), "utf8")
  : "";

/**
 * The migration with its `--` prose stripped. The header explains in English that nothing is
 * dropped or renamed; a naive search for DROP / RENAME would match that sentence and pass — or,
 * as it did first, fail — on the comment rather than on the SQL.
 */
const statements = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function model(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${name} is missing`);
  return match[1];
}

/**
 * A model body with its prose removed. The block comment above the new columns explains *why*
 * `typeSecurity` has no column — so a search for the name over the raw body finds the sentence
 * that says it is absent and reports it as present.
 */
function columns(name) {
  return model(name)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return trimmed.length > 0 && !trimmed.startsWith("//");
    })
    .join("\n");
}

function enumMembers(name) {
  const match = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  assert.ok(match, `enum ${name} is missing`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("///"));
}

describe("Ayarlar screen schema", () => {
  it("ships the migration in the directory Prisma actually reads", () => {
    assert.ok(migrationDir, "migration is missing from rebaseline-migrations");
    assert.ok(migration.length > 0);
  });

  describe("enums (K3, K5)", () => {
    it("gives the notification level its third rung", () => {
      // `UserSettings.defaultNotifications` only ever had ALL_MESSAGES / ONLY_MENTIONS. The
      // 560px window's third radio card ("Kapalı") has no home there, which is why this is a
      // separate enum rather than a new member on the old one.
      assert.deepEqual(enumMembers("NotificationLevelPreference"), ["ALL", "IMPORTANT", "OFF"]);
    });

    it("keeps the system-notification mode separate from DesktopMentionMode", () => {
      // Same three members, deliberately not the same type: DesktopMentionMode is the mention
      // pipeline's desktop mode, SystemNotificationMode is the notification centre's delivery
      // channel. The backfill maps them once; afterwards they move independently.
      assert.deepEqual(enumMembers("SystemNotificationMode"), ["ALL", "MENTIONS", "OFF"]);
      assert.deepEqual(enumMembers("DesktopMentionMode"), ["ALL", "MENTIONS", "OFF"]);
    });

    it("names the two sound packs that exist on disk", () => {
      assert.deepEqual(enumMembers("SoundProfile"), ["WHISPR", "CLASSIC"]);
    });

    it("closes the security-event list at the eight kinds that have a writer", () => {
      assert.deepEqual(enumMembers("SecurityEventKind"), [
        "LOGIN_NEW_DEVICE",
        "PASSWORD_CHANGED",
        "FAILED_LOGIN",
        "TWO_FACTOR_ENABLED",
        "TWO_FACTOR_DISABLED",
        "SESSION_REVOKED",
        "RECOVERY_CODES_REGENERATED",
        "EMAIL_CHANGED",
      ]);
    });
  });

  describe("SecurityEvent (K5)", () => {
    it("stores a hashed address and never a raw one", () => {
      const body = model("SecurityEvent");

      assert.match(body, /ipHash\s+String\?\s+@db\.VarChar\(64\)/);
      assert.doesNotMatch(body, /\bipAddress\b/);
      assert.match(migration, /"ipHash"\s+VARCHAR\(64\)/);
      assert.doesNotMatch(migration, /"SecurityEvent"[\s\S]*?"ipAddress"/);
    });

    it("indexes the only question the block asks", () => {
      assert.match(model("SecurityEvent"), /@@index\(\[userId, createdAt\]\)/);
      assert.match(migration, /"SecurityEvent_userId_createdAt_idx"/);
    });

    it("disappears with its owner", () => {
      assert.match(
        model("SecurityEvent"),
        /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/,
      );
      assert.match(model("User"), /securityEvents\s+SecurityEvent\[\]/);
      assert.match(migration, /SecurityEvent_userId_fkey[\s\S]*?ON DELETE CASCADE/);
    });
  });

  describe("UserNotificationSettings — locked types have no column", () => {
    it("has no typeSecurity or typeModeration column", () => {
      // The two locked rows are a server contract, not a client decoration: the API answers
      // `true` and rejects them in PATCH. A column would give the lock a storable off state.
      const body = columns("UserNotificationSettings");

      assert.doesNotMatch(body, /\btypeSecurity\b/);
      assert.doesNotMatch(body, /\btypeModeration\b/);
      assert.doesNotMatch(statements, /"typeSecurity"/);
      assert.doesNotMatch(statements, /"typeModeration"/);
    });

    it("keeps the fourteen type columns that do exist", () => {
      const body = model("UserNotificationSettings");

      for (const column of [
        "typeDm",
        "typeMentionSelf",
        "typeMentionRole",
        "typeMentionEveryone",
        "typeThreadReplies",
        "typeMessageReplies",
        "typeIncomingCall",
        "typeVoiceInvite",
        "typeFriendRequest",
        "typeServerInvite",
        "typeEvents",
        "typeBadges",
        "typeAnnouncements",
        "typeProductUpdates",
      ]) {
        assert.match(body, new RegExp(`${column}\\s+Boolean`), `${column} is missing`);
      }
    });
  });

  describe("UserNotificationSettings — nothing was dropped", () => {
    it("still carries the two inverted columns", () => {
      // Tuzak #2: `suppress*` is the inverse of the switch. Deleting them here would strand
      // `mention-settings-service.ts`, which is still the only place the inversion is resolved.
      const body = model("UserNotificationSettings");

      assert.match(body, /suppressEveryoneMentions\s+Boolean\s+@default\(false\)/);
      assert.match(body, /suppressRoleMentions\s+Boolean\s+@default\(false\)/);
    });

    it("still carries every column that predates this migration", () => {
      const body = model("UserNotificationSettings");

      for (const column of [
        "desktopNotifications",
        "mobileNotifications",
        "emailNotifications",
        "notificationSound",
        "notificationSoundFile",
        "mutedUntil",
        "mentionSelf",
        "mentionThreadReplies",
        "desktopMentionMode",
        "quietHoursEnabled",
        "quietHoursFrom",
        "quietHoursTo",
        "quietHoursTimeZone",
        "eventNotifications",
      ]) {
        assert.match(body, new RegExp(`\\b${column}\\s`), `${column} was dropped`);
      }
    });

    it("drops nothing at all", () => {
      assert.doesNotMatch(statements, /DROP COLUMN/i);
      assert.doesNotMatch(statements, /DROP TABLE/i);
      assert.doesNotMatch(statements, /RENAME/i);
    });
  });

  describe("UserNotificationSettings — the seven tabs", () => {
    it("types the level and system-mode columns instead of storing JSON (K3)", () => {
      const body = model("UserNotificationSettings");

      assert.match(body, /level\s+NotificationLevelPreference\s+@default\(IMPORTANT\)/);
      assert.match(body, /systemMode\s+SystemNotificationMode\s+@default\(MENTIONS\)/);
      assert.doesNotMatch(body, /preferences\s+Json/);
    });

    it("keeps np4 (panelShowContent) separate from na6 (systemPreview)", () => {
      // Tuzak #4: the in-app toast's message text and the system notification's preview are
      // two surfaces and two preferences. One column for both silently ties them together.
      const body = model("UserNotificationSettings");

      assert.match(body, /systemPreview\s+Boolean\s+@default\(false\)/);
      assert.match(body, /panelShowContent\s+Boolean\s+@default\(false\)/);
    });

    it("gives each of the four sounds its own enable, profile and volume", () => {
      const body = model("UserNotificationSettings");

      assert.match(body, /soundNotificationProfile\s+SoundProfile\s+@default\(WHISPR\)/);
      assert.match(body, /soundNotificationVolume\s+Int\s+@default\(60\)/);
      assert.match(body, /soundCallProfile\s+SoundProfile\s+@default\(CLASSIC\)/);
      assert.match(body, /soundCallVolume\s+Int\s+@default\(80\)/);
      assert.match(body, /soundJoinVolume\s+Int\s+@default\(50\)/);
      assert.match(body, /soundLeaveVolume\s+Int\s+@default\(50\)/);
    });

    it("bounds the default mute duration to a key, not a sentence", () => {
      assert.match(
        model("UserNotificationSettings"),
        /defaultMuteDuration\s+String\s+@default\("8h"\)\s+@db\.VarChar\(16\)/,
      );
    });

    it("does not index a single boolean column", () => {
      // A boolean index over one row per account has no selectivity; the send path reads
      // `userId IN (...)` and the unique key on `userId` already answers that.
      assert.doesNotMatch(model("UserNotificationSettings"), /@@index\(\[deliveryPush\]\)/);
      assert.doesNotMatch(statements, /deliveryPush.*_idx/);
    });
  });

  describe("UserSettings — the thirteen additions", () => {
    it("keeps the idle timeout the user bar menu no longer has room for (K9)", () => {
      assert.match(model("UserSettings"), /idleTimeoutMinutes\s+Int\s+@default\(10\)/);
    });

    it("stores one reduceMotion column for two rows (SPEC_DEVIATIONS #4)", () => {
      // Referans keeps v7 (Medya) and x1 (Erişilebilirlik) as separate keys. Two controls with
      // the same name and independent state contradict PROMPT §8 — one column, two rows.
      const body = model("UserSettings");

      assert.match(body, /reduceMotion\s+Boolean\s+@default\(false\)/);
      // v8 = x5 reuses the column that already existed.
      assert.match(body, /enableTTS\s+Boolean\s+@default\(true\)/);
      assert.equal(body.match(/reduceMotion/g).length, 1);
    });

    it("adds the accessibility, layout and media columns the tree needs", () => {
      const body = model("UserSettings");

      assert.match(body, /highContrast\s+Boolean\s+@default\(false\)/);
      assert.match(body, /strongFocusRings\s+Boolean\s+@default\(true\)/);
      assert.match(body, /uiTextScale\s+Int\s+@default\(100\)/);
      assert.match(body, /screenReaderDescriptions\s+Boolean\s+@default\(true\)/);
      assert.match(body, /followSystemA11y\s+Boolean\s+@default\(true\)/);
      assert.match(body, /appIcon\s+String\s+@default\("whispr"\)\s+@db\.VarChar\(24\)/);
      assert.match(body, /mainContentWidth\s+Int\s+@default\(100\)/);
      assert.match(body, /serverIconSize\s+Int\s+@default\(44\)/);
      assert.match(body, /showMemberPanelByDefault\s+Boolean\s+@default\(true\)/);
      assert.match(body, /linkPreviews\s+Boolean\s+@default\(true\)/);
      assert.match(body, /pttReleaseMs\s+Int\s+@default\(120\)/);
    });
  });

  describe("backfill", () => {
    it("inverts the two inverted columns exactly once", () => {
      assert.match(migration, /"typeMentionEveryone"\s*=\s*NOT u\."suppressEveryoneMentions"/);
      assert.match(migration, /"typeMentionRole"\s*=\s*NOT u\."suppressRoleMentions"/);
    });

    it("maps the old columns onto their new homes", () => {
      assert.match(migration, /"deliveryPush"\s*=\s*u\."mobileNotifications"/);
      assert.match(migration, /"deliveryEmail"\s*=\s*u\."emailNotifications"/);
      assert.match(migration, /"typeMentionSelf"\s*=\s*u\."mentionSelf"/);
      assert.match(migration, /"typeThreadReplies"\s*=\s*u\."mentionThreadReplies"/);
      assert.match(migration, /"typeEvents"\s*=\s*u\."eventNotifications"/);
      assert.match(migration, /"soundNotificationEnabled"\s*=\s*u\."notificationSound"/);
      assert.match(migration, /notificationLimit/);
      assert.match(migration, /notificationAutoClose/);
    });

    it("compares defaultNotifications as text, not as its own enum", () => {
      // The enum has two labels; the third branch this screen needs ('NOTHING') is not one of
      // them. Comparing against the enum directly would abort the migration on that literal.
      assert.match(migration, /s\."defaultNotifications"::text/);
    });

    it("is a plain UPDATE, so a second run recomputes the same value", () => {
      // Every right-hand side is a column that keeps being written for one more release, so
      // idempotency comes from the arithmetic rather than from a WHERE guard that could leave
      // half the accounts on the column default.
      assert.doesNotMatch(
        migration,
        /UPDATE "UserNotificationSettings"[\s\S]*?\bWHERE\b\s+"level"/,
      );
    });
  });
});
