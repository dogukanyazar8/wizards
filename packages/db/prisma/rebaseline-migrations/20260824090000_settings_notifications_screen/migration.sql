-- Bildirimler + Ayarlar pencereleri — Dalga 0 / Ş0. Five additive changes.
--
--   1. NotificationLevelPreference / SystemNotificationMode / SoundProfile / SecurityEventKind.
--   2. SecurityEvent: one row per security-relevant account event (K5).
--   3. UserNotificationSettings gains 42 typed columns (K3) — the seven Bildirimler tabs.
--   4. UserSettings gains 13 columns (K9 + Görünüm's Düzen / Erişilebilirlik / Medya rows).
--   5. Backfill from the columns that already carry the same meaning.
--
-- Nothing is dropped and nothing is renamed. The twelve columns UserNotificationSettings
-- already had stay exactly as they were, the two inverted ones (suppressEveryoneMentions,
-- suppressRoleMentions) included: the read path still inverts them inside
-- `mention-settings-service.ts`, and the backfill below inverts them **once** on the way in.
--
-- There is deliberately no `typeSecurity` / `typeModeration` column. Those two rows are locked:
-- the API answers `true` for them and rejects them in PATCH. A column would give the lock a
-- storable off state and turn the claim into a lie.
--
-- There is deliberately no index on `deliveryPush` either. A single-column boolean index over a
-- table with one row per account carries no selectivity — the send path reads `userId IN (...)`
-- and the unique key on `userId` already answers that.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationLevelPreference') THEN
    CREATE TYPE "NotificationLevelPreference" AS ENUM ('ALL', 'IMPORTANT', 'OFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SystemNotificationMode') THEN
    CREATE TYPE "SystemNotificationMode" AS ENUM ('ALL', 'MENTIONS', 'OFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SoundProfile') THEN
    CREATE TYPE "SoundProfile" AS ENUM ('WHISPR', 'CLASSIC');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SecurityEventKind') THEN
    CREATE TYPE "SecurityEventKind" AS ENUM (
      'LOGIN_NEW_DEVICE', 'PASSWORD_CHANGED', 'FAILED_LOGIN',
      'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED',
      'SESSION_REVOKED', 'RECOVERY_CODES_REGENERATED', 'EMAIL_CHANGED'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. SecurityEvent (K5)
--
-- `ipHash` is a salted hash, never the address: the scheme `AdminAuditLog.ipHash` already uses.
-- The screen shows `location`, so the raw address has no reader — and a security log that
-- stores one becomes its own liability.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SecurityEvent" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "kind"      "SecurityEventKind" NOT NULL,
  "ipHash"    VARCHAR(64),
  "userAgent" TEXT,
  "location"  TEXT,
  "metadata"  JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- The block asks exactly one question: this viewer's most recent events. Without the time
-- column in the index, every open reads every row the account ever wrote.
CREATE INDEX IF NOT EXISTS "SecurityEvent_userId_createdAt_idx"
  ON "SecurityEvent" ("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SecurityEvent_userId_fkey') THEN
    ALTER TABLE "SecurityEvent"
      ADD CONSTRAINT "SecurityEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. UserNotificationSettings — the seven Bildirimler tabs (K3)
-- ---------------------------------------------------------------------------
ALTER TABLE "UserNotificationSettings"
  ADD COLUMN IF NOT EXISTS "level"                    "NotificationLevelPreference" NOT NULL DEFAULT 'IMPORTANT',
  ADD COLUMN IF NOT EXISTS "systemMode"               "SystemNotificationMode" NOT NULL DEFAULT 'MENTIONS',
  ADD COLUMN IF NOT EXISTS "systemPreview"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inAppToast"               BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "systemWhileOpen"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "appBadge"                 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deliveryInApp"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deliveryPush"             BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deliveryEmail"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "typeDm"                   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeMentionSelf"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeMentionRole"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeMentionEveryone"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "typeThreadReplies"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeMessageReplies"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeIncomingCall"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeVoiceInvite"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeFriendRequest"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeServerInvite"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeEvents"               BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeBadges"               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "typeAnnouncements"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "typeProductUpdates"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quietHoursAllowCalls"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "soundNotificationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "soundNotificationProfile" "SoundProfile" NOT NULL DEFAULT 'WHISPR',
  ADD COLUMN IF NOT EXISTS "soundNotificationVolume"  INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "soundCallEnabled"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "soundCallProfile"         "SoundProfile" NOT NULL DEFAULT 'CLASSIC',
  ADD COLUMN IF NOT EXISTS "soundCallVolume"          INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "soundJoinEnabled"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "soundJoinProfile"         "SoundProfile" NOT NULL DEFAULT 'WHISPR',
  ADD COLUMN IF NOT EXISTS "soundJoinVolume"          INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "soundLeaveEnabled"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "soundLeaveProfile"        "SoundProfile" NOT NULL DEFAULT 'WHISPR',
  ADD COLUMN IF NOT EXISTS "soundLeaveVolume"         INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "panelCount"               INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "panelAutoClose"           BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "panelDurationSec"         INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "panelShowContent"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "panelShowSource"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "defaultMuteDuration"      VARCHAR(16) NOT NULL DEFAULT '8h';

-- ---------------------------------------------------------------------------
-- 4. UserSettings — K9 plus Görünüm's Düzen / Erişilebilirlik / Medya rows
-- ---------------------------------------------------------------------------
ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "idleTimeoutMinutes"       INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "highContrast"             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "strongFocusRings"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "uiTextScale"              INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "screenReaderDescriptions" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "followSystemA11y"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "reduceMotion"             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "appIcon"                  VARCHAR(24) NOT NULL DEFAULT 'whispr',
  ADD COLUMN IF NOT EXISTS "mainContentWidth"         INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "serverIconSize"           INTEGER NOT NULL DEFAULT 44,
  ADD COLUMN IF NOT EXISTS "showMemberPanelByDefault" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "linkPreviews"             BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "pttReleaseMs"             INTEGER NOT NULL DEFAULT 120;

-- ---------------------------------------------------------------------------
-- 5. Backfill — one-way and idempotent
--
-- Idempotent by construction rather than by guard: every right-hand side is an existing column
-- that keeps being written for one more release, so a second run computes the value the first
-- run computed. A `WHERE` guard would be the opposite of safe here — it would let a
-- half-applied migration leave some accounts on the column default and some on their real
-- preference, with nothing afterwards able to tell the two apart.
--
-- The two inverted columns are inverted **once**, here, with `NOT`. Nothing downstream of this
-- migration carries the inversion any further.
-- ---------------------------------------------------------------------------
UPDATE "UserNotificationSettings" u SET
  "panelCount"               = COALESCE(
                                 (SELECT s."notificationLimit" FROM "UserSettings" s WHERE s."userId" = u."userId"),
                                 5
                               ),
  "panelAutoClose"           = COALESCE(
                                 (SELECT s."notificationAutoClose" FROM "UserSettings" s WHERE s."userId" = u."userId"),
                                 true
                               ),
  "soundNotificationEnabled" = u."notificationSound",
  "soundNotificationProfile" = (
                                 CASE WHEN u."notificationSoundFile" LIKE '%whispr%'
                                   THEN 'WHISPR'
                                   ELSE 'CLASSIC'
                                 END
                               )::"SoundProfile",
  "systemMode"               = (
                                 CASE u."desktopMentionMode"::text
                                   WHEN 'ALL' THEN 'ALL'
                                   WHEN 'OFF' THEN 'OFF'
                                   ELSE 'MENTIONS'
                                 END
                               )::"SystemNotificationMode",
  "deliveryPush"             = u."mobileNotifications",
  "deliveryEmail"            = u."emailNotifications",
  "typeMentionSelf"          = u."mentionSelf",
  "typeThreadReplies"        = u."mentionThreadReplies",
  "typeMentionEveryone"      = NOT u."suppressEveryoneMentions",
  "typeMentionRole"          = NOT u."suppressRoleMentions",
  "typeEvents"               = u."eventNotifications";

-- `defaultNotifications` is `NotificationLevel`, an enum with exactly two labels
-- (ALL_MESSAGES, ONLY_MENTIONS). It is compared as text on purpose: comparing against the enum
-- directly makes Postgres coerce every branch literal to that type, and the third branch this
-- screen needs ('NOTHING', which the old enum never had) would abort the migration with
-- `invalid input value for enum`. The branch stays written so the mapping reads complete.
UPDATE "UserNotificationSettings" u SET "level" = (
  CASE (SELECT s."defaultNotifications"::text FROM "UserSettings" s WHERE s."userId" = u."userId")
    WHEN 'ALL_MESSAGES' THEN 'ALL'
    WHEN 'NOTHING'      THEN 'OFF'
    ELSE 'IMPORTANT'
  END
)::"NotificationLevelPreference";
