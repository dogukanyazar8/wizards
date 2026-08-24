import { prisma } from "@wizards/db";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";

import { listHomeRecent } from "@/lib/home/recent-service";
import { readHomePresence } from "@/lib/home/service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";
import {
  AppRecentQuerySchema,
  AppRecentResponseSchema,
  type AppRecentResponse,
} from "@/lib/home/types";

export type AppRecentRouteDependencies = HomeRouteContext & {
  listRecent: (userId: string, limit: number) => Promise<AppRecentResponse>;
};

export const defaultAppRecentDependencies: AppRecentRouteDependencies = {
  // Named here rather than shared from the runner so the route contract can
  // see the guard on the route itself (`route-contract.test.ts`).
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listRecent: (userId, limit) =>
    listHomeRecent(userId, limit, { database: prisma, readPresence: readHomePresence }),
};

export async function appRecentRoute(
  request: Request,
  dependencies: AppRecentRouteDependencies = defaultAppRecentDependencies,
) {
  return runHomeRoute("app:recent", dependencies, async (userId) => {
    const params = readSearchParams(request);
    const query = AppRecentQuerySchema.parse({ limit: optionalParam(params, "limit") });

    return AppRecentResponseSchema.parse(await dependencies.listRecent(userId, query.limit));
  });
}
