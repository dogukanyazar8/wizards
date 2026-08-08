import { MobileServerIdParamsSchema, ServerPublicProfileSchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { authorizeMobileApiRequest } from "@/lib/auth/api";
import { getVisibleServerPublicProfile } from "@/lib/servers/server-public-profile-service";

export type MobileServerProfileRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerProfileRouteDependencies = {
  /**
   * Authentication and rate limiting resolve together — see
   * `authorizeMobileApiRequest`. Unlike the web route, mobile always carries
   * a Bearer session (S2 binding decision: "mobil tüketicisi, Bearer
   * oturumu"), so there is no anonymous branch to support here.
   */
  authorize(request: Request, action: "mobile:server:profile"): Promise<string>;
  getProfile: typeof getVisibleServerPublicProfile;
};

const defaultDependencies: MobileServerProfileRouteDependencies = {
  authorize: (request, action) => authorizeMobileApiRequest(request, action),
  getProfile: getVisibleServerPublicProfile,
};

export async function mobileServerProfileRoute(
  request: Request,
  context: MobileServerProfileRouteContext,
  dependencies: MobileServerProfileRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authorize(request, "mobile:server:profile");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const profile = await dependencies.getProfile(serverId, userId);

    return Response.json(ServerPublicProfileSchema.parse(profile));
  } catch (error) {
    return jsonError(error);
  }
}
