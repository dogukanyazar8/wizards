import { prisma } from "@wizards/db";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";

import { getHomeUpcomingEvents } from "@/lib/home/events-service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";
import { readHomePresence } from "@/lib/home/service";
import {
  EventsUpcomingQuerySchema,
  EventsUpcomingResponseSchema,
  type EventsUpcomingResponse,
} from "@/lib/home/types";

export type EventsUpcomingRouteDependencies = HomeRouteContext & {
  listUpcoming: (userId: string, limit: number) => Promise<EventsUpcomingResponse>;
};

export const defaultEventsUpcomingDependencies: EventsUpcomingRouteDependencies = {
  // Named here rather than shared from the runner so the route contract can
  // see the guard on the route itself (`route-contract.test.ts`).
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listUpcoming: (userId, limit) =>
    getHomeUpcomingEvents(userId, limit, {
      database: prisma,
      now: new Date(),
      readPresence: readHomePresence,
    }),
};

export async function eventsUpcomingRoute(
  request: Request,
  dependencies: EventsUpcomingRouteDependencies = defaultEventsUpcomingDependencies,
) {
  return runHomeRoute("events:upcoming", dependencies, async (userId) => {
    const params = readSearchParams(request);
    const query = EventsUpcomingQuerySchema.parse({ limit: optionalParam(params, "limit") });

    return EventsUpcomingResponseSchema.parse(await dependencies.listUpcoming(userId, query.limit));
  });
}
