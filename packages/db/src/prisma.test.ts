import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readPrismaPoolOptions } from "./pool-options";

const schema = readFileSync(
  fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)),
  "utf8",
);
const campaignDeliveryMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/rebaseline-migrations/20260727140000_campaign_delivery/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const telemetryMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../prisma/rebaseline-migrations/20260727150000_telemetry_platform_dims/migration.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

test("uses deliberate Prisma 7 PostgreSQL adapter pool defaults", () => {
  assert.deepEqual(
    readPrismaPoolOptions({
      DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/wizards",
    }),
    {
      connectionString: "postgresql://user:password@127.0.0.1:5432/wizards",
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000,
      max: 10,
    },
  );
});

test("campaign delivery is unique per campaign and per user", () => {
  const model = schema.match(/model CampaignDelivery \{[\s\S]*?\n\}/u)?.[0];

  assert.ok(model, "CampaignDelivery model is missing");
  assert.match(model, /@@unique\(\[campaignId, userId\]\)/u);
  assert.match(model, /status\s+CampaignDeliveryStatus\s+@default\(PENDING\)/u);
  assert.match(model, /skipReason\s+CampaignSkipReason\?/u);
  assert.match(model, /onDelete: Cascade/u);
  assert.match(schema, /enum CampaignDeliveryStatus \{\s*PENDING\s*SENT\s*SKIPPED\s*FAILED\s*\}/u);
  assert.match(
    schema,
    /enum CampaignSkipReason \{\s*FREQUENCY_CAP\s*NOT_DELIVERABLE\s*OPTED_OUT\s*\}/u,
  );
});

test("campaigns carry the approval and freeze stamps the send path reads", () => {
  const model = schema.match(/model NotificationCampaign \{[\s\S]*?\n\}/u)?.[0];

  assert.ok(model, "NotificationCampaign model is missing");
  assert.match(model, /approvedById\s+String\?/u);
  assert.match(model, /approvedAt\s+DateTime\?/u);
  assert.match(model, /frozenAt\s+DateTime\?/u);
  assert.match(model, /deliveries\s+CampaignDelivery\[\]/u);
  assert.match(schema, /enum NotificationCampaignStatus \{[\s\S]*?PENDING_APPROVAL[\s\S]*?\}/u);
});

test("the campaign delivery migration adds PENDING_APPROVAL without using it", () => {
  assert.match(campaignDeliveryMigration, /ALTER TYPE "NotificationCampaignStatus" ADD VALUE/u);
  assert.match(
    campaignDeliveryMigration,
    /CREATE UNIQUE INDEX "CampaignDelivery_campaignId_userId_key"/u,
  );

  // Postgres rejects a new enum value used in the transaction that added it.
  const statements = campaignDeliveryMigration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .filter((statement) => !statement.includes("ADD VALUE"));

  for (const statement of statements) {
    assert.doesNotMatch(statement, /PENDING_APPROVAL/u);
  }
});

test("daily metrics split by client so one user can hold MOBILE and UNKNOWN on one day", () => {
  const model = schema.match(/model UserDailyMetric \{[\s\S]*?\n\}/u)?.[0];

  assert.ok(model, "UserDailyMetric model is missing");
  assert.match(model, /clientType\s+AnalyticsClientType\s+@default\(UNKNOWN\)/u);
  assert.match(model, /appVersion\s+String\?\s+@db\.VarChar\(32\)/u);
  assert.match(model, /@@unique\(\[date, userId, clientType\]\)/u);
  assert.doesNotMatch(model, /@@unique\(\[date, userId\]\)/u);
  assert.match(model, /@@index\(\[date, clientType\]\)/u);

  // appVersion must stay out of the key: an in-day update would otherwise split
  // the row and scatter that day's totals across two versions.
  assert.doesNotMatch(model, /@@unique\(\[[^\]]*appVersion[^\]]*\]\)/u);
});

test("sessions record their version and whether the client identified itself", () => {
  const appSession = schema.match(/model AppSession \{[\s\S]*?\n\}/u)?.[0];
  const mediaSession = schema.match(/model MediaUsageSession \{[\s\S]*?\n\}/u)?.[0];

  assert.ok(appSession, "AppSession model is missing");
  assert.match(appSession, /appVersion\s+String\?\s+@db\.VarChar\(32\)/u);
  assert.match(appSession, /attributionVerified\s+Boolean\s+@default\(false\)/u);
  assert.match(appSession, /@@index\(\[clientType, startedAt\]\)/u);

  assert.ok(mediaSession, "MediaUsageSession model is missing");
  assert.match(mediaSession, /clientType\s+AnalyticsClientType\s+@default\(UNKNOWN\)/u);
});

test("the telemetry migration widens the daily metric key without losing rows", () => {
  assert.match(telemetryMigration, /DROP CONSTRAINT "UserDailyMetric_date_userId_key"/u);
  assert.match(
    telemetryMigration,
    /CREATE UNIQUE INDEX "UserDailyMetric_date_userId_clientType_key"/u,
  );
  assert.match(
    telemetryMigration,
    /ADD COLUMN "clientType" "AnalyticsClientType" NOT NULL DEFAULT 'UNKNOWN'/u,
  );
  assert.match(
    telemetryMigration,
    /ADD COLUMN "attributionVerified" BOOLEAN NOT NULL DEFAULT false/u,
  );

  // Backfilling or deleting rows here would be data loss; the widened key is
  // safe precisely because every existing (date, userId) pair is already unique.
  assert.doesNotMatch(telemetryMigration, /\bDELETE\b|\bTRUNCATE\b|\bDROP TABLE\b/u);
});

test("rejects missing, unsupported, and out-of-range connection settings", () => {
  assert.throws(() => readPrismaPoolOptions({}), /DATABASE_URL/);
  assert.throws(
    () =>
      readPrismaPoolOptions({
        DATABASE_URL: "prisma://accelerate.example",
      }),
    /direct PostgreSQL URL/i,
  );
  assert.throws(
    () =>
      readPrismaPoolOptions({
        DATABASE_POOL_MAX: "21",
        DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/wizards",
      }),
    /DATABASE_POOL_MAX/,
  );
});
