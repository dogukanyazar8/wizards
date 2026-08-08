import { ServerDiscoveryPageSchema, ServerDiscoveryQuerySchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { authorizeMobileApiRequest } from "@/lib/auth/api";
import { listDiscoverableServers } from "@/lib/servers/server-discovery-service";

export type MobileServerDiscoverRouteDependencies = {
  /**
   * Authentication and rate limiting resolve together -- see
   * `authorizeMobileApiRequest`. Same stance as the mobile server profile
   * route: a mobile consumer always carries a Bearer session, so there is no
   * anonymous branch to support here (unlike the web discover route).
   */
  authorize(request: Request, action: "mobile:server:discover"): Promise<string>;
  listServers: typeof listDiscoverableServers;
};

const defaultDependencies: MobileServerDiscoverRouteDependencies = {
  authorize: (request, action) => authorizeMobileApiRequest(request, action),
  listServers: listDiscoverableServers,
};

export async function mobileServerDiscoverRoute(
  request: Request,
  dependencies: MobileServerDiscoverRouteDependencies = defaultDependencies,
) {
  try {
    await dependencies.authorize(request, "mobile:server:discover");

    const query = ServerDiscoveryQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries()),
    );
    const page = await dependencies.listServers({
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.query === undefined ? {} : { query: query.query }),
    });

    return Response.json(ServerDiscoveryPageSchema.parse(page));
  } catch (error) {
    return jsonError(error);
  }
}
