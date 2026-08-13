-- Add full-text search support with GIN indexes
-- These indexes enable PostgreSQL native full-text search on message content

-- Add tsvector column to Message with generated expression
ALTER TABLE "Message"
ADD COLUMN IF NOT EXISTS content_search tsvector
GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED;

-- Add tsvector column to DMMessage with generated expression
ALTER TABLE "DMMessage"
ADD COLUMN IF NOT EXISTS content_search tsvector
GENERATED ALWAYS AS (to_tsvector('english', coalesce("content", ''))) STORED;

-- Create GIN index on Message content_search
CREATE INDEX IF NOT EXISTS message_content_search_idx
ON "Message" USING GIN (content_search);

-- Create GIN index on DMMessage content_search
CREATE INDEX IF NOT EXISTS dm_message_content_search_idx
ON "DMMessage" USING GIN (content_search);

-- Add GIN index on Message replyToId for efficient reply thread traversal
CREATE INDEX IF NOT EXISTS message_reply_to_idx
ON "Message" ("replyToId")
WHERE "replyToId" IS NOT NULL;

-- Add GIN index on Message threadId for thread lookup
CREATE INDEX IF NOT EXISTS message_thread_id_idx
ON "Message" ("threadId")
WHERE "threadId" IS NOT NULL;

-- Add GIN index on Channel parentId for thread parent lookup
CREATE INDEX IF NOT EXISTS channel_parent_id_idx
ON "Channel" ("parentId")
WHERE "parentId" IS NOT NULL;

-- Add index on Channel archived for thread filtering
CREATE INDEX IF NOT EXISTS channel_archived_idx
ON "Channel" ("archived");

-- Add index on Notification read status for unread notifications
CREATE INDEX IF NOT EXISTS notification_unread_idx
ON "Notification" ("userId", "read")
WHERE "read" = false;

-- Add index on ServerInvite uses for usage tracking
CREATE INDEX IF NOT EXISTS server_invite_uses_idx
ON "ServerInvite" ("uses")
WHERE "uses" > 0;

-- Add index on ServerMember joinedAt for recent member queries
CREATE INDEX IF NOT EXISTS server_member_joined_at_idx
ON "ServerMember" ("serverId", "joinedAt");

-- Add index on Channel lastMessageId for channel activity
CREATE INDEX IF NOT EXISTS channel_last_message_id_idx
ON "Channel" ("lastMessageId")
WHERE "lastMessageId" IS NOT NULL;

-- Add index on Attachment size for file size queries
CREATE INDEX IF NOT EXISTS attachment_size_idx
ON "Attachment" ("size")
WHERE "size" > 0;

-- Add index on ServerBan createdAt for ban history
CREATE INDEX IF NOT EXISTS server_ban_created_at_idx
ON "ServerBan" ("serverId", "createdAt");

-- Add index on ScheduledEvent scheduledStartAt for upcoming events
CREATE INDEX IF NOT EXISTS scheduled_event_start_at_idx
ON "ScheduledEvent" ("scheduledStartAt")
WHERE "status" = 'SCHEDULED';
