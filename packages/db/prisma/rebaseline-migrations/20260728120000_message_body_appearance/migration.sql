-- Messaging redesign §3: the mobile message body gets its own size preference
-- so the four-step slider syncs across a person's devices. Additive columns
-- with defaults only; existing rows keep the shipped defaults and nothing is
-- rewritten, so this is safe to apply while the app is serving traffic.
ALTER TABLE "UserSettings"
  ADD COLUMN "messageBodySize" TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN "messageBodyCompact" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "messageBodyFollowSystemFont" BOOLEAN NOT NULL DEFAULT false;
