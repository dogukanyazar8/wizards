-- Add explicit thread parent relations without reusing replyToId, so inline
-- replies and threaded replies can coexist safely.
ALTER TABLE "Message" ADD COLUMN "threadParentId" TEXT;
ALTER TABLE "DMMessage" ADD COLUMN "threadParentId" TEXT;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_threadParentId_fkey"
  FOREIGN KEY ("threadParentId")
  REFERENCES "Message"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "DMMessage"
  ADD CONSTRAINT "DMMessage_threadParentId_fkey"
  FOREIGN KEY ("threadParentId")
  REFERENCES "DMMessage"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "Message_channelId_threadParentId_createdAt_idx"
  ON "Message"("channelId", "threadParentId", "createdAt");

CREATE INDEX "Message_threadParentId_createdAt_idx"
  ON "Message"("threadParentId", "createdAt");

CREATE INDEX "DMMessage_conversationId_threadParentId_createdAt_idx"
  ON "DMMessage"("conversationId", "threadParentId", "createdAt");

CREATE INDEX "DMMessage_threadParentId_createdAt_idx"
  ON "DMMessage"("threadParentId", "createdAt");
