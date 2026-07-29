-- The "Hakkında" redesign reads four things the database could not answer:
-- which versions shipped and what changed in them, which help articles exist,
-- which channel a user opted into, and where a bug report goes. None of it fits
-- the product `Feedback` queue, which stays untouched.

-- CreateEnum
CREATE TYPE "ReleaseChannel" AS ENUM ('STABLE', 'BETA', 'UAT');

-- CreateEnum
CREATE TYPE "ReleaseChangeType" AS ENUM ('NEW', 'IMPROVED', 'FIXED');

-- CreateEnum
CREATE TYPE "HelpCategory" AS ENUM ('ACCOUNT', 'CHAT', 'MEDIA', 'SERVER');

-- CreateEnum
CREATE TYPE "BugReportCategory" AS ENUM ('VOICE', 'CHAT', 'NOTIFICATION', 'PERFORMANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "BugReportStatus" AS ENUM ('OPEN', 'TRIAGED', 'RESOLVED', 'DISCARDED');

-- 2c writes a preference, not a build target: the column changes which stream
-- the app offers next and nothing about the binary already installed.
ALTER TABLE "User" ADD COLUMN "preferredReleaseChannel" "ReleaseChannel";

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "codename" VARCHAR(48),
    "channel" "ReleaseChannel" NOT NULL DEFAULT 'STABLE',
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "buildNumber" INTEGER,
    "sizeBytes" BIGINT,
    "summary" VARCHAR(600),
    "highlight" VARCHAR(160),
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseChange" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "type" "ReleaseChangeType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "detail" VARCHAR(600),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReleaseChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" "HelpCategory" NOT NULL,
    "readMinutes" INTEGER NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "url" VARCHAR(2048) NOT NULL,
    "bodyMarkdown" TEXT,
    "publishedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "ticket" VARCHAR(16) NOT NULL,
    "userId" TEXT,
    "category" "BugReportCategory" NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "includesLogs" BOOLEAN NOT NULL,
    "includesScreenshot" BOOLEAN NOT NULL,
    "includesDeviceInfo" BOOLEAN NOT NULL,
    "logExcerpt" TEXT,
    "deviceInfo" JSONB,
    "screenshotUrl" VARCHAR(2048),
    "appVersion" VARCHAR(32),
    "appBuild" VARCHAR(32),
    "releaseChannel" VARCHAR(16),
    "platform" VARCHAR(16),
    "status" "BugReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- The detail route and the installed-version comparison both address a release
-- by its semver text, so two rows may never claim the same one.
CREATE UNIQUE INDEX "Release_version_key" ON "Release"("version");

CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");

-- The number quoted back in the submission toast; support searches by it.
CREATE UNIQUE INDEX "BugReport_ticket_key" ON "BugReport"("ticket");

-- 2b pages published releases newest-first; the update check reads the newest
-- one on a channel.
CREATE INDEX "Release_publishedAt_releasedAt_idx" ON "Release"("publishedAt", "releasedAt");
CREATE INDEX "Release_channel_releasedAt_idx" ON "Release"("channel", "releasedAt");

-- 2a groups by type and orders inside the group.
CREATE INDEX "ReleaseChange_releaseId_type_position_idx" ON "ReleaseChange"("releaseId", "type", "position");

-- 2e reads a category tile in `position` order and the popular list by views.
CREATE INDEX "HelpArticle_category_position_idx" ON "HelpArticle"("category", "position");
CREATE INDEX "HelpArticle_publishedAt_viewCount_idx" ON "HelpArticle"("publishedAt", "viewCount");

-- Triage reads the open queue, the purge job reads the expiry, and a user reads
-- their own history.
CREATE INDEX "BugReport_status_createdAt_idx" ON "BugReport"("status", "createdAt");
CREATE INDEX "BugReport_purgeAfter_idx" ON "BugReport"("purgeAfter");
CREATE INDEX "BugReport_userId_createdAt_idx" ON "BugReport"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReleaseChange" ADD CONSTRAINT "ReleaseChange_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A deleted account must not take the report with it: the bug is still real and
-- the 90-day timer still owns the row.
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
