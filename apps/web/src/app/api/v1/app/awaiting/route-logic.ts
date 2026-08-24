import { prisma } from "@wizards/db";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";

import { listHomeAwaiting, type ListHomeAwaitingQuery } from "@/lib/home/awaiting-service";
import { readHomePresence } from "@/lib/home/service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";
import {
  AppAwaitingQuerySchema,
  AppAwaitingResponseSchema,
  type AppAwaitingResponse,
} from "@/lib/home/types";

export type AppAwaitingRouteDependencies = HomeRouteContext & {
  listAwaiting: (userId: string, query: ListHomeAwaitingQuery) => Promise<AppAwaitingResponse>;
};

export const defaultAppAwaitingDependencies: AppAwaitingRouteDependencies = {
  // Named here rather than shared from the runner so the route contract can
  // see the guard on the route itself (`route-contract.test.ts`).
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listAwaiting: (userId, query) =>
    listHomeAwaiting(userId, query, {
      database: prisma,
      now: new Date(),
      readPresence: readHomePresence,
    }),
};

export async function appAwaitingRoute(
  request: Request,
  dependencies: AppAwaitingRouteDependencies = defaultAppAwaitingDependencies,
) {
  return runHomeRoute("app:awaiting", dependencies, async (userId) => {
    const params = readSearchParams(request);
    const query = AppAwaitingQuerySchema.parse({
      limit: optionalParam(params, "limit"),
      // Faz 6 §6 — the inbox's chips are a server round trip, so an unasked-for
      // source is never read rather than read and then thrown away.
      source: optionalParam(params, "source"),
    });

    return AppAwaitingResponseSchema.parse(await dependencies.listAwaiting(userId, query));
  });
}
