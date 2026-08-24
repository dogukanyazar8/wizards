-- Ana Sayfa 1a — Faz 6. Direct-message mentions become rows.
--
-- A DM mention used to exist only as `DMParticipant.mentionCount`, which can say
-- how many but never which. The "Bahsedilmeler" screen lists individual
-- mentions, so its `Mesajlar` filter had no table to read.
--
-- Order matters: create, unique index, backfill, then the reading index. The
-- unique index goes first because the backfill leans on it (`ON CONFLICT DO
-- NOTHING` without a constraint to conflict on silently dedupes nothing); the
-- keyset index goes last so the bulk insert does not maintain it row by row.

CREATE TABLE IF NOT EXISTS "DMMessageMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMMessageMention_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DMMessageMention"
  DROP CONSTRAINT IF EXISTS "DMMessageMention_messageId_fkey";
ALTER TABLE "DMMessageMention"
  ADD CONSTRAINT "DMMessageMention_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "DMMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DMMessageMention"
  DROP CONSTRAINT IF EXISTS "DMMessageMention_userId_fkey";
ALTER TABLE "DMMessageMention"
  ADD CONSTRAINT "DMMessageMention_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "DMMessageMention_messageId_userId_key"
  ON "DMMessageMention"("messageId", "userId");

-- Backfill from the notification rows rather than from message text.
--
-- `createDMMessageNotifications` already persists `metadata.mentioned = true`
-- on the recipient's own row, so history is recorded exactly. Re-deriving it by
-- matching "@username" against `DMMessage.content` would be both a full text
-- scan and wrong for every user who has since renamed.
INSERT INTO "DMMessageMention" ("id", "messageId", "userId", "createdAt")
SELECT
    gen_random_uuid()::text,
    m."id",
    n."userId",
    m."createdAt"
FROM "Notification" n
INNER JOIN "DMMessage" m ON m."id" = (n."metadata" ->> 'messageId')
WHERE n."type" = 'DM'
  AND n."metadata" ->> 'mentioned' = 'true'
  AND m."deletedAt" IS NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS "DMMessageMention_userId_createdAt_idx"
  ON "DMMessageMention"("userId", "createdAt");
