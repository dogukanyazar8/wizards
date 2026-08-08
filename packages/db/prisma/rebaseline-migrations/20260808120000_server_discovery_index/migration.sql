-- S3 discovery list: `[type, discoverable, memberCount]` (S1) cannot serve
-- `WHERE discoverable = true AND isPublic = true ORDER BY memberCount DESC`
-- -- `type` is unfiltered (both PERSONAL and COMMUNITY servers can be
-- discoverable) so the leading column buys nothing, and `isPublic` is not in
-- that index at all. Confirmed by EXPLAIN against a seeded local DB: the old
-- index alone produced a sequential scan. This index matches the query's
-- actual filter and sort columns.
CREATE INDEX "Server_discoverable_isPublic_memberCount_idx"
  ON "Server"("discoverable", "isPublic", "memberCount");
