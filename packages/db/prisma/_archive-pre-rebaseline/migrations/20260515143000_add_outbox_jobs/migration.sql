ALTER TABLE "Notification"
ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Notification_dedupeKey_key"
ON "Notification"("dedupeKey");

CREATE TABLE "OutboxJob" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "type" VARCHAR(80) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboxJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxJob_idempotencyKey_key"
ON "OutboxJob"("idempotencyKey");

CREATE INDEX "OutboxJob_status_availableAt_createdAt_idx"
ON "OutboxJob"("status", "availableAt", "createdAt");

CREATE INDEX "OutboxJob_status_updatedAt_idx"
ON "OutboxJob"("status", "updatedAt");

CREATE INDEX "OutboxJob_type_status_idx"
ON "OutboxJob"("type", "status");

CREATE INDEX "OutboxJob_lockedAt_idx"
ON "OutboxJob"("lockedAt");
