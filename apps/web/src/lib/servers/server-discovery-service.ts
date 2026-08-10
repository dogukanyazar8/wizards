import { Prisma } from "@wizards/db";
import type { PrismaClient, ServerType } from "@wizards/db";
import type { ServerDiscoveryCard, ServerDiscoveryPage } from "@wizards/types";

import {
  countServerOnlineMembersBatch,
  type ServerOnlinePresenceBatchRedis,
} from "@/lib/socket/server-online-presence";

const DEFAULT_DISCOVERY_PAGE_SIZE = 20;
const MAX_DISCOVERY_PAGE_SIZE = 50;

export const SERVER_DISCOVERY_SELECT = {
  bannerUrl: true,
  description: true,
  features: true,
  iconUrl: true,
  id: true,
  memberCount: true,
  name: true,
  shortName: true,
  tags: true,
  type: true,
} satisfies Prisma.ServerSelect;

/**
 * A tag is a slug, so the search term only has to be lowercased to be
 * comparable. 6d sends the tag's own text when a chip is tapped, which makes
 * this an exact array-containment hit (`tags @> ARRAY[term]`, GIN-served);
 * free typing still falls back to the name `ILIKE` it always had.
 */
export function normalizeServerDiscoveryTagQuery(query: string): string {
  return query.trim().toLowerCase();
}

export type ServerDiscoveryCardSource = Prisma.ServerGetPayload<{
  select: typeof SERVER_DISCOVERY_SELECT;
}>;

/**
 * Pure so the card projection can be asserted without a database. The card
 * is a strict subset of `buildServerPublicProfile`'s payload -- no channel
 * list, no friend intersection, no permission resolution -- because N
 * servers on a discovery page times a permission resolution per server is
 * exactly what would kill the list.
 */
export function buildServerDiscoveryCard(
  server: ServerDiscoveryCardSource,
  onlineCount: number,
): ServerDiscoveryCard {
  return {
    bannerUrl: server.bannerUrl,
    description: server.description ?? "",
    iconUrl: server.iconUrl,
    id: server.id,
    memberCount: server.memberCount,
    name: server.name,
    onlineCount,
    shortName: server.shortName,
    tags: server.tags,
    type: server.type as ServerType,
    verified: server.features.includes("VERIFIED"),
  };
}

export const SERVER_DISCOVERY_FEATURED_FLAG = "FEATURED";

/**
 * The list is read in two phases: the featured servers first, then everything
 * else. A single `ORDER BY (features @> ARRAY['FEATURED']) DESC, ...` was
 * measured first and loses the index -- Postgres cannot order on an array
 * membership test, so it fell back to a parallel sequential scan (S4 §B, the
 * `EXPLAIN` output is in the report). Both phases here keep an index scan.
 */
export type ServerDiscoveryPhase = "featured" | "rest";

type ServerDiscoveryCursor = {
  id: string;
  memberCount: number;
  phase: ServerDiscoveryPhase;
};

/**
 * `<phase>|memberCount|id` -- the id tiebreaks so a shared memberCount never
 * repeats or skips a row, and the phase says which of the two queries the
 * keyset belongs to.
 */
export function encodeServerDiscoveryCursor(row: ServerDiscoveryCursor): string {
  return `${row.phase === "featured" ? "f" : "r"}|${row.memberCount}|${row.id}`;
}

export function decodeServerDiscoveryCursor(cursor: string): ServerDiscoveryCursor | null {
  const parts = cursor.split("|");
  const [phaseMarker, rawMemberCount] = parts;

  if (parts.length !== 3 || (phaseMarker !== "f" && phaseMarker !== "r")) {
    return null;
  }

  const memberCount = Number(rawMemberCount);
  const id = parts[2] ?? "";

  return Number.isInteger(memberCount) && memberCount >= 0 && id.length > 0 && rawMemberCount !== ""
    ? { id, memberCount, phase: phaseMarker === "f" ? "featured" : "rest" }
    : null;
}

type DiscoveryIdRow = { id: string };

