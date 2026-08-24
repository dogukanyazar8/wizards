import { Prisma } from "@wizards/db";
import type { PrismaClient, ServerCategory } from "@wizards/db";
import type {
  DiscoverCategory,
  DiscoverCategoryKey,
  DiscoverServer,
  DiscoverServerCategoryKey,
  DiscoverSortKey,
} from "@wizards/types";

import { DISCOVER_CATEGORIES } from "@/lib/discover/contracts";
import { toCategoryKey, toDiscoverInitials, toServerCategory } from "@/lib/discover/identity";
import { logWarning } from "@/lib/logger";
import {
  normalizeServerDiscoveryTagQuery,
  SERVER_DISCOVERY_FEATURED_FLAG,
  SERVER_DISCOVERY_SELECT,
} from "@/lib/servers/server-discovery-service";
import {
  countServerOnlineMembersBatch,
  type ServerOnlinePresenceBatchRedis,
} from "@/lib/socket/server-online-presence";

export const ONLINE_SORT_POOL = 200;

export type DiscoverCursorPhase = "featured" | "rest";

export type DiscoverCursor = {
  id: string;
  phase: DiscoverCursorPhase;
  sort: DiscoverSortKey;
  value: number;
};

const SORT_MARKERS: Readonly<Record<DiscoverSortKey, "n" | "o" | "p">> = {
  new: "n",
  online: "o",
  popular: "p",
};

const SORT_BY_MARKER: Readonly<Record<string, DiscoverSortKey | undefined>> = {
  n: "new",
  o: "online",
  p: "popular",
};

export function encodeDiscoverCursor(cursor: DiscoverCursor): string {
  if (cursor.id.length === 0 || cursor.id.includes("|")) {
    throw new TypeError("Discover cursor id must be non-empty and cannot contain '|'");
  }

  return `${SORT_MARKERS[cursor.sort]}|${cursor.phase === "featured" ? "f" : "r"}|${cursor.value}|${cursor.id}`;
}

export function decodeDiscoverCursor(
  cursor: string,
  expectedSort: DiscoverSortKey,
): DiscoverCursor | null {
  const parts = cursor.split("|");
  if (parts.length !== 4) {
    return null;
  }

  const [sortMarker, phaseMarker, rawValue, id] = parts;
  const sort = sortMarker ? SORT_BY_MARKER[sortMarker] : undefined;
  const value = Number(rawValue);

  if (
    sort === undefined ||
    sort !== expectedSort ||
    (phaseMarker !== "f" && phaseMarker !== "r") ||
    rawValue === "" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    (sort === "new" && Number.isNaN(new Date(value).getTime())) ||
    !id
  ) {
    return null;
  }

  return {
    id,
    phase: phaseMarker === "f" ? "featured" : "rest",
    sort,
    value,
  };
}

type DiscoverCategoryCountRow = {
  _count: { _all: number };
  category: ServerCategory | null;
};

export function buildDiscoverCategoryCounts(
  rows: readonly DiscoverCategoryCountRow[],
): DiscoverCategory[] {
  const counts = new Map<DiscoverServerCategoryKey, number>();
  let total = 0;

  for (const row of rows) {
    total += row._count._all;
    const key = toCategoryKey(row.category);
    if (key !== null) {
      counts.set(key, row._count._all);
    }
  }

  return DISCOVER_CATEGORIES.map((category) => ({
    count: category.key === "all" ? total : (counts.get(category.key) ?? 0),
    initials: category.initials,
    key: category.key,
    label: "",
  }));
}

export type DiscoverServerFilterInput = {
  category: DiscoverCategoryKey;
  categoryHint?: DiscoverServerCategoryKey;
  query?: string;
};

/**
 * TODO(perf): Add a `pg_trgm` GIN index before the public directory exceeds 50k rows.
 * Description substring search is intentionally bounded today by discoverable + public.
 */
