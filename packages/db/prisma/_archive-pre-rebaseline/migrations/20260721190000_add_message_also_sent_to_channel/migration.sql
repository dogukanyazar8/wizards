-- AlterTable
ALTER TABLE "Message" ADD COLUMN "alsoSentToChannel" BOOLEAN NOT NULL DEFAULT false;

-- Thread replies published to the channel are read through the channel list,
-- which filters on threadParentId; this index keeps that OR branch cheap.
CREATE INDEX "Message_channelId_alsoSentToChannel_createdAt_idx"
  ON "Message"("channelId", "alsoSentToChannel", "createdAt");
