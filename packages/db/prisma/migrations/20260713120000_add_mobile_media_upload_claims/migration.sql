-- CreateEnum
CREATE TYPE "MobileMediaUploadPurpose" AS ENUM ('PROFILE_AVATAR', 'SERVER_ICON');

-- CreateTable
-- ownerId and targetServerId intentionally have no foreign keys so cleanup can
-- finish after the owning user or target server has been deleted.
CREATE TABLE "MobileMediaUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" "MobileMediaUploadPurpose" NOT NULL,
    "targetServerId" TEXT,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "cleanupAfter" TIMESTAMP(3),
    "cleanupLastAttemptAt" TIMESTAMP(3),
    "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
    "storageDeletedAt" TIMESTAMP(3),

    CONSTRAINT "MobileMediaUpload_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MobileMediaUpload_purpose_target_check" CHECK (("purpose" = 'PROFILE_AVATAR' AND "targetServerId" IS NULL) OR ("purpose" = 'SERVER_ICON' AND "targetServerId" IS NOT NULL)),
    CONSTRAINT "MobileMediaUpload_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 4194304),
    CONSTRAINT "MobileMediaUpload_dimensions_check" CHECK ("width" > 0 AND "height" > 0 AND "width" <= 4096 AND "height" <= 4096 AND ("width"::BIGINT * "height"::BIGINT) <= 16000000),
    CONSTRAINT "MobileMediaUpload_expiry_check" CHECK ("expiresAt" > "createdAt")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileMediaUpload_storageKey_key" ON "MobileMediaUpload"("storageKey");

-- CreateIndex
CREATE INDEX "MobileMediaUpload_ownerId_purpose_targetServerId_idx" ON "MobileMediaUpload"("ownerId", "purpose", "targetServerId");

-- CreateIndex
CREATE INDEX "MobileMediaUpload_expiresAt_claimedAt_idx" ON "MobileMediaUpload"("expiresAt", "claimedAt");

-- CreateIndex
CREATE INDEX "MobileMediaUpload_cleanupAfter_storageDeletedAt_idx" ON "MobileMediaUpload"("cleanupAfter", "storageDeletedAt");
