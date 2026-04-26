-- Normalize persisted theme values and add a user-settings theme column.

ALTER TABLE "User"
ALTER COLUMN "theme" SET DEFAULT 'theme-dark';

UPDATE "User"
SET "theme" = CASE
  WHEN "theme" = 'light' THEN 'theme-light'
  WHEN "theme" = 'dark' THEN 'theme-dark'
  WHEN "theme" = 'theme-dawn' THEN 'theme-light'
  WHEN "theme" = 'theme-graphite' THEN 'theme-ash'
  WHEN "theme" = 'theme-midnight' THEN 'theme-onyx'
  WHEN "theme" = 'theme-mist' THEN 'theme-sage-green'
  WHEN "theme" = 'theme-studio' THEN 'theme-purple-teal'
  ELSE "theme"
END;

ALTER TABLE "UserSettings"
ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'theme-dark';

UPDATE "UserSettings" AS "settings"
SET "theme" = CASE
  WHEN "settings"."theme" = 'light' THEN 'theme-light'
  WHEN "settings"."theme" = 'dark' THEN 'theme-dark'
  WHEN "settings"."theme" = 'theme-dawn' THEN 'theme-light'
  WHEN "settings"."theme" = 'theme-graphite' THEN 'theme-ash'
  WHEN "settings"."theme" = 'theme-midnight' THEN 'theme-onyx'
  WHEN "settings"."theme" = 'theme-mist' THEN 'theme-sage-green'
  WHEN "settings"."theme" = 'theme-studio' THEN 'theme-purple-teal'
  ELSE COALESCE("users"."theme", 'theme-dark')
END
FROM "User" AS "users"
WHERE "users"."id" = "settings"."userId";
