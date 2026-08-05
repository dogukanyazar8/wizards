-- Badge ground floor. No screen reads these tables yet: the catalog lives in
-- @wizards/types, the evaluator and the read path land in later waves.
CREATE TYPE "BadgeSource" AS ENUM ('DERIVED', 'AWARDED', 'GRANTED');

-- Postgres refuses to use an enum value added in the same transaction that added
-- it, so this migration only widens the type. The code that writes a BADGE
-- notification ships in a later deployment, after this value is committed.
ALTER TYPE "NotificationType" ADD VALUE 'BADGE';

CREATE TABLE "UserBadge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "badge" VARCHAR(32) NOT NULL,
  "tier" INTEGER NOT NULL DEFAULT 1,
  "source" "BadgeSource" NOT NULL,
  "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokeReason" VARCHAR(280),
  "grantedById" TEXT,
  "grantReason" VARCHAR(280),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserBadgeProgress" (
  "userId" TEXT NOT NULL,
  "badge" VARCHAR(32) NOT NULL,
  "value" BIGINT NOT NULL DEFAULT 0,
  "streakDays" INTEGER NOT NULL DEFAULT 0,
  "lastCountedDay" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserBadgeProgress_pkey" PRIMARY KEY ("userId", "badge")
);

-- One row per user and badge: re-running the evaluator over the same event has to
-- collide here rather than stack a second award.
CREATE UNIQUE INDEX "UserBadge_userId_badge_key" ON "UserBadge"("userId", "badge");
CREATE INDEX "UserBadge_userId_revokedAt_idx" ON "UserBadge"("userId", "revokedAt");
CREATE INDEX "UserBadge_badge_tier_idx" ON "UserBadge"("badge", "tier");

-- A deleted account takes its badges and counters with it, but a deleted operator
-- must not erase the award trail, so the granter link only goes null.
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserBadgeProgress" ADD CONSTRAINT "UserBadgeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Credit lines keep their name when the linked account goes away.
ALTER TABLE "Contributor" ADD COLUMN "userId" TEXT;

CREATE INDEX "Contributor_userId_idx" ON "Contributor"("userId");

ALTER TABLE "Contributor" ADD CONSTRAINT "Contributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
