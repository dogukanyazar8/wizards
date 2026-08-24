-- Bahsedilmeler paketi — Dalga 0 / Ş0.2. Six independent changes.
--
--   1. MentionKind / MentionStateSource / DesktopMentionMode / ThreadFollowOrigin enums.
--   2. MessageMention gains kind + roleId; DMMessageMention gains kind (K1).
--   3. Partial index for the @everyone branch, which reads Message.mentionEveryone (K2).
--   4. MentionState: read / read-later / dismissed for all four mention sources (K4, K5).
--   5. ThreadFollow: implicit + explicit thread following (K3).
--   6. UserNotificationSettings gains the mention switches, desktop mode and quiet hours (K6).
--
-- Nothing is dropped. `UserNotificationSettings.desktopNotifications` keeps its rows for one
-- release: this migration stops being its only reader, and dropping a column in the same
-- release that stops writing it leaves no way back if a reader was missed.
--
-- No backfill runs. Every existing mention row came from a username match, so the `SELF`
-- default already tells the truth; and `MentionState` starts empty on purpose — read state
-- keeps coming from the recipient's `Notification` row until a mention is actually touched.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MentionKind') THEN
    CREATE TYPE "MentionKind" AS ENUM ('SELF', 'ROLE', 'THREAD');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MentionStateSource') THEN
    CREATE TYPE "MentionStateSource" AS ENUM ('CHANNEL', 'DM', 'EVERYONE', 'THREAD');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DesktopMentionMode') THEN
    CREATE TYPE "DesktopMentionMode" AS ENUM ('ALL', 'MENTIONS', 'OFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ThreadFollowOrigin') THEN
    CREATE TYPE "ThreadFollowOrigin" AS ENUM ('AUTHOR', 'REPLY', 'MENTION', 'EXPLICIT');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Mention rows learn what kind they are
-- ---------------------------------------------------------------------------
ALTER TABLE "MessageMention"
  ADD COLUMN IF NOT EXISTS "kind" "MentionKind" NOT NULL DEFAULT 'SELF',
  ADD COLUMN IF NOT EXISTS "roleId" TEXT;

ALTER TABLE "DMMessageMention"
  ADD COLUMN IF NOT EXISTS "kind" "MentionKind" NOT NULL DEFAULT 'SELF';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MessageMention_roleId_fkey'
  ) THEN
    ALTER TABLE "MessageMention"
      ADD CONSTRAINT "MessageMention_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- "Türe göre" narrows by kind and orders by time; without the composite index that query
-- scans the (userId, createdAt) index and filters the kind afterwards.
CREATE INDEX IF NOT EXISTS "MessageMention_userId_kind_createdAt_idx"
  ON "MessageMention" ("userId", "kind", "createdAt");

CREATE INDEX IF NOT EXISTS "MessageMention_roleId_idx"
  ON "MessageMention" ("roleId");

-- ---------------------------------------------------------------------------
-- 3. @everyone reads a flag, not a table
-- ---------------------------------------------------------------------------
-- `Message.mentionEveryone` is already written on send and on edit, history included, so the
-- feed derives the card from it instead of writing one row per member. The index is partial:
-- mass mentions are a small fraction of messages and a full index would carry every row.
CREATE INDEX IF NOT EXISTS "Message_mentionEveryone_channelId_createdAt_idx"
  ON "Message" ("channelId", "createdAt" DESC)
  WHERE "mentionEveryone" = true;

-- ---------------------------------------------------------------------------
-- 4. One triage state table for all four mention sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "MentionState" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "source"      "MentionStateSource" NOT NULL,
  "refId"       TEXT NOT NULL,
  "readAt"      TIMESTAMP(3),
  "readLaterAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MentionState_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MentionState_userId_fkey'
  ) THEN
    ALTER TABLE "MentionState"
      ADD CONSTRAINT "MentionState_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "MentionState_userId_source_refId_key"
  ON "MentionState" ("userId", "source", "refId");

CREATE INDEX IF NOT EXISTS "MentionState_userId_readAt_idx"
  ON "MentionState" ("userId", "readAt");

CREATE INDEX IF NOT EXISTS "MentionState_userId_readLaterAt_idx"
  ON "MentionState" ("userId", "readLaterAt");

-- ---------------------------------------------------------------------------
-- 5. Thread following
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ThreadFollow" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "parentMessageId" TEXT NOT NULL,
  "channelId"       TEXT NOT NULL,
  "origin"          "ThreadFollowOrigin" NOT NULL,
  -- Unfollowing writes this instead of deleting the row; a deleted row would be silently
  -- recreated by the next implicit trigger, quietly re-following what the user turned off.
  "mutedAt"         TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ThreadFollow_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ThreadFollow_userId_fkey'
  ) THEN
    ALTER TABLE "ThreadFollow"
      ADD CONSTRAINT "ThreadFollow_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ThreadFollow_parentMessageId_fkey'
  ) THEN
    ALTER TABLE "ThreadFollow"
      ADD CONSTRAINT "ThreadFollow_parentMessageId_fkey"
      FOREIGN KEY ("parentMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "ThreadFollow_userId_parentMessageId_key"
  ON "ThreadFollow" ("userId", "parentMessageId");

CREATE INDEX IF NOT EXISTS "ThreadFollow_parentMessageId_idx"
  ON "ThreadFollow" ("parentMessageId");

CREATE INDEX IF NOT EXISTS "ThreadFollow_userId_createdAt_idx"
  ON "ThreadFollow" ("userId", "createdAt");

-- ---------------------------------------------------------------------------
-- 6. Mention notification settings
-- ---------------------------------------------------------------------------
-- The two existing suppress* columns already carry the "Rol bahsetmeleri" and
-- "@herkes ve @burada" switches, inverted. They are mapped in the service layer rather than
-- duplicated here: a second column for the same question is a second answer waiting to differ.
ALTER TABLE "UserNotificationSettings"
  ADD COLUMN IF NOT EXISTS "mentionSelf" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "mentionThreadReplies" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "desktopMentionMode" "DesktopMentionMode" NOT NULL DEFAULT 'MENTIONS',
  ADD COLUMN IF NOT EXISTS "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quietHoursFrom" VARCHAR(5),
  ADD COLUMN IF NOT EXISTS "quietHoursTo" VARCHAR(5),
  ADD COLUMN IF NOT EXISTS "quietHoursTimeZone" TEXT;

-- Existing rows that had desktop notifications switched off keep that meaning under the new
-- enum. Rows that had them on land on the design's default, 'MENTIONS'.
UPDATE "UserNotificationSettings"
   SET "desktopMentionMode" = 'OFF'
 WHERE "desktopNotifications" = false
   AND "desktopMentionMode" = 'MENTIONS';
