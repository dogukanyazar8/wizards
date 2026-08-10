-- 6d discovery labels. Deliberately a new column rather than a reuse of
-- `features`: that column is a capability flag list (VERIFIED, FEATURED,
-- TEXT_GIFS_DISABLED) the product writes, and letting owner-authored labels
-- share it would make a tag edit able to revoke a verification badge.
ALTER TABLE "Server" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The discovery search matches a tag with `tags @> ARRAY[...]`. A B-tree
-- cannot serve array containment; GIN is the only index type Postgres has for
-- that operator on `text[]`.
CREATE INDEX "Server_tags_idx" ON "Server" USING GIN ("tags");

-- 6c "Yıldızla". A device-local flag would disagree between a phone and the
-- web client, so the pin lives on the shared per-user server settings row.
ALTER TABLE "UserServerSettings"
  ADD COLUMN "starred" BOOLEAN NOT NULL DEFAULT false;

-- The profile card asks for the next SCHEDULED event at or after now, ordered
-- by start time. The existing `[serverId]` index makes that a filter-and-sort
-- over every event the server ever had.
CREATE INDEX "ScheduledEvent_serverId_status_scheduledStartAt_idx"
  ON "ScheduledEvent"("serverId", "status", "scheduledStartAt");

-- `interestedCount` alone cannot be idempotent: a second "Hatırlat" tap from
-- the same user would increment it again. This table is the uniqueness the
-- counter borrows -- the counter only moves when the insert or delete
-- actually changed a row.
CREATE TABLE "ScheduledEventInterest" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScheduledEventInterest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduledEventInterest_eventId_userId_key"
  ON "ScheduledEventInterest"("eventId", "userId");

CREATE INDEX "ScheduledEventInterest_userId_idx" ON "ScheduledEventInterest"("userId");

ALTER TABLE "ScheduledEventInterest"
  ADD CONSTRAINT "ScheduledEventInterest_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "ScheduledEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduledEventInterest"
  ADD CONSTRAINT "ScheduledEventInterest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
