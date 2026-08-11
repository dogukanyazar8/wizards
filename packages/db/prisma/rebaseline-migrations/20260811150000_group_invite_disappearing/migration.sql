-- Grup sohbetleri 2a-2f, Faz 2. Two features that both need storage:
--   B  the group's single, rotatable invite link
--   C  disappearing messages (a conversation window + a per-message deadline)
--
-- The call state (D) is deliberately absent: it lives in Redis only, exactly
-- like the 1:1 call it extends.

-- The four windows 2f offers. `OFF` is the default, so an existing conversation
-- keeps every message it already has.
CREATE TYPE "GroupDisappearingWindow" AS ENUM ('OFF', 'H24', 'D7', 'D90');

-- C2's system row. A settings change is normally silent (Faz 1 §B5), but this
-- one alters what happens to everybody's future messages, so it announces
-- itself. `systemValue` carries the new window and the sentence is built by the
-- reader in their own locale, like every other system row.
--
-- Safe inside Prisma's per-migration transaction on PostgreSQL 12+: the new
-- label is never *used* by a statement in this file, only added.
ALTER TYPE "DMSystemMessageType" ADD VALUE 'DISAPPEARING_CHANGED';

-- B1. One invite per group, hence `conversationId UNIQUE`: the design has a
-- single link and "yenile" replaces it in place. Multiple concurrent invites
-- would be a different feature with a different UI, and this constraint is what
-- stops one from appearing by accident.
--
-- `enabled` defaults to false (K2): a group that nobody switched the link on for
-- has no usable code, and until the first switch there is no row at all.
CREATE TABLE "GroupInvite" (
  "id"             TEXT NOT NULL,
  "code"           VARCHAR(12) NOT NULL,
  "conversationId" TEXT NOT NULL,
  "createdById"    TEXT NOT NULL,
  "enabled"        BOOLEAN NOT NULL DEFAULT false,
  "uses"           INTEGER NOT NULL DEFAULT 0,
  "maxUses"        INTEGER,
  "expiresAt"      TIMESTAMP(3),
  "rotatedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GroupInvite_pkey" PRIMARY KEY ("id")
);

-- The lookup every preview and join does. Unique rather than a plain index
-- because a duplicate code would silently hand two groups the same link, and
-- the generator's collision retry needs the database to be the arbiter.
CREATE UNIQUE INDEX "GroupInvite_code_key" ON "GroupInvite"("code");

-- Doubles as the by-conversation lookup the settings screen does, so no second
-- index on the same column.
CREATE UNIQUE INDEX "GroupInvite_conversationId_key" ON "GroupInvite"("conversationId");

CREATE INDEX "GroupInvite_createdById_idx" ON "GroupInvite"("createdById");

ALTER TABLE "GroupInvite"
  ADD CONSTRAINT "GroupInvite_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "DMConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupInvite"
  ADD CONSTRAINT "GroupInvite_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- C1. Conversation-level, so a 1:1 DM could carry one too; only the group
-- surfaces expose the control today.
ALTER TABLE "DMConversation"
  ADD COLUMN "disappearingAfter" "GroupDisappearingWindow" NOT NULL DEFAULT 'OFF';

-- C1. The deadline stamped at send time. NULL is "permanent" and is what every
-- existing row keeps: V6, the window never applies to history.
ALTER TABLE "DMMessage" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- The purge worker's whole predicate is `expiresAt IS NOT NULL AND expiresAt <= now()`
-- over the entire table, so without this it is a sequential scan of every DM
-- message once a minute.
--
-- Plain rather than partial (`WHERE "expiresAt" IS NOT NULL`) on purpose: Prisma
-- cannot model a partial index, and an index that exists only in SQL reads as
-- schema drift on the next `migrate dev`. Revisit if the NULL share ever makes
-- the index size a problem — the read filter uses it too.
CREATE INDEX "DMMessage_expiresAt_idx" ON "DMMessage"("expiresAt");
