-- Percentiles are only actionable per surface: pooling every SCREEN_LOAD into one
-- bucket hid a slow conversation behind a fast inbox. The unique key grows with
-- it, and existing rows land in the empty-string bucket they already represent.
ALTER TABLE "ClientHealthDailySummary" ADD COLUMN "surface" VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE "ClientHealthDailySummary" ADD COLUMN "p99Ms" INTEGER;

DROP INDEX IF EXISTS "ClientHealthDailySummary_date_clientType_appVersion_kind_key";
CREATE UNIQUE INDEX "ClientHealthDailySummary_date_clientType_appVersion_kind_su_key"
  ON "ClientHealthDailySummary" ("date", "clientType", "appVersion", "kind", "surface");

-- The reporter retries a batch it may already have delivered, so the same
-- measurement can arrive twice. The client stamps each sample with an id; this is
-- what makes the second arrival a no-op instead of a second data point.
ALTER TABLE "ClientHealthEvent" ADD COLUMN "sampleId" VARCHAR(64);
CREATE UNIQUE INDEX "ClientHealthEvent_sampleId_key" ON "ClientHealthEvent" ("sampleId");
