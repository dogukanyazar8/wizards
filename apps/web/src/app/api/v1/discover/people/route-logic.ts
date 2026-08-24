import { DiscoverPersonPageSchema, DiscoverQuerySchema } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { listDiscoverPeople } from "@/lib/discover/people-service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";

export type DiscoverPeopleRouteDependencies = HomeRouteContext & {
  listPeople: typeof listDiscoverPeople;
};

const defaultDependencies: DiscoverPeopleRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listPeople: listDiscoverPeople,
};

export async function discoverPeopleRoute(
  request: Request,
  dependencies: DiscoverPeopleRouteDependencies = defaultDependencies,
) {
  return runHomeRoute("discover:people", dependencies, async (userId) => {
    const params = readSearchParams(request);
    const query = DiscoverQuerySchema.pick({ q: true }).parse({ q: optionalParam(params, "q") });

    return DiscoverPersonPageSchema.parse(
      await dependencies.listPeople(userId, query.q ? { query: query.q } : {}),
    );
  });
}