export function buildDiscoverServerWhere(
  input: DiscoverServerFilterInput,
): Prisma.ServerWhereInput {
  const query = input.query?.trim() || undefined;
  const selectedCategory = toServerCategory(input.category);
  const searchFilters: Prisma.ServerWhereInput[] = query
    ? [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { tags: { has: normalizeServerDiscoveryTagQuery(query) } },
        ...(input.categoryHint === undefined
          ? []
          : [{ category: toServerCategory(input.categoryHint) }]),
      ]
    : [];

  return {
    discoverable: true,
    isPublic: true,
    ...(selectedCategory === null ? {} : { category: selectedCategory }),
    ...(query
      ? {
          OR: searchFilters,
        }
      : {}),
  };
}

type OnlinePoolRow = { id: string };

export function paginateOnlineServerPool<Row extends OnlinePoolRow>(
  rows: readonly Row[],
  onlineCounts: ReadonlyMap<string, number>,
  input: {
    cursor?: DiscoverCursor | null;
    limit: number;
    totalCount: number;
  },
) {
  const sorted = [...rows].sort((left, right) => {
    const countDifference = (onlineCounts.get(right.id) ?? 0) - (onlineCounts.get(left.id) ?? 0);
    if (countDifference !== 0) {
      return countDifference;
    }

    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const cursor = input.cursor;
  const afterCursor =
    cursor === undefined || cursor === null
      ? sorted
      : sorted.filter((row) => {
          const onlineCount = onlineCounts.get(row.id) ?? 0;
          return onlineCount < cursor.value || (onlineCount === cursor.value && row.id > cursor.id);
        });
  const page = afterCursor.slice(0, input.limit);
  const last = page.at(-1);
  const hasMore = afterCursor.length > page.length;

  return {
    nextCursor:
      hasMore && last
        ? encodeDiscoverCursor({
            id: last.id,
            phase: "rest",
            sort: "online",
            value: onlineCounts.get(last.id) ?? 0,
          })
        : null,
    rows: page,
    truncated: input.totalCount > rows.length,
  };
}

const DEFAULT_DISCOVER_SERVERS_LIMIT = 24;
const MAX_DISCOVER_SERVERS_LIMIT = 50;

const DISCOVER_SERVER_SELECT = {
  ...SERVER_DISCOVERY_SELECT,
  category: true,
  createdAt: true,
  languages: true,
} satisfies Prisma.ServerSelect;

export type DiscoverServerRow = Prisma.ServerGetPayload<{
  select: typeof DISCOVER_SERVER_SELECT;
}>;

export type DiscoverServersPage = {
  categories: DiscoverCategory[] | null;
  featured: DiscoverServer | null;
  items: DiscoverServer[];
  nextCursor: string | null;
  totalCount: number;
};

export type ListDiscoverServersInput = DiscoverServerFilterInput & {
  cursor?: string;
  limit?: number;
  sort: DiscoverSortKey;
};

type FetchPhaseRowsInput = {
  cursor: DiscoverCursor | null;
  featured: boolean;
  filter: DiscoverServerFilterInput;
  sort: "popular" | "new";
  take: number;
};

export type DiscoverServersDependencies = {
  countOnlineMembers(ids: readonly string[]): Promise<Map<string, number>>;
  countServers(where: Prisma.ServerWhereInput): Promise<number>;
  fetchOnlinePool(input: {
    take: number;
    where: Prisma.ServerWhereInput;
  }): Promise<DiscoverServerRow[]>;
  fetchPhaseRows(input: FetchPhaseRowsInput): Promise<DiscoverServerRow[]>;
  findFeatured(where: Prisma.ServerWhereInput): Promise<DiscoverServerRow | null>;
  findJoinedServerIds(userId: string, ids: readonly string[]): Promise<ReadonlySet<string>>;
  groupCategoryCounts(where: Prisma.ServerWhereInput): Promise<DiscoverCategoryCountRow[]>;
  logOnlinePoolTruncated(entry: { pool: number; total: number }): void;
};

function discoverCursorValue(row: DiscoverServerRow, sort: "popular" | "new"): number {
  return sort === "popular" ? row.memberCount : row.createdAt.getTime();
}

function encodeLastRowCursor(
  row: DiscoverServerRow,
  phase: DiscoverCursorPhase,
  sort: "popular" | "new",
): string {
  return encodeDiscoverCursor({
    id: row.id,
    phase,
    sort,
    value: discoverCursorValue(row, sort),
  });
}

async function fetchDatabaseSortedPage(
  dependencies: DiscoverServersDependencies,
  input: {
    cursor: DiscoverCursor | null;
    filter: DiscoverServerFilterInput;
    limit: number;
    sort: "popular" | "new";
  },
): Promise<{ nextCursor: string | null; rows: DiscoverServerRow[] }> {
  const featuredRows =
    input.cursor === null || input.cursor.phase === "featured"
      ? await dependencies.fetchPhaseRows({
          cursor: input.cursor?.phase === "featured" ? input.cursor : null,
          featured: true,
          filter: input.filter,
          sort: input.sort,
          take: input.limit + 1,
        })
      : [];

  if (featuredRows.length > input.limit) {
    const rows = featuredRows.slice(0, input.limit);
    const last = rows.at(-1);
    return {
      nextCursor: last ? encodeLastRowCursor(last, "featured", input.sort) : null,
      rows,
    };
  }

  const restTake = input.limit - featuredRows.length + 1;
  const restRows = await dependencies.fetchPhaseRows({
    cursor: input.cursor?.phase === "rest" ? input.cursor : null,
    featured: false,
    filter: input.filter,
    sort: input.sort,
    take: restTake,
  });
  const hasMore = restRows.length >= restTake;
  const restPage = hasMore ? restRows.slice(0, restTake - 1) : restRows;
  const rows = [...featuredRows, ...restPage];
  const last = rows.at(-1);
  const nextPhase = hasMore && restPage.length === 0 ? "featured" : "rest";

  return {
    nextCursor: hasMore && last ? encodeLastRowCursor(last, nextPhase, input.sort) : null,
    rows,
  };
}

function uniqueServerRows(rows: readonly DiscoverServerRow[]): DiscoverServerRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) {
      return false;
    }
    seen.add(row.id);
    return true;
  });
}

