-- Etkinlikler paketi — Dalga 0 / Ş0.2. Six additive changes.
--
--   1. ScheduledEventKind / ScheduledEventRsvpStatus enums.
--   2. ScheduledEvent gains kind (K2), isPublic (K3), recurrenceRule (K6), maybeCount (K1).
--   3. ScheduledEventInterest gains status (K1) and the (userId, status) index.
--   4. ScheduledEventReminder: one reminder preference per viewer per event (K5).
--   5. UserNotificationSettings gains eventNotifications (K7).
--   6. Indexes for the two new read branches.
--
-- Nothing is dropped and nothing is renamed. `interestedCount` keeps its name on purpose:
-- K1 narrows its **meaning** to "going" and adds `maybeCount` beside it, but three readers
-- (Ana Sayfa akışı, sunucu profil kartı, /api/v1/mobile/.../events) still select it by name
-- and a rename would break all three for a word.
--
-- The timestamp is 15:00, not the 14:00 the plan drafted: `20260821140000_discover_category_
-- languages_channel_activity` already owns 14:00 and two migrations sharing a timestamp leave
-- their apply order to chance.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScheduledEventKind') THEN
    CREATE TYPE "ScheduledEventKind" AS ENUM (
      'VOICE', 'MEETING', 'GAME', 'LIVE', 'COMMUNITY', 'WORKSHOP'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScheduledEventRsvpStatus') THEN
    CREATE TYPE "ScheduledEventRsvpStatus" AS ENUM ('GOING', 'MAYBE');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The event learns its presentation kind, its reach and its recurrence
-- ---------------------------------------------------------------------------
ALTER TABLE "ScheduledEvent"
  ADD COLUMN IF NOT EXISTS "kind" "ScheduledEventKind" NOT NULL DEFAULT 'MEETING',
  ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrenceRule" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "maybeCount" INTEGER NOT NULL DEFAULT 0;

-- K2 backfill. Unlike the RSVP column below, the MEETING default is **not** already the truth
-- here: a voice event that reads MEETING would draw the wrong tile, the wrong tone and the
-- wrong CTA. The mapping is the one the decision fixes: VOICE→VOICE, STAGE→LIVE,
-- EXTERNAL→MEETING. Each statement is guarded so a re-run touches nothing.
UPDATE "ScheduledEvent"
  SET "kind" = 'VOICE'
  WHERE "entityType" = 'VOICE' AND "kind" = 'MEETING';

UPDATE "ScheduledEvent"
  SET "kind" = 'LIVE'
  WHERE "entityType" = 'STAGE' AND "kind" = 'MEETING';

-- Written for symmetry and for the next reader: EXTERNAL already lands on MEETING through the
-- column default, so this statement is a documented no-op rather than a missing case.
UPDATE "ScheduledEvent"
  SET "kind" = 'MEETING'
  WHERE "entityType" = 'EXTERNAL' AND "kind" <> 'MEETING';

-- K3 — the public feed reads by time without a membership filter.
CREATE INDEX IF NOT EXISTS "ScheduledEvent_isPublic_status_scheduledStartAt_idx"
  ON "ScheduledEvent" ("isPublic", "status", "scheduledStartAt");

-- ---------------------------------------------------------------------------
-- 3. RSVP moves onto the existing interest row (K1)
-- ---------------------------------------------------------------------------
ALTER TABLE "ScheduledEventInterest"
  ADD COLUMN IF NOT EXISTS "status" "ScheduledEventRsvpStatus" NOT NULL DEFAULT 'GOING';

-- No backfill UPDATE runs here, and that is deliberate rather than forgotten: every row that
-- existed before this migration was written by a "Hatırlat" tap, which carried going intent.
-- The column default has already put all of them on GOING.

CREATE INDEX IF NOT EXISTS "ScheduledEventInterest_userId_status_idx"
  ON "ScheduledEventInterest" ("userId", "status");

-- ---------------------------------------------------------------------------
-- 4. Reminder preferences (K5)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ScheduledEventReminder" (
  "id"            TEXT NOT NULL,
  "eventId"       TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "minutesBefore" INTEGER NOT NULL DEFAULT 10,
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduledEventReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduledEventReminder_eventId_userId_key"
  ON "ScheduledEventReminder" ("eventId", "userId");

CREATE INDEX IF NOT EXISTS "ScheduledEventReminder_userId_idx"
  ON "ScheduledEventReminder" ("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScheduledEventReminder_eventId_fkey'
  ) THEN
    ALTER TABLE "ScheduledEventReminder"
      ADD CONSTRAINT "ScheduledEventReminder_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "ScheduledEvent"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScheduledEventReminder_userId_fkey'
  ) THEN
    ALTER TABLE "ScheduledEventReminder"
      ADD CONSTRAINT "ScheduledEventReminder_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. The bell in the events header (K7)
-- ---------------------------------------------------------------------------
ALTER TABLE "UserNotificationSettings"
  ADD COLUMN IF NOT EXISTS "eventNotifications" BOOLEAN NOT NULL DEFAULT true;
