-- Hot B-tree shapes found by the 2026-08 database audit. `IF NOT EXISTS`
-- keeps a partially repaired environment safe to deploy through Prisma.

-- friends/last-seen.ts: per-user max(lastSeenAt).
CREATE INDEX IF NOT EXISTS "AppSession_userId_lastSeenAt_idx"
  ON "AppSession"("userId", "lastSeenAt");

-- admin activity/health snapshots: bare startedAt ranges.
CREATE INDEX IF NOT EXISTS "AppSession_startedAt_idx"
  ON "AppSession"("startedAt");

-- outbox/service.ts: recent channel readers without a userId predicate.
CREATE INDEX IF NOT EXISTS "ChannelReadState_channelId_lastReadAt_idx"
  ON "ChannelReadState"("channelId", "lastReadAt");

-- friends queries: ACCEPTED relationships through both sides of an OR.
CREATE INDEX IF NOT EXISTS "FriendRequest_senderId_status_idx"
  ON "FriendRequest"("senderId", "status");
CREATE INDEX IF NOT EXISTS "FriendRequest_receiverId_status_idx"
  ON "FriendRequest"("receiverId", "status");

-- telemetry rollup: bare createdAt retention cutoffs.
CREATE INDEX IF NOT EXISTS "ClientHealthEvent_createdAt_idx"
  ON "ClientHealthEvent"("createdAt");

-- unread notifications ordered by creation time.
CREATE INDEX IF NOT EXISTS "Notification_userId_read_createdAt_idx"
  ON "Notification"("userId", "read", "createdAt");

-- account export/deletion attachment lookups by uploader.
CREATE INDEX IF NOT EXISTS "Attachment_userId_idx"
  ON "Attachment"("userId");

-- expired-session sweep introduced by audit prompt 01.
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx"
  ON "Session"("expiresAt");

-- Unique constraints already own equivalent B-trees. The Role index never
-- existed in the current rebaseline, but keeping its guarded drop makes the
-- migration safe for environments created from the older audited schema.
DROP INDEX IF EXISTS "User_email_idx";
DROP INDEX IF EXISTS "User_username_idx";
DROP INDEX IF EXISTS "Session_token_idx";
DROP INDEX IF EXISTS "Session_refresh_token_idx";
DROP INDEX IF EXISTS "Server_invite_code_idx";
DROP INDEX IF EXISTS "ServerInvite_code_idx";
DROP INDEX IF EXISTS "Reaction_messageId_idx";
DROP INDEX IF EXISTS "DMReaction_messageId_idx";
DROP INDEX IF EXISTS "Role_name_idx";

-- Prisma's PostgreSQL `contains` + `mode: insensitive` filter emits ILIKE.
-- Direct-column gin_trgm_ops indexes therefore match the generated predicate;
-- lower(column) expression indexes would not. DM search also uses ILIKE/~*.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pg_trgm unavailable; audited substring searches stay unindexed';
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "DMMessage_content_trgm_idx"
      ON "DMMessage" USING GIN ("content" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "User_username_trgm_idx"
      ON "User" USING GIN ("username" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "User_displayName_trgm_idx"
      ON "User" USING GIN ("displayName" gin_trgm_ops);
  END IF;
END
$$;

-- channelId is only an optional landing hint. The invite remains server-scoped
-- and must survive deletion of a stale welcome channel.
ALTER TABLE "ServerInvite"
  DROP CONSTRAINT IF EXISTS "ServerInvite_channelId_fkey";
ALTER TABLE "ServerInvite"
  ADD CONSTRAINT "ServerInvite_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
