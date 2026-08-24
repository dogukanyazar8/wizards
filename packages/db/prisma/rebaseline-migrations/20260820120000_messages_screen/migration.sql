-- Mesajlar paketi — Dalga 0 / Ş0.2 and Dalga 1 / Ş2. Five independent changes.
--
--   1. GroupHistoryVisibility gains LAST_7D (karar #9).
--   2. UserSettings gains friendsSort (karar #8).
--   3. DMPinnedMessage: many pins per conversation, backfilled from the single
--      pin the conversation row carried (karar #7).
--   4. Poll / PollOption / PollVote: a real poll, replacing markdown + emoji
--      reactions (karar #1).
--   5. DMConversation.avatarColor widens for swatch names (karar #4).
--
-- Nothing is dropped. `DMConversation.pinnedMessageId` keeps its rows for one
-- release: this migration stops being its only reader, and dropping a column in
-- the same release that stops writing it leaves no way back if a reader was
-- missed.

-- ---------------------------------------------------------------------------
-- 1. Seven-day history window
-- ---------------------------------------------------------------------------
-- Added after LAST_24H so the enum reads shortest-to-longest. Postgres keeps
-- enum values ordered by their declared position, and one query sorts on it.
ALTER TYPE "GroupHistoryVisibility" ADD VALUE IF NOT EXISTS 'LAST_7D' AFTER 'LAST_24H';

-- ---------------------------------------------------------------------------
-- 2. Friends list ordering
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FriendsSort') THEN
    CREATE TYPE "FriendsSort" AS ENUM ('STATUS', 'NAME', 'RECENT');
  END IF;
END
$$;

ALTER TABLE "UserSettings"
  ADD COLUMN IF NOT EXISTS "friendsSort" "FriendsSort" NOT NULL DEFAULT 'STATUS';

-- ---------------------------------------------------------------------------
-- 3. Multi-pin for DM and group conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "DMPinnedMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMPinnedMessage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DMPinnedMessage"
  DROP CONSTRAINT IF EXISTS "DMPinnedMessage_conversationId_fkey";
ALTER TABLE "DMPinnedMessage"
  ADD CONSTRAINT "DMPinnedMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "DMConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DMPinnedMessage"
  DROP CONSTRAINT IF EXISTS "DMPinnedMessage_messageId_fkey";
ALTER TABLE "DMPinnedMessage"
  ADD CONSTRAINT "DMPinnedMessage_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DMPinnedMessage"
  DROP CONSTRAINT IF EXISTS "DMPinnedMessage_pinnedById_fkey";
ALTER TABLE "DMPinnedMessage"
  ADD CONSTRAINT "DMPinnedMessage_pinnedById_fkey"
  FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The unique index goes in before the backfill: `ON CONFLICT DO NOTHING` without
-- a constraint to conflict on silently dedupes nothing.
CREATE UNIQUE INDEX IF NOT EXISTS "DMPinnedMessage_conversationId_messageId_key"
  ON "DMPinnedMessage"("conversationId", "messageId");

-- Backfill the one pin each conversation could hold.
--
-- `pinnedById` is NOT NULL here but nullable on the source row. A conversation
-- with a pinned message and no pinner is a row written before that column
-- existed; it falls back to the conversation owner, and to the message author
-- when even the owner is unknown, so no pin is lost to a missing attribution.
INSERT INTO "DMPinnedMessage" ("id", "conversationId", "messageId", "pinnedById", "pinnedAt")
SELECT
    gen_random_uuid()::text,
    c."id",
    c."pinnedMessageId",
    COALESCE(c."pinnedById", c."ownerId", m."userId"),
    COALESCE(c."pinnedAt", m."createdAt")
FROM "DMConversation" c
INNER JOIN "DMMessage" m ON m."id" = c."pinnedMessageId"
WHERE c."pinnedMessageId" IS NOT NULL
  AND m."deletedAt" IS NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS "DMPinnedMessage_conversationId_pinnedAt_idx"
  ON "DMPinnedMessage"("conversationId", "pinnedAt");
CREATE INDEX IF NOT EXISTS "DMPinnedMessage_messageId_idx"
  ON "DMPinnedMessage"("messageId");
CREATE INDEX IF NOT EXISTS "DMPinnedMessage_pinnedById_idx"
  ON "DMPinnedMessage"("pinnedById");

-- ---------------------------------------------------------------------------
-- 4. Polls
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Poll" (
    "id" TEXT NOT NULL,
    "dmMessageId" TEXT,
    "messageId" TEXT,
    "createdById" TEXT NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "multi" BOOLEAN NOT NULL DEFAULT false,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- Exactly one owner. Prisma cannot express this, and without it a poll could
-- attach to both a DM message and a channel message, or to neither — the second
-- case being a poll no reader can ever reach.
ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_single_owner_check";
ALTER TABLE "Poll"
  ADD CONSTRAINT "Poll_single_owner_check"
  CHECK (num_nonnulls("dmMessageId", "messageId") = 1);

ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_dmMessageId_fkey";
ALTER TABLE "Poll"
  ADD CONSTRAINT "Poll_dmMessageId_fkey"
  FOREIGN KEY ("dmMessageId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_messageId_fkey";
ALTER TABLE "Poll"
  ADD CONSTRAINT "Poll_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Poll" DROP CONSTRAINT IF EXISTS "Poll_createdById_fkey";
ALTER TABLE "Poll"
  ADD CONSTRAINT "Poll_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "Poll_dmMessageId_key" ON "Poll"("dmMessageId");
CREATE UNIQUE INDEX IF NOT EXISTS "Poll_messageId_key" ON "Poll"("messageId");
CREATE INDEX IF NOT EXISTS "Poll_createdById_idx" ON "Poll"("createdById");
CREATE INDEX IF NOT EXISTS "Poll_closesAt_idx" ON "Poll"("closesAt");

CREATE TABLE IF NOT EXISTS "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" VARCHAR(80) NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PollOption" DROP CONSTRAINT IF EXISTS "PollOption_pollId_fkey";
ALTER TABLE "PollOption"
  ADD CONSTRAINT "PollOption_pollId_fkey"
  FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "PollOption_pollId_position_key"
  ON "PollOption"("pollId", "position");

CREATE TABLE IF NOT EXISTS "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PollVote" DROP CONSTRAINT IF EXISTS "PollVote_pollId_fkey";
ALTER TABLE "PollVote"
  ADD CONSTRAINT "PollVote_pollId_fkey"
  FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PollVote" DROP CONSTRAINT IF EXISTS "PollVote_optionId_fkey";
ALTER TABLE "PollVote"
  ADD CONSTRAINT "PollVote_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PollVote" DROP CONSTRAINT IF EXISTS "PollVote_userId_fkey";
ALTER TABLE "PollVote"
  ADD CONSTRAINT "PollVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per (option, voter). This is what makes a double-tap idempotent and
-- what two concurrent votes from the same user collide on.
CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_optionId_userId_key"
  ON "PollVote"("optionId", "userId");
CREATE INDEX IF NOT EXISTS "PollVote_pollId_userId_idx"
  ON "PollVote"("pollId", "userId");

-- ---------------------------------------------------------------------------
-- 5. Group swatch names no longer fit a hex column by luck
-- ---------------------------------------------------------------------------
-- karar #4 replaced the five hex swatches with six token names. Three of them
-- ("primary", "success", "warning") are exactly seven characters, so VARCHAR(7)
-- held them only by accident; a seventh swatch would have been truncated with no
-- error. Widening is safe on existing rows and cheap: Postgres rewrites nothing
-- when a varchar limit only grows.
--
-- Existing rows keep their hex. `mapLegacyGroupAvatarColor` resolves them on
-- read, so nothing is rewritten and a conversation nobody opens is untouched.
ALTER TABLE "DMConversation" ALTER COLUMN "avatarColor" TYPE VARCHAR(16);