/**
 * Finding 6 (06-kesif-imleci-ve-audit.md): a keyset predicate spread across
 * an `OR` of two columns -- `memberCount < cursor.memberCount OR (id <
 * cursor.id AND memberCount = cursor.memberCount)`, what this used to be --
 * is not sargable. Postgres cannot fold an `OR` across two different columns
 * into one index bound, so a backward index scan has to start at the top of
 * the index and `Filter`-reject every row down to the cursor: cost scales
 * with pagination depth, not page size.
 *
 * Measured on a 200k-row probe table (same method as 04-rapor.md, same
 * `[discoverable, isPublic, memberCount]` index): a deep cursor went from
 * 77,144 buffers / ~15.4ms (`Filter`, 76,753 rows rejected) to 30 buffers /
 * ~0.05ms (`Index Cond` including `memberCount`, 2 rows rejected) by writing
 * the same predicate as a row-value comparison, `(memberCount, id) <
 * (cursor.memberCount, cursor.id)`. Postgres folds this into an index
 * condition even though `id` is not itself an index column -- it derives
 * `memberCount <= cursor.memberCount` as the scan bound from the row
 * comparison's leading member and only has to `Filter` the full row
 * comparison for the handful of rows tied on `memberCount`. Full before/after
 * `EXPLAIN` output for all four query variants is in
 * docs/prompts/sunucu-tipi-gorunurluk/raporlar/06-kesif-imleci-ve-audit.md.
 *
 * Prisma's query builder cannot express a row-value comparison, so this only
 * runs when a cursor is actually present. The first page (no cursor, in
 * `fetchDiscoveryPhaseRows` below) keeps using the typed `findMany` -- it was
 * already index-served, since there is no keyset predicate to be non-sargable
 * in the first place.
 *
 * This returns only the ordered page of ids (index-served); the caller
 * re-fetches the card payload through `hydrateDiscoveryCards`'s typed
 * `select` rather than this query hand-listing every discovery-card column,
 * so `SERVER_DISCOVERY_SELECT` stays the single, compiler-checked source of
 * truth for what a discovery card may contain.
 */
async function queryDeepCursorDiscoveryIds(
  database: PrismaClient,
  params: {
    cursor: ServerDiscoveryCursor;
    featured: boolean;
    take: number;
    trimmedQuery: string | undefined;
  },
): Promise<string[]> {
  const { cursor, featured, take, trimmedQuery } = params;
  const featureSql = featured
    ? Prisma.sql`"features" @> ARRAY[${SERVER_DISCOVERY_FEATURED_FLAG}]::text[]`
    : Prisma.sql`NOT ("features" @> ARRAY[${SERVER_DISCOVERY_FEATURED_FLAG}]::text[])`;
  // Deliberately the same (unescaped) `ILIKE '%value%'` shape Prisma's own
  // `contains` + `insensitive` filter compiles to below -- not a new or
  // different search behavior, just the same filter expressed as raw SQL. The
  // tag arm mirrors the typed branch's `tags: { has: ... }`.
  const searchSql = trimmedQuery
    ? Prisma.sql`AND ("name" ILIKE ${`%${trimmedQuery}%`} OR "tags" @> ARRAY[${normalizeServerDiscoveryTagQuery(trimmedQuery)}]::text[])`
    : Prisma.empty;

  const rows = await database.$queryRaw<DiscoveryIdRow[]>(Prisma.sql`
    SELECT "id"
    FROM "Server"
    WHERE "discoverable" = true
      AND "isPublic" = true
      AND ${featureSql}
      ${searchSql}
      AND ("memberCount", "id") < (${cursor.memberCount}, ${cursor.id})
    ORDER BY "memberCount" DESC, "id" DESC
    LIMIT ${take}
  `);

  return rows.map((row) => row.id);
}

/**
 * Re-fetches the deep-cursor page's card payload through the same typed
 * `select` the no-cursor path uses, so the strict-subset projection stays
 * compiler-checked either way. `id IN (...)` is a second, cheap, index-served
 * lookup on the primary key -- measured at ~0.09ms / 84 buffers for a 21-row
 * page, against the ~15ms this removes from the keyset query above -- and the
 * result is re-sorted back to the id order because `IN` does not preserve it.
 */
