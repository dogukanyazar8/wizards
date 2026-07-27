-- Profile reports become durable, operator-owned cases. Content snapshots are
-- modelled now but intentionally remain empty until the D2 report contract ships.
CREATE TYPE "ModerationCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ACTIONED', 'DISMISSED', 'APPEALED', 'CLOSED');

CREATE TYPE "ModerationCasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TYPE "ModerationEventKind" AS ENUM ('REPORT_ADDED', 'NOTE', 'STATUS_CHANGED', 'ASSIGNED', 'ACTION_TAKEN', 'APPEAL_OPENED', 'APPEAL_RESOLVED');

ALTER TABLE "UserReport" ADD COLUMN "caseId" TEXT;

CREATE TABLE "ModerationCase" (
  "id" TEXT NOT NULL,
  "publicNumber" SERIAL NOT NULL,
  "subjectId" TEXT,
  "subjectHandle" VARCHAR(64) NOT NULL,
  "status" "ModerationCaseStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "ModerationCasePriority" NOT NULL DEFAULT 'NORMAL',
  "assigneeId" TEXT,
  "reportCount" INTEGER NOT NULL DEFAULT 0,
  "summary" VARCHAR(280),
  "resolution" VARCHAR(1000),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstSeenAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "evidencePurgeAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationCaseEvent" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "actorId" TEXT,
  "kind" "ModerationEventKind" NOT NULL,
  "body" VARCHAR(1000),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModerationCaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationEvidence" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "reportId" TEXT,
  "messageId" TEXT,
  "dmMessageId" TEXT,
  "attachmentId" TEXT,
  "snapshot" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ModerationEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModerationCase_publicNumber_key" ON "ModerationCase"("publicNumber");
CREATE INDEX "ModerationCase_status_priority_openedAt_idx" ON "ModerationCase"("status", "priority", "openedAt");
CREATE INDEX "ModerationCase_assigneeId_status_idx" ON "ModerationCase"("assigneeId", "status");
CREATE INDEX "ModerationCase_subjectId_status_idx" ON "ModerationCase"("subjectId", "status");
CREATE INDEX "ModerationCase_evidencePurgeAt_idx" ON "ModerationCase"("evidencePurgeAt");
CREATE INDEX "ModerationCaseEvent_caseId_createdAt_idx" ON "ModerationCaseEvent"("caseId", "createdAt");
CREATE INDEX "ModerationEvidence_caseId_capturedAt_idx" ON "ModerationEvidence"("caseId", "capturedAt");
CREATE INDEX "ModerationEvidence_reportId_idx" ON "ModerationEvidence"("reportId");
CREATE INDEX "UserReport_caseId_idx" ON "UserReport"("caseId");

-- A deleted subject or operator must not erase the case trail. Case-owned rows
-- may cascade only when the case itself is deliberately removed.
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationCaseEvent" ADD CONSTRAINT "ModerationCaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationCaseEvent" ADD CONSTRAINT "ModerationCaseEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationEvidence" ADD CONSTRAINT "ModerationEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationEvidence" ADD CONSTRAINT "ModerationEvidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "UserReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
