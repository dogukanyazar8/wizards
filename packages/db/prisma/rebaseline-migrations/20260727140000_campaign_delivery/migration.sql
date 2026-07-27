-- Campaign delivery ledger: one row per (campaign, user) so a retried campaign
-- never sends a second notification to somebody who already received it.
CREATE TYPE "CampaignDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

CREATE TYPE "CampaignSkipReason" AS ENUM ('FREQUENCY_CAP', 'NOT_DELIVERABLE', 'OPTED_OUT');

-- Postgres forbids using a new enum value in the transaction that adds it, so
-- this migration only introduces PENDING_APPROVAL; the approval flow writes it.
ALTER TYPE "NotificationCampaignStatus" ADD VALUE 'PENDING_APPROVAL';

ALTER TABLE "NotificationCampaign"
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "frozenAt" TIMESTAMP(3);

CREATE TABLE "CampaignDelivery" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "CampaignDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "skipReason" "CampaignSkipReason",
  "error" VARCHAR(280),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignDelivery_campaignId_userId_key" ON "CampaignDelivery"("campaignId", "userId");

CREATE INDEX "CampaignDelivery_campaignId_status_idx" ON "CampaignDelivery"("campaignId", "status");

-- Serves the 24 hour frequency cap lookup performed while freezing a list.
CREATE INDEX "CampaignDelivery_userId_status_sentAt_idx" ON "CampaignDelivery"("userId", "status", "sentAt");

ALTER TABLE "CampaignDelivery" ADD CONSTRAINT "CampaignDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignDelivery" ADD CONSTRAINT "CampaignDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationCampaign" ADD CONSTRAINT "NotificationCampaign_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