function buildDiscoverServer(
  row: DiscoverServerRow,
  onlineCount: number,
  joined: boolean,
): DiscoverServer {
  return {
    category: toCategoryKey(row.category),
    description: row.description ?? "",
    featured: row.features.includes(SERVER_DISCOVERY_FEATURED_FLAG),
    iconUrl: row.iconUrl,
    id: row.id,
    initials: toDiscoverInitials(row.name, row.shortName),
    joined,
    languages: row.languages,
    memberCount: row.memberCount,
    name: row.name,
    onlineCount,
    tags: row.tags,
  };
}

export async function listDiscoverServersWithDependencies(
  userId: string,
  input: ListDiscoverServersInput,
  dependencies: DiscoverServersDependencies,
): Promise<DiscoverServersPage> {
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? DEFAULT_DISCOVER_SERVERS_LIMIT), 1),
    MAX_DISCOVER_SERVERS_LIMIT,
  );
  const query = input.query?.trim() || undefined;
  const filter: DiscoverServerFilterInput = {
    category: input.category,
    ...(query === undefined ? {} : { query }),
    ...(query === undefined || input.categoryHint === undefined
      ? {}
      : { categoryHint: input.categoryHint }),
  };
  const cursor = input.cursor ? decodeDiscoverCursor(input.cursor, input.sort) : null;
  const firstPage = cursor === null;
  const listWhere = buildDiscoverServerWhere(filter);
  const metadataWhere = buildDiscoverServerWhere({ ...filter, category: "all" });
  const includeFeatured = firstPage && input.category === "all" && query === undefined;

  const [totalCount, categoryRows, featuredRow] = await Promise.all([
    dependencies.countServers(listWhere),
    firstPage ? dependencies.groupCategoryCounts(metadataWhere) : Promise.resolve(null),
    includeFeatured ? dependencies.findFeatured(listWhere) : Promise.resolve(null),
  ]);

  let pageRows: DiscoverServerRow[];
  let nextCursor: string | null;
  let onlineCounts: Map<string, number>;

  if (input.sort === "online") {
    const poolRows = await dependencies.fetchOnlinePool({
      take: ONLINE_SORT_POOL,
      where: listWhere,
    });
    const onlineRows = uniqueServerRows([
      ...poolRows,
      ...(featuredRow === null ? [] : [featuredRow]),
    ]);
    onlineCounts = await dependencies.countOnlineMembers(onlineRows.map((row) => row.id));
    const page = paginateOnlineServerPool(poolRows, onlineCounts, {
      cursor,
      limit,
      totalCount,
    });
    pageRows = page.rows;
    nextCursor = page.nextCursor;

    if (page.truncated) {
      dependencies.logOnlinePoolTruncated({ pool: ONLINE_SORT_POOL, total: totalCount });
    }
  } else {
    const page = await fetchDatabaseSortedPage(dependencies, {
      cursor,
      filter,
      limit,
      sort: input.sort,
    });
    pageRows = page.rows;
    nextCursor = page.nextCursor;
    const onlineRows = uniqueServerRows([
      ...pageRows,
      ...(featuredRow === null ? [] : [featuredRow]),
    ]);
    onlineCounts = await dependencies.countOnlineMembers(onlineRows.map((row) => row.id));
  }

  const membershipRows = uniqueServerRows([
    ...pageRows,
    ...(featuredRow === null ? [] : [featuredRow]),
  ]);
  const joinedServerIds = await dependencies.findJoinedServerIds(
    userId,
    membershipRows.map((row) => row.id),
  );
  const toServer = (row: DiscoverServerRow) =>
    buildDiscoverServer(row, onlineCounts.get(row.id) ?? 0, joinedServerIds.has(row.id));

  return {
    categories: categoryRows === null ? null : buildDiscoverCategoryCounts(categoryRows),
    featured: featuredRow === null ? null : toServer(featuredRow),
    items: pageRows.map(toServer),
    nextCursor,
    totalCount,
  };
}

