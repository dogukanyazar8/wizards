ALTER TABLE "Message"
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "placeholderRemovedAt" TIMESTAMP(3);

ALTER TABLE "DMMessage"
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "placeholderRemovedAt" TIMESTAMP(3);

CREATE INDEX "Message_channelId_placeholderRemovedAt_idx"
  ON "Message"("channelId", "placeholderRemovedAt");

CREATE INDEX "DMMessage_conversationId_placeholderRemovedAt_idx"
  ON "DMMessage"("conversationId", "placeholderRemovedAt");
