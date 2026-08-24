import { DiscoverEventPageSchema, DiscoverQuerySchema } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { listDiscoverEvents } from "@/lib/discover/events-service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";

export type DiscoverEventsRouteDependencies = HomeRouteContext & {
  listEvents: typeof listDiscoverEvents;
};

const defaultDependencies: DiscoverEventsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listEvents: listDiscoverEvents,
};

function parseLimit(value: string | null): number {
  const numeric = Number(value);
  return value === null || value.trim() === "" || !Number.isFinite(numeric)
    ? 24
    : Math.min(Math.max(Math.trunc(numeric), 1), 50);
}

export async function discoverEventsRoute(
  request: Request,
  dependencies: DiscoverEventsRouteDependencies = defaultDependencies,
) {
  return runHomeRoute("discover:events", dependencies, async (userId) => {
    const params = readSearchParams(request);
    const query = DiscoverQuerySchema.pick({ cursor: true, q: true }).parse({
      cursor: optionalParam(params, "cursor"),
      q: optionalParam(params, "q"),
    });
    const input = {
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.q ? { query: query.q } : {}),
    };

    return DiscoverEventPageSchema.parse(
      await dependencies.listEvents(userId, input, { limit: parseLimit(params.get("limit")) }),
    );
  });
}