type DiscoveryIdRow = { id: string };

function buildRawFilterSql(filter: DiscoverServerFilterInput): Prisma.Sql {
  const query = filter.query?.trim() || undefined;
  const selectedCategory = toServerCategory(filter.category);
  const hintedCategory =
    query === undefined || filter.categoryHint === undefined
      ? null
      : toServerCategory(filter.categoryHint);
  const selectedCategorySql =
    selectedCategory === null
      ? Prisma.empty
      : Prisma.sql`AND "category" = ${selectedCategory}::"ServerCategory"`;
  const hintSql =
    hintedCategory === null
      ? Prisma.empty
      : Prisma.sql`OR "category" = ${hintedCategory}::"ServerCategory"`;
  const searchSql = query
    ? Prisma.sql`AND (
        "name" ILIKE ${`%${query}%`}
        OR "description" ILIKE ${`%${query}%`}
        OR "tags" @> ARRAY[${normalizeServerDiscoveryTagQuery(query)}]::text[]
        ${hintSql}
      )`
    : Prisma.empty;

  return Prisma.sql`${selectedCategorySql} ${searchSql}`;
}

async function hydrateDiscoverServerRows(
  database: PrismaClient,
  ids: readonly string[],
): Promise<DiscoverServerRow[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await database.server.findMany({
    select: DISCOVER_SERVER_SELECT,
    where: { id: { in: [...ids] } },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

async function fetchDeepCursorIds(
  database: PrismaClient,
  input: FetchPhaseRowsInput,
): Promise<string[]> {
  const featureSql = input.featured
    ? Prisma.sql`"features" @> ARRAY[${SERVER_DISCOVERY_FEATURED_FLAG}]::text[]`
    : Prisma.sql`NOT ("features" @> ARRAY[${SERVER_DISCOVERY_FEATURED_FLAG}]::text[])`;
  const filterSql = buildRawFilterSql(input.filter);
  const cursor = input.cursor;
  if (cursor === null) {
    return [];
  }

  const rows =
    input.sort === "popular"
      ? await database.$queryRaw<DiscoveryIdRow[]>(Prisma.sql`
          SELECT "id"
          FROM "Server"
          WHERE "discoverable" = true
            AND "isPublic" = true
            AND ${featureSql}
            ${filterSql}
            AND ("memberCount", "id") < (${cursor.value}, ${cursor.id})
          ORDER BY "memberCount" DESC, "id" DESC
          LIMIT ${input.take}
        `)
      : await database.$queryRaw<DiscoveryIdRow[]>(Prisma.sql`
          SELECT "id"
          FROM "Server"
          WHERE "discoverable" = true
            AND "isPublic" = true
            AND ${featureSql}
            ${filterSql}
            AND ("createdAt", "id") < (${new Date(cursor.value)}, ${cursor.id})
          ORDER BY "createdAt" DESC, "id" DESC
          LIMIT ${input.take}
        `);

  return rows.map((row) => row.id);
}

function createDiscoverServersDependencies(
  database: PrismaClient,
  redis: ServerOnlinePresenceBatchRedis,
): DiscoverServersDependencies {
  return {
    countOnlineMembers: (ids) => countServerOnlineMembersBatch(redis, ids),
    countServers: (where) => database.server.count({ where }),
    fetchOnlinePool: ({ take, where }) =>
      database.server.findMany({
        orderBy: [{ memberCount: "desc" }, { id: "desc" }],
        select: DISCOVER_SERVER_SELECT,
        take,
        where,
      }),
    fetchPhaseRows: async (input) => {
      if (input.cursor !== null) {
        const ids = await fetchDeepCursorIds(database, input);
        return hydrateDiscoverServerRows(database, ids);
      }

      return database.server.findMany({
        orderBy:
          input.sort === "popular"
            ? [{ memberCount: "desc" }, { id: "desc" }]
            : [{ createdAt: "desc" }, { id: "desc" }],
        select: DISCOVER_SERVER_SELECT,
        take: input.take,
        where: {
          ...buildDiscoverServerWhere(input.filter),
          ...(input.featured
            ? { features: { has: SERVER_DISCOVERY_FEATURED_FLAG } }
            : { NOT: { features: { has: SERVER_DISCOVERY_FEATURED_FLAG } } }),
        },
      });
    },
    findFeatured: (where) =>
      database.server.findFirst({
        orderBy: [{ memberCount: "desc" }, { id: "desc" }],
        select: DISCOVER_SERVER_SELECT,
        where: {
          ...where,
          features: { has: SERVER_DISCOVERY_FEATURED_FLAG },
        },
      }),
    findJoinedServerIds: async (userId, ids) => {
      if (ids.length === 0) {
        return new Set();
      }
      const rows = await database.serverMember.findMany({
        select: { serverId: true },
        where: { serverId: { in: [...ids] }, userId },
      });
      return new Set(rows.map((row) => row.serverId));
    },
    groupCategoryCounts: async (where) => {
      const rows = await database.server.groupBy({
        _count: { _all: true },
        by: ["category"],
        where,
      });
      return rows.map((row) => ({ category: row.category, _count: row._count }));
    },
    logOnlinePoolTruncated: (entry) => {
      logWarning("discover.servers.online_pool_truncated", entry);
    },
  };
}

export async function listDiscoverServers(
  userId: string,
  input: ListDiscoverServersInput,
): Promise<DiscoverServersPage> {
  const { prisma } = await import("@wizards/db");
  const { getRedisOp } = await import("@/lib/redis");
  return listDiscoverServersWithDependencies(
    userId,
    input,
    createDiscoverServersDependencies(prisma, getRedisOp()),
  );
}
