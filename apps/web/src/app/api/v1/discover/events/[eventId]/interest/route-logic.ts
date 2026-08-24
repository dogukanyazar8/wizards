import { z } from "zod";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { setDiscoverEventInterest } from "@/lib/discover/events-service";
import { runHomeRoute, type HomeRouteContext } from "@/lib/home/route-runner";

const DiscoverEventInterestResponseSchema = z.object({
  interested: z.boolean(),
  interestedCount: z.number().int().nonnegative(),
});

export type DiscoverEventInterestRouteDependencies = HomeRouteContext & {
  setInterest: typeof setDiscoverEventInterest;
};

const defaultDependencies: DiscoverEventInterestRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  setInterest: setDiscoverEventInterest,
};

export async function discoverEventInterestRoute(
  _request: Request,
  eventId: string,
  interested: boolean,
  dependencies: DiscoverEventInterestRouteDependencies = defaultDependencies,
) {
  return runHomeRoute("discover:events", dependencies, async (userId) =>
    DiscoverEventInterestResponseSchema.parse(
      await dependencies.setInterest(userId, eventId, interested),
    ),
  );
}
