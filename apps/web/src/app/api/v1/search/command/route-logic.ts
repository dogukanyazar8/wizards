import { prisma } from "@wizards/db";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";

import { searchHomeCommandSurfaces } from "@/lib/home/command-search-service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";
import { readHomePresence } from "@/lib/home/service";
import {
  SearchCommandQuerySchema,
  SearchCommandResponseSchema,
  type SearchCommandResponse,
} from "@/lib/home/types";

export type SearchCommandRouteDependencies = HomeRouteContext & {
  search: (userId: string, query: { q: string }) => Promise<SearchCommandResponse>;
};

export const defaultSearchCommandDependencies: SearchCommandRouteDependencies = {
  // Named here rather than shared from the runner so the route contract can
  // see the guard on the route itself (`route-contract.test.ts`).
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  search: (userId, query) =>
    searchHomeCommandSurfaces(userId, query, {
      database: prisma,
      readPresence: readHomePresence,
    }),
};

export async function searchCommandRoute(
  request: Request,
  dependencies: SearchCommandRouteDependencies = defaultSearchCommandDependencies,
) {
  return runHomeRoute("search:command", dependencies, async (userId) => {
    const params = readSearchParams(request);
    const query = SearchCommandQuerySchema.parse({ q: optionalParam(params, "q") });

    return SearchCommandResponseSchema.parse(await dependencies.search(userId, query));
  });
}
