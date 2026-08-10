-- Server-wide message search (Faz 3 §A1) matches with
--   content_search @@ websearch_to_tsquery('english', $q) OR content ILIKE '%$q%'
-- The tsvector arm is served by `message_content_search_idx` (GIN, baseline).
-- The ILIKE arm had no index at all: channel-scoped search kept that scan
-- inside one channel, but the server-wide query hands Postgres every message
-- the caller can see, so its cost grew with the whole server's history.
--
-- A trigram GIN index makes `ILIKE '%…%'` indexable, which is the only index
-- type Postgres has for an unanchored pattern. It also happens to be the one
-- structure that helps Turkish text here at all: `content_search` is generated
-- with the 'english' configuration, so its stemming is wrong for Turkish and
-- the ILIKE arm is what actually answers those queries today.
--
-- Two deliberate constraints:
--   * `pg_trgm` is an extension. A role without CREATE privilege on the
--     database cannot install it, and a migration that hard-fails there would
--     block every later migration on that environment. The index is therefore
--     conditional: where the extension is available the search is indexed,
--     where it is not the behaviour is exactly what it is today.
--   * No CONCURRENTLY. Prisma runs each migration inside a transaction and
--     `CREATE INDEX CONCURRENTLY` is not allowed in one. The build takes a
--     write lock on "Message" for its duration; at Whispr's current row counts
--     that is seconds. Revisit before this table reaches tens of millions.
--
-- Queries shorter than three characters cannot use a trigram index (the search
-- service's floor is two). Those still fall back to a scan by design; the two
-- character case is rare and bounded by the same LIMIT.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
  WHEN insufficient_privilege OR feature_not_supported THEN
    RAISE NOTICE 'pg_trgm unavailable; message content search stays unindexed on the ILIKE arm';
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS "message_content_trgm_idx"
      ON "Message" USING GIN ("content" gin_trgm_ops);
  END IF;
END
$$;
