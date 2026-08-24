import { DiscoverChannelPageSchema, DiscoverQuerySchema } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { listDiscoverChannels } from "@/lib/discover/channels-service";
import {
  optionalParam,
  readSearchParams,
  runHomeRoute,
  type HomeRouteContext,
} from "@/lib/home/route-runner";

export type DiscoverChannelsRouteDependencies = HomeRouteContext & {
  listChannels: typeof listDiscoverChannels;
};

const defaultDependencies: DiscoverChannelsRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  listChannels: listDiscoverChannels,
};

function parseLimit(value: string | null): number {
  const numeric = Number(value);
  return value === null || value.trim() === "" || !Number.isFinite(numeric)
    ? 24
    : Math.min(Math.max(Math.trunc(numeric), 1), 50);
}

export async function discoverChannelsRoute(
  request: Request,
  dependencies: DiscoverChannelsRouteDependencies = defaultDependencies,
) {
  return runHomeRoute("discover:channels", dependencies, async () => {
    const params = readSearchParams(request);
    const query = DiscoverQuerySchema.pick({ cursor: true, q: true }).parse({
      cursor: optionalParam(params, "cursor"),
      q: optionalParam(params, "q"),
    });

    return DiscoverChannelPageSchema.parse(
      await dependencies.listChannels(
        {
          ...(query.cursor ? { cursor: query.cursor } : {}),
          ...(query.q ? { query: query.q } : {}),
        },
        { limit: parseLimit(params.get("limit")) },
      ),
    );
  });
}
