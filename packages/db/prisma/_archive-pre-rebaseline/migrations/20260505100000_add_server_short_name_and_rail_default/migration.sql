ALTER TABLE "Server" ADD COLUMN "shortName" VARCHAR(4);

ALTER TABLE "UserSettings" ALTER COLUMN "serverRailWidth" SET DEFAULT 136;

UPDATE "UserSettings"
SET "serverRailWidth" = 136
WHERE "serverRailWidth" = 88;
