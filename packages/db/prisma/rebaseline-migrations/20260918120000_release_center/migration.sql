CREATE TYPE "ReleaseProduct" AS ENUM ('DESKTOP', 'MOBILE');
ALTER TABLE "Release"
  ADD COLUMN "product" "ReleaseProduct" NOT NULL DEFAULT 'MOBILE',
  ADD COLUMN "sourceSha" VARCHAR(40),
  ADD COLUMN "sourceRunId" VARCHAR(20),
  ADD COLUMN "publicationDigest" VARCHAR(64),
  ADD COLUMN "publication" JSONB,
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
DROP INDEX "Release_version_key";
CREATE UNIQUE INDEX "Release_product_channel_version_key" ON "Release"("product", "channel", "version");
CREATE INDEX "Release_product_channel_active_publishedAt_idx" ON "Release"("product", "channel", "active", "publishedAt");
ALTER TABLE "DownloadArtifact" ADD COLUMN "releaseId" TEXT;
CREATE INDEX "DownloadArtifact_releaseId_idx" ON "DownloadArtifact"("releaseId");
ALTER TABLE "DownloadArtifact" ADD CONSTRAINT "DownloadArtifact_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Historical records are mobile notes. Do not guess desktop identity or adopt
-- independent mutable downloads as verified CI packages. They remain editable
-- legacy entries until the first verified publication replaces their pointer.
