ALTER TABLE "Server"
ADD COLUMN "deletedMessageNoticeMinutes" INTEGER NOT NULL DEFAULT 60;

ALTER TABLE "Message"
ADD COLUMN "placeholderExpiresAt" TIMESTAMP(3);

UPDATE "Message"
SET "placeholderExpiresAt" = "deletedAt" + INTERVAL '1 hour'
WHERE "deletedAt" IS NOT NULL
  AND "placeholderExpiresAt" IS NULL;

CREATE INDEX "Message_channelId_placeholderRemovedAt_placeholderExpiresAt_idx"
ON "Message"("channelId", "placeholderRemovedAt", "placeholderExpiresAt");
