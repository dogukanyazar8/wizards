import {
  DiscoverCategoryKeySchema,
  DiscoverCategorySchema,
  DiscoverQuerySchema,
  DiscoverServerCategoryKeySchema,
  DiscoverServerSchema,
  DiscoverSortKeySchema,
} from "@wizards/types";
import { z } from "zod";

import { ApiError, jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { listDiscoverServers, type ListDiscoverServersInput } from "@/lib/discover/servers-service";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const RATE_LIMIT_RETRY_SECONDS = 60;

const DiscoverServersResponseSchema = z.object({
  categories: z.array(DiscoverCategorySchema).nullable(),
  featured: DiscoverServerSchema.nullable(),
  items: z.array(DiscoverServerSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative(),
});

function parseLimit(rawLimit: string | null): number {
  if (rawLimit === null || rawLimit.trim() === "") {
    return DEFAULT_LIMIT;
  }

  const numericLimit = Number(rawLimit);
  if (!Number.isFinite(numericLimit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(numericLimit), 1), MAX_LIMIT);
}

export function parseDiscoverServersRequest(request: Request): ListDiscoverServersInput {
  const searchParams = new URL(request.url).searchParams;
  const rawCategory = searchParams.get("cat");
  const rawSort = searchParams.get("sort");
  const categoryResult = DiscoverCategoryKeySchema.safeParse(rawCategory);
  const sortResult = DiscoverSortKeySchema.safeParse(rawSort);
  const rawQuery = searchParams.get("q")?.trim() || undefined;
  const rawCursor = searchParams.get("cursor")?.trim() || undefined;
  const categoryHintResult = DiscoverServerCategoryKeySchema.safeParse(searchParams.get("catHint"));
  const query = DiscoverQuerySchema.parse({
    category: categoryResult.success ? categoryResult.data : "all",
    ...(rawCursor === undefined ? {} : { cursor: rawCursor }),
    lane: "servers",
    ...(rawQuery === undefined ? {} : { q: rawQuery }),
    sort: sortResult.success ? sortResult.data : "popular",
  });

  return {
    category: query.category,
    ...(query.q === undefined || !categoryHintResult.success
      ? {}
      : { categoryHint: categoryHintResult.data }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: parseLimit(searchParams.get("limit")),
    ...(query.q === undefined ? {} : { query: query.q }),
    sort: query.sort,
  };
}

export type DiscoverServersRouteDependencies = {
  authenticate(): Promise<string>;
  enforceRateLimit(userId: string, action: "discover:servers"): Promise<void>;
  listServers: typeof listDiscoverServers;
};

const defaultDependencies: DiscoverServersRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listServers: listDiscoverServers,
};

export async function discoverServersRoute(
  request: Request,
  dependencies: DiscoverServersRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "discover:servers");
    const input = parseDiscoverServersRequest(request);
    const page = await dependencies.listServers(userId, input);

    return Response.json(DiscoverServersResponseSchema.parse(page));
  } catch (error) {
    const response = jsonError(error);
    if (error instanceof ApiError && error.status === 429) {
      response.headers.set("Retry-After", String(RATE_LIMIT_RETRY_SECONDS));
    }
    return response;
  }
}
