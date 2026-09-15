-- Two publication channels: STABLE (PROD) and UAT (Beta).
-- Never move signed packages between environments automatically.
BEGIN;
LOCK TABLE "User", "DownloadArtifact", "Release", "OtaBundle", "ReleaseArtifact" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Release" WHERE "channel"::text = 'BETA')
     OR EXISTS (SELECT 1 FROM "DownloadArtifact" WHERE "channel"::text = 'BETA')
     OR EXISTS (SELECT 1 FROM "OtaBundle" WHERE "channel"::text = 'BETA')
     OR EXISTS (SELECT 1 FROM "ReleaseArtifact" WHERE "channel"::text = 'BETA') THEN
    RAISE EXCEPTION 'Legacy BETA publication records require operator review before retiring the channel; signed artifacts must not be relabeled across environments.';
  END IF;
END $$;
UPDATE "User" SET "preferredReleaseChannel" = 'UAT'
WHERE "preferredReleaseChannel"::text = 'BETA';
ALTER TYPE "ReleaseChannel" RENAME TO "ReleaseChannel_old";
CREATE TYPE "ReleaseChannel" AS ENUM ('STABLE', 'UAT');
ALTER TABLE "Release" ALTER COLUMN "channel" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "preferredReleaseChannel" TYPE "ReleaseChannel" USING ("preferredReleaseChannel"::text::"ReleaseChannel");
ALTER TABLE "DownloadArtifact" ALTER COLUMN "channel" TYPE "ReleaseChannel" USING ("channel"::text::"ReleaseChannel");
ALTER TABLE "Release" ALTER COLUMN "channel" TYPE "ReleaseChannel" USING ("channel"::text::"ReleaseChannel");
ALTER TABLE "OtaBundle" ALTER COLUMN "channel" TYPE "ReleaseChannel" USING ("channel"::text::"ReleaseChannel");
ALTER TABLE "ReleaseArtifact" ALTER COLUMN "channel" TYPE "ReleaseChannel" USING ("channel"::text::"ReleaseChannel");
ALTER TABLE "Release" ALTER COLUMN "channel" SET DEFAULT 'STABLE';
DROP TYPE "ReleaseChannel_old";
COMMIT;
