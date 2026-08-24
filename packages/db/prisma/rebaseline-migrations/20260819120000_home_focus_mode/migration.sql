-- Ana Sayfa 1a, Faz 3 — timed focus mode ("Rahatsız etmeyin" with a duration).
--
-- Both columns are nullable and carry no default, so every existing account
-- reads as "focus off" the moment this lands and no row is rewritten.
--
-- Rollback: the two columns and the index can be dropped without touching any
-- other data; the only loss is the set of focus windows that were open at that
-- moment, which then read as "focus off" again.
--   DROP INDEX IF EXISTS "User_statusExpiresAt_idx";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "statusFocusMinutes",
--                      DROP COLUMN IF EXISTS "statusRestoreTo",
--                      DROP COLUMN IF EXISTS "statusExpiresAt";
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "statusExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "statusRestoreTo" "UserStatus",
  -- `statusExpiresAt` alone cannot say how far through a window is once the page
  -- reloads, and the card draws a progress ring.
  ADD COLUMN IF NOT EXISTS "statusFocusMinutes" INTEGER;

-- The sweep filters on `statusExpiresAt <= now`, which is a range scan over a
-- column that is null for almost every row.
CREATE INDEX IF NOT EXISTS "User_statusExpiresAt_idx" ON "User"("statusExpiresAt");
