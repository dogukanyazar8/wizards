-- CreateEnum
CREATE TYPE "DownloadPlatform" AS ENUM ('WINDOWS', 'MACOS', 'LINUX', 'ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "DownloadDelivery" AS ENUM ('DIRECT', 'STORE', 'TESTFLIGHT');

-- CreateTable
CREATE TABLE "DownloadArtifact" (
    "id" TEXT NOT NULL,
    "channel" "ReleaseChannel" NOT NULL,
    "platform" "DownloadPlatform" NOT NULL,
    "delivery" "DownloadDelivery" NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "extensionLabelTr" VARCHAR(120) NOT NULL,
    "extensionLabelEn" VARCHAR(120) NOT NULL,
    "metaLabelTr" VARCHAR(120) NOT NULL,
    "metaLabelEn" VARCHAR(120) NOT NULL,
    "versionLabel" VARCHAR(32) NOT NULL,
    "buildLabel" VARCHAR(32),
    "sizeBytes" BIGINT,
    "sha256" VARCHAR(64),
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DownloadArtifact_channel_platform_key" ON "DownloadArtifact"("channel", "platform");

-- CreateIndex
CREATE INDEX "DownloadArtifact_channel_publishedAt_idx" ON "DownloadArtifact"("channel", "publishedAt");
