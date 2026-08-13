CREATE INDEX IF NOT EXISTS "PinnedMessage_channelId_pinnedAt_idx"
  ON "PinnedMessage" ("channelId", "pinnedAt");
