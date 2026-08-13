CREATE INDEX IF NOT EXISTS "ServerMember_serverId_userId_idx"
  ON "ServerMember" ("serverId", "userId");

CREATE INDEX IF NOT EXISTS "DMConversation_lastMessageAt_idx"
  ON "DMConversation" ("lastMessageAt");

CREATE INDEX IF NOT EXISTS "DMParticipant_userId_hiddenAt_idx"
  ON "DMParticipant" ("userId", "hiddenAt");

CREATE INDEX IF NOT EXISTS "Channel_serverId_type_idx"
  ON "Channel" ("serverId", "type");

CREATE INDEX IF NOT EXISTS "Message_channelId_threadId_createdAt_idx"
  ON "Message" ("channelId", "threadId", "createdAt");

CREATE INDEX IF NOT EXISTS "ChannelReadState_userId_channelId_lastReadAt_idx"
  ON "ChannelReadState" ("userId", "channelId", "lastReadAt");

CREATE INDEX IF NOT EXISTS "Server_discoverable_idx"
  ON "Server" ("discoverable");

CREATE INDEX IF NOT EXISTS "MessageMention_userId_idx"
  ON "MessageMention" ("userId");

CREATE INDEX IF NOT EXISTS "Reaction_messageId_idx"
  ON "Reaction" ("messageId");
