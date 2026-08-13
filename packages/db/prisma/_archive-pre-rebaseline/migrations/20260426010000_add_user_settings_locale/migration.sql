-- Persist locale preferences alongside theme preferences.

ALTER TABLE "UserSettings"
ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'en';

UPDATE "UserSettings" AS "settings"
SET "locale" = COALESCE("users"."locale", 'en')
FROM "User" AS "users"
WHERE "users"."id" = "settings"."userId"
  AND ("settings"."locale" IS NULL OR "settings"."locale" = 'en');
