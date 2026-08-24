-- Ana Sayfa 1a, Faz 3 — "Bahsedilmeler" ordered by time.
--
-- Chosen by measurement, not by preference. On a synthetic 2M-message /
-- 400k-mention set where the viewer owns 4 000 mentions and can see 250
-- channels, LIMIT 20:
--   mention-driven join, @@index([userId]) only : 21 454 buffers, 22.6 ms
--   message-driven semi-join                    : 18 971 buffers,  9.9 ms
--   this plan (denormalized createdAt)          :     213 buffers,  0.15 ms
-- The first two both cost O(all mentions this user ever received); only this
-- one is O(page).
--
-- Rollback: DROP INDEX "MessageMention_userId_createdAt_idx" then
--           ALTER TABLE "MessageMention" DROP COLUMN "createdAt";
--           nothing else reads the column.
ALTER TABLE "MessageMention" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);

-- Backfill from the message itself so existing rows keep their real order. New
-- rows take the column default instead, which is the outbox worker's write time
-- rather than the message's — the two differ by the drain latency (seconds).
UPDATE "MessageMention" mm
SET "createdAt" = m."createdAt"
FROM "Message" m
WHERE m."id" = mm."messageId"
  AND mm."createdAt" IS NULL;

-- Any row whose message vanished between the two statements still has to land
-- somewhere; the row is unreachable through the FK anyway.
UPDATE "MessageMention" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL;

ALTER TABLE "MessageMention" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MessageMention" ALTER COLUMN "createdAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "MessageMention_userId_createdAt_idx"
  ON "MessageMention"("userId", "createdAt");
