-- CreateEnum
CREATE TYPE "UserReportReason" AS ENUM ('HARASSMENT', 'SPAM', 'INAPPROPRIATE', 'IMPERSONATION', 'OTHER');

-- CreateTable
CREATE TABLE "UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" "UserReportReason" NOT NULL,
    "details" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

-- Reports are written by the profile card and read only by future moderation
-- tooling, so both indexes are ordered by recency.
CREATE INDEX "UserReport_subjectId_createdAt_idx" ON "UserReport"("subjectId", "createdAt");

CREATE INDEX "UserReport_reporterId_createdAt_idx" ON "UserReport"("reporterId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
