-- Keşfet paketi — Dalga 0 / Ş0.2. Three independent changes.
--
--   1. ServerCategory enum + Server.category (K1) + the composite index the
--      category-filtered directory query needs.
--   2. Server.languages (K3) — the featured block's "Türkçe · İngilizce" pill.
--   3. DiscoverChannelActivity (K2) — the hourly rollup the "POPÜLER KANALLAR"
--      lane reads instead of counting Message rows live.
--
-- Nothing is dropped and no data is written. `category` starts NULL for every
-- existing server: a server whose owner has not picked a category still shows
-- under "Tümü", never matches a category filter, and stays out of the counters.
-- `languages` starts as an empty array, and the rollup table starts empty — the
-- lane shows its empty state until the first hourly run, which is a true
-- statement rather than an error.

-- ---------------------------------------------------------------------------
-- 1. Category
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServerCategory') THEN
    CREATE TYPE "ServerCategory" AS ENUM ('OYUN', 'IS', 'CALISMA', 'KISISEL', 'DESTEK');
  END IF;
END
$$;

ALTER TABLE "Server"
  ADD COLUMN IF NOT EXISTS "category" "ServerCategory";

-- The existing [discoverable, isPublic, memberCount] index cannot serve a
-- category-filtered directory read: `category` is not a member of it, so with a
-- category selected Postgres walks the whole discoverable set and filters row by
-- row. `memberCount` stays last so `ORDER BY memberCount DESC` is read off the
-- index rather than sorted afterwards.
CREATE INDEX IF NOT EXISTS "Server_category_discoverable_isPublic_memberCount_idx"
  ON "Server" ("category", "discoverable", "isPublic", "memberCount");

-- ---------------------------------------------------------------------------
-- 2. Languages
-- ---------------------------------------------------------------------------
-- Distinct from `preferredLocale`, which is one value and drives notification
-- and formatting language. This column lists the languages actually spoken in
-- the server. Shape (lowercase BCP-47 short code, 1..8 chars, max 4 entries) is
-- enforced in `@wizards/types`; the column is a plain array like `tags`.
ALTER TABLE "Server"
  ADD COLUMN IF NOT EXISTS "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ---------------------------------------------------------------------------
-- 3. Channel activity rollup
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "DiscoverChannelActivity" (
  "channelId"    TEXT NOT NULL,
  "windowStart"  TIMESTAMP(3) NOT NULL,
  "messageCount" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "DiscoverChannelActivity_pkey" PRIMARY KEY ("channelId", "windowStart")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DiscoverChannelActivity_channelId_fkey'
  ) THEN
    ALTER TABLE "DiscoverChannelActivity"
      ADD CONSTRAINT "DiscoverChannelActivity_channelId_fkey"
      FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- The lane sums the trailing 24 windows and orders by volume; leading with
-- `windowStart` lets the range be cut before any count is read.
CREATE INDEX IF NOT EXISTS "DiscoverChannelActivity_windowStart_messageCount_idx"
  ON "DiscoverChannelActivity" ("windowStart", "messageCount");
