-- Platform and version dimensions for analytics. Existing rows take UNKNOWN:
-- the pairs they hold are already unique, so widening the key cannot collide.
DROP INDEX "UserDailyMetric_date_userId_key";

ALTER TABLE "UserDailyMetric"
  ADD COLUMN "clientType" "AnalyticsClientType" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "appVersion" VARCHAR(32);

CREATE UNIQUE INDEX "UserDailyMetric_date_userId_clientType_key" ON "UserDailyMetric"("date", "userId", "clientType");

CREATE INDEX "UserDailyMetric_date_clientType_idx" ON "UserDailyMetric"("date", "clientType");

-- Sessions written before the client contract carry a guessed clientType, so
-- they stay attributionVerified = false and are reported as UNKNOWN.
ALTER TABLE "AppSession"
  ADD COLUMN "appVersion" VARCHAR(32),
  ADD COLUMN "attributionVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AppSession_clientType_startedAt_idx" ON "AppSession"("clientType", "startedAt");

ALTER TABLE "MediaUsageSession"
  ADD COLUMN "clientType" "AnalyticsClientType" NOT NULL DEFAULT 'UNKNOWN';
