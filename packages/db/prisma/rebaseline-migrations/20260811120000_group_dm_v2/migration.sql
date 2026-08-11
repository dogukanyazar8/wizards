-- Grup sohbetleri 2a-2f, Faz 1. Everything 2a..2f needs to manage a group:
-- roles, four permissions, a notification tier, a per-user conversation pin, a
-- pinned message, a description, colours and a history window.
--
-- `DMParticipant.muted` is deliberately NOT dropped. It stays as the derived
-- mirror of `notifyLevel = NONE`; more than a thousand readers still ask for it
-- and the two columns are only ever written together.

CREATE TYPE "DMParticipantRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TYPE "DMNotifyLevel" AS ENUM ('ALL', 'MENTIONS', 'NONE');

CREATE TYPE "GroupPermissionLevel" AS ENUM ('ALL', 'ADMINS');

CREATE TYPE "GroupHistoryVisibility" AS ENUM ('NONE', 'LAST_24H', 'LAST_30D', 'ALL');

-- Conversation-level group state. The permission defaults are the values 2f
-- shows on a group nobody has configured; `LAST_30D` is the option 2c §7 has
-- pre-selected.
ALTER TABLE "DMConversation"
  ADD COLUMN "description" VARCHAR(120),
  ADD COLUMN "avatarColor" VARCHAR(7),
  ADD COLUMN "pinnedMessageId" TEXT,
  ADD COLUMN "pinnedById" TEXT,
  ADD COLUMN "pinnedAt" TIMESTAMP(3),
  ADD COLUMN "permSendMessage" "GroupPermissionLevel" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "permAddMembers" "GroupPermissionLevel" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "permEditInfo" "GroupPermissionLevel" NOT NULL DEFAULT 'ADMINS',
  ADD COLUMN "permPinMessage" "GroupPermissionLevel" NOT NULL DEFAULT 'ADMINS',
  ADD COLUMN "historyVisibility" "GroupHistoryVisibility" NOT NULL DEFAULT 'LAST_30D';

-- Participant-level state. `nameColor` arrives nullable so the backfill below
-- can fill it before the NOT NULL lands; every other column has a default or is
-- legitimately null on an existing row.
ALTER TABLE "DMParticipant"
  ADD COLUMN "role" "DMParticipantRole" NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN "notifyLevel" "DMNotifyLevel" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "nameColor" VARCHAR(7),
  ADD COLUMN "pinnedAt" TIMESTAMP(3),
  ADD COLUMN "historyFromAt" TIMESTAMP(3),
  ADD COLUMN "pinnedStripDismissedId" TEXT;

-- Backfill 1/3: the existing owner column is the only ownership fact there is,
-- so it becomes the OWNER row. Everyone else was already defaulted to MEMBER.
UPDATE "DMParticipant" p
SET "role" = 'OWNER'
FROM "DMConversation" c
WHERE c."id" = p."conversationId"
  AND c."ownerId" = p."userId";

-- Backfill 2/3: `muted` was the whole notification model until now, so it maps
-- onto the new tier one-to-one. Anything not muted keeps every notification.
UPDATE "DMParticipant"
SET "notifyLevel" = 'NONE'
WHERE "muted" = true;

-- Backfill 3/3: hand out the five sender colours round-robin per conversation,
-- in the same (joinedAt, userId) order `pickNextMemberNameColor` would have
-- produced had the rows been written one at a time.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "conversationId"
           ORDER BY "joinedAt", "userId"
         ) - 1 AS idx
  FROM "DMParticipant"
)
UPDATE "DMParticipant" p
SET "nameColor" = (ARRAY['#C2185B','#C77A2B','#1B8A55','#8A46C7','#4F46E5'])[(ranked.idx % 5) + 1]
FROM ranked
WHERE ranked.id = p.id;

ALTER TABLE "DMParticipant" ALTER COLUMN "nameColor" SET NOT NULL;

-- `historyFromAt` is left NULL on purpose: an existing member keeps the full
-- history they can already read. The window only ever applies to a member who
-- joins after this migration.

CREATE INDEX "DMConversation_pinnedMessageId_idx" ON "DMConversation"("pinnedMessageId");

-- 2a's SABİTLENEN section reads one user's pinned conversations.
CREATE INDEX "DMParticipant_userId_pinnedAt_idx" ON "DMParticipant"("userId", "pinnedAt");

-- The permission gate counts a group's admins; without this it is a scan of
-- every membership row the conversation has.
CREATE INDEX "DMParticipant_conversationId_role_idx" ON "DMParticipant"("conversationId", "role");

-- SET NULL rather than an application-side sweep: deleting the pinned message
-- has to clear the pin, and a cleanup path that only the delete endpoint calls
-- would be skipped by every other way a message can go.
ALTER TABLE "DMConversation"
  ADD CONSTRAINT "DMConversation_pinnedMessageId_fkey"
  FOREIGN KEY ("pinnedMessageId") REFERENCES "DMMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
