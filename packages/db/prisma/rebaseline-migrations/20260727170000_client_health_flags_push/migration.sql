-- Client health signals, feature flags and push delivery attempts. All three
-- tables are additive: nothing existing is rewritten, so the migration is safe
-- to apply while the app is serving traffic.
CREATE TYPE "ClientHealthKind" AS ENUM ('STARTUP', 'SCREEN_LOAD', 'CRASH', 'ERROR', 'API_LATENCY');

CREATE TYPE "PushAttemptStage" AS ENUM ('TICKET', 'RECEIPT');

CREATE TABLE "ClientHealthEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "clientType" "AnalyticsClientType" NOT NULL DEFAULT 'UNKNOWN',
  "appVersion" VARCHAR(32),
  "os" VARCHAR(32),
  "kind" "ClientHealthKind" NOT NULL,
  "surface" VARCHAR(64),
  "valueMs" INTEGER,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientHealthEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientHealthEvent_kind_createdAt_idx" ON "ClientHealthEvent"("kind", "createdAt");

CREATE INDEX "ClientHealthEvent_clientType_kind_createdAt_idx" ON "ClientHealthEvent"("clientType", "kind", "createdAt");

CREATE INDEX "ClientHealthEvent_appVersion_kind_createdAt_idx" ON "ClientHealthEvent"("appVersion", "kind", "createdAt");

ALTER TABLE "ClientHealthEvent"
  ADD CONSTRAINT "ClientHealthEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ClientHealthDailySummary" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "clientType" "AnalyticsClientType" NOT NULL DEFAULT 'UNKNOWN',
  -- Empty string rather than NULL: NULLs never collide in a unique index, so a
  -- nullable version column would let the rollup insert duplicates.
  "appVersion" VARCHAR(32) NOT NULL DEFAULT '',
  "kind" "ClientHealthKind" NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "p50Ms" INTEGER,
  "p95Ms" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientHealthDailySummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientHealthDailySummary_date_clientType_appVersion_kind_key" ON "ClientHealthDailySummary"("date", "clientType", "appVersion", "kind");

CREATE INDEX "ClientHealthDailySummary_date_kind_idx" ON "ClientHealthDailySummary"("date", "kind");

CREATE TABLE "FeatureFlag" (
  "key" VARCHAR(64) NOT NULL,
  "description" VARCHAR(280),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "clientTypes" "AnalyticsClientType"[],
  "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "FeatureFlag"
  ADD CONSTRAINT "FeatureFlag_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PushDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "campaignId" TEXT,
  "notificationId" TEXT,
  "platform" VARCHAR(16) NOT NULL,
  "stage" "PushAttemptStage" NOT NULL DEFAULT 'TICKET',
  "ticketId" VARCHAR(64),
  "success" BOOLEAN NOT NULL,
  "errorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PushDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PushDeliveryAttempt_campaignId_success_idx" ON "PushDeliveryAttempt"("campaignId", "success");

CREATE INDEX "PushDeliveryAttempt_platform_stage_createdAt_idx" ON "PushDeliveryAttempt"("platform", "stage", "createdAt");

CREATE INDEX "PushDeliveryAttempt_errorCode_createdAt_idx" ON "PushDeliveryAttempt"("errorCode", "createdAt");

CREATE INDEX "PushDeliveryAttempt_ticketId_idx" ON "PushDeliveryAttempt"("ticketId");

ALTER TABLE "PushDeliveryAttempt"
  ADD CONSTRAINT "PushDeliveryAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PushDeliveryAttempt"
  ADD CONSTRAINT "PushDeliveryAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
