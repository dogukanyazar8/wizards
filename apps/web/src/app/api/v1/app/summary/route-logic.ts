import { prisma } from "@wizards/db";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";

import { runHomeRoute, type HomeRouteContext } from "@/lib/home/route-runner";
import { applyExpiredFocus, broadcastHomePresence } from "@/lib/home/presence-service";
import { getHomeSummary } from "@/lib/home/summary-service";
import { AppSummaryResponseSchema, type AppSummaryResponse } from "@/lib/home/types";

export type AppSummaryRouteDependencies = HomeRouteContext & {
  getSummary: (userId: string, now: Date) => Promise<AppSummaryResponse>;
  now: () => Date;
};

export const defaultAppSummaryDependencies: AppSummaryRouteDependencies = {
  // Named here rather than shared from the runner so the route contract can
  // see the guard on the route itself (`route-contract.test.ts`).
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  getSummary: (userId, now) =>
    getHomeSummary(userId, {
      applyExpiredFocus: (input) =>
        applyExpiredFocus(input, { broadcast: broadcastHomePresence, database: prisma, now }),
      database: prisma,
      now,
    }),
  now: () => new Date(),
};

export async function appSummaryRoute(
  dependencies: AppSummaryRouteDependencies = defaultAppSummaryDependencies,
) {
  return runHomeRoute("app:summary", dependencies, async (userId) =>
    AppSummaryResponseSchema.parse(await dependencies.getSummary(userId, dependencies.now())),
  );
}
