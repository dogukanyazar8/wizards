-- Signed Expo OTA metadata and native release artifacts. Private signing keys
-- never enter PostgreSQL; CI registers only immutable URLs, hashes and
-- signatures produced before publication.

CREATE TYPE "MobileUpdatePlatform" AS ENUM ('ANDROID', 'IOS');
CREATE TYPE "ReleaseArtifactKind" AS ENUM ('APK', 'AAB', 'IPA');

ALTER TABLE "Release" ADD COLUMN "minSupportedVersionCode" INTEGER;

CREATE TABLE "OtaBundle" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "platform" "MobileUpdatePlatform" NOT NULL,
    "channel" "ReleaseChannel" NOT NULL,
    "runtimeVersion" VARCHAR(256) NOT NULL,
    "bundleKey" VARCHAR(512) NOT NULL,
    "manifestBody" TEXT NOT NULL,
    "manifestSignature" TEXT NOT NULL,
    "manifestSha256" VARCHAR(64) NOT NULL,
    "noUpdateDirectiveBody" TEXT NOT NULL,
    "noUpdateDirectiveSignature" TEXT NOT NULL,
    "rollbackDirectiveBody" TEXT NOT NULL,
    "rollbackDirectiveSignature" TEXT NOT NULL,
    "signingKeyId" VARCHAR(128) NOT NULL,
    "rolloutPercentage" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtaBundle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OtaBundle_rolloutPercentage_check"
      CHECK ("rolloutPercentage" BETWEEN 0 AND 100),
    CONSTRAINT "OtaBundle_manifestSha256_check"
      CHECK ("manifestSha256" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "ReleaseArtifact" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "channel" "ReleaseChannel" NOT NULL,
    "platform" "MobileUpdatePlatform" NOT NULL,
    "kind" "ReleaseArtifactKind" NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "signingCertSha256" VARCHAR(95),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseArtifact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReleaseArtifact_versionCode_check" CHECK ("versionCode" > 0),
    CONSTRAINT "ReleaseArtifact_sizeBytes_check" CHECK ("sizeBytes" > 0),
    CONSTRAINT "ReleaseArtifact_url_check" CHECK ("url" LIKE 'https://%'),
    CONSTRAINT "ReleaseArtifact_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ReleaseArtifact_signingCertSha256_check"
      CHECK (
        "signingCertSha256" IS NULL
        OR "signingCertSha256" ~ '^([A-F0-9]{2}:){31}[A-F0-9]{2}$'
      )
);

CREATE UNIQUE INDEX "OtaBundle_bundleKey_key" ON "OtaBundle"("bundleKey");
CREATE INDEX "OtaBundle_platform_channel_runtimeVersion_publishedAt_idx"
  ON "OtaBundle"("platform", "channel", "runtimeVersion", "publishedAt");

CREATE UNIQUE INDEX "ReleaseArtifact_platform_kind_channel_versionCode_key"
  ON "ReleaseArtifact"("platform", "kind", "channel", "versionCode");
CREATE INDEX "ReleaseArtifact_releaseId_idx"
  ON "ReleaseArtifact"("releaseId");
CREATE INDEX "ReleaseArtifact_platform_kind_channel_versionCode_publishedAt_idx"
  ON "ReleaseArtifact"("platform", "kind", "channel", "versionCode", "publishedAt");

ALTER TABLE "OtaBundle"
  ADD CONSTRAINT "OtaBundle_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "Release"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReleaseArtifact"
  ADD CONSTRAINT "ReleaseArtifact_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "Release"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