async function hydrateDiscoveryCards(
  database: PrismaClient,
  ids: string[],
): Promise<ServerDiscoveryCardSource[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await database.server.findMany({
    select: SERVER_DISCOVERY_SELECT,
    where: { id: { in: ids } },
  });
  const byId = new Map(rows.map((row) => [row.id, row] as const));

  // `flatMap` rather than a plain `map` + assert: a row deleted in the
  // instant between the id query and this hydration query simply drops off
  // the page instead of producing a hole or throwing.
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/**
 * One phase (featured or rest) of the discovery list. Branches on whether a
 * cursor applies to this phase: no cursor keeps the original typed Prisma
 * query (already index-served); a cursor routes through the raw keyset query
 * above plus hydration.
 */
async function fetchDiscoveryPhaseRows(
  database: PrismaClient,
  params: {
    cursor: ServerDiscoveryCursor | null;
    featured: boolean;
    take: number;
    trimmedQuery: string | undefined;
  },
): Promise<ServerDiscoveryCardSource[]> {
  const { cursor, featured, take, trimmedQuery } = params;

  if (cursor === null) {
    return database.server.findMany({
      orderBy: [{ memberCount: "desc" as const }, { id: "desc" as const }],
      select: SERVER_DISCOVERY_SELECT,
      take,
      where: {
        discoverable: true,
        isPublic: true,
        ...(trimmedQuery
          ? {
              OR: [
                { name: { contains: trimmedQuery, mode: "insensitive" as const } },
                { tags: { has: normalizeServerDiscoveryTagQuery(trimmedQuery) } },
              ],
            }
          : {}),
        ...(featured
          ? { features: { has: SERVER_DISCOVERY_FEATURED_FLAG } }
          : { NOT: { features: { has: SERVER_DISCOVERY_FEATURED_FLAG } } }),
      },
    });
  }

  const ids = await queryDeepCursorDiscoveryIds(database, { cursor, featured, take, trimmedQuery });
  return hydrateDiscoveryCards(database, ids);
}

export type ListDiscoverableServersInput = {
  cursor?: string;
  limit?: number;
  query?: string;
};

/**
 * S3 binding decision 3: ordering comes from the `[discoverable, isPublic,
 * memberCount]` index, not application code -- `orderBy` here is exactly
 * `memberCount desc` with `id desc` as the keyset tiebreaker, nothing is
 * sorted after the query returns.
 *
 * S3 binding decision 4: cursor pagination, not `skip`/`take` -- a large
 * offset is a Postgres table scan, a keyset predicate on indexed columns is
 * not.
 *
 * S3 binding decision 5: online counts are read for the whole page in one
 * Redis pipeline (`countServerOnlineMembersBatch`) rather than once per card.
 *
 * S4 §B: featured servers come first. The phase split is what keeps both
 * queries on an index -- see `ServerDiscoveryPhase`.
 */
export async function listDiscoverableServersWithDatabase(
  database: PrismaClient,
  redis: ServerOnlinePresenceBatchRedis,
  input: ListDiscoverableServersInput = {},
): Promise<ServerDiscoveryPage> {
  const pageSize = Math.min(
    Math.max(Math.trunc(input.limit ?? DEFAULT_DISCOVERY_PAGE_SIZE), 1),
    MAX_DISCOVERY_PAGE_SIZE,
  );
  const decoded = input.cursor ? decodeServerDiscoveryCursor(input.cursor) : null;
  // `contains` is deliberate here (S3 §A): the prompt bans building a
  // trigram/full-text search service for this, and current data volume does
  // not need one. Passed through to `fetchDiscoveryPhaseRows`, which applies
  // it identically whether or not a cursor is present.
  const trimmedQuery = input.query?.trim();

  const featuredRows =
    decoded === null || decoded.phase === "featured"
      ? await fetchDiscoveryPhaseRows(database, {
          cursor: decoded,
          featured: true,
          // One extra row answers "is there another page?" without a second count.
          take: pageSize + 1,
          trimmedQuery,
        })
      : [];

  if (featuredRows.length > pageSize) {
    return buildDiscoveryPage(redis, featuredRows.slice(0, pageSize), "featured", true);
  }

  const restTake = pageSize - featuredRows.length + 1;
  const restRows = await fetchDiscoveryPhaseRows(database, {
    cursor: decoded?.phase === "rest" ? decoded : null,
    featured: false,
    take: restTake,
    trimmedQuery,
  });

  const hasMore = restRows.length >= restTake;
  const restPage = hasMore ? restRows.slice(0, restTake - 1) : restRows;

  // When the page ends exactly on the last featured row, the cursor stays in
  // the featured phase: the next request re-runs the featured query, finds it
  // exhausted, and falls through to the rest phase from its start.
  return hasMore && restPage.length === 0
    ? buildDiscoveryPage(redis, featuredRows, "featured", true)
    : buildDiscoveryPage(redis, [...featuredRows, ...restPage], "rest", hasMore);
}

async function buildDiscoveryPage(
  redis: ServerOnlinePresenceBatchRedis,
  page: ServerDiscoveryCardSource[],
  phase: ServerDiscoveryPhase,
  hasMore: boolean,
): Promise<ServerDiscoveryPage> {
  const onlineCounts = await countServerOnlineMembersBatch(
    redis,
    page.map((row) => row.id),
  );

  const last = page.at(-1);

  return {
    nextCursor: hasMore && last ? encodeServerDiscoveryCursor({ ...last, phase }) : null,
    servers: page.map((row) => buildServerDiscoveryCard(row, onlineCounts.get(row.id) ?? 0)),
  };
}

export async function listDiscoverableServers(
  input: ListDiscoverableServersInput = {},
): Promise<ServerDiscoveryPage> {
  const { prisma } = await import("@wizards/db");
  const { getRedisOp } = await import("@/lib/redis");
  return listDiscoverableServersWithDatabase(prisma, getRedisOp(), input);
}
