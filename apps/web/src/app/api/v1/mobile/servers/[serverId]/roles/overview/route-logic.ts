import { MobileServerIdParamsSchema, MobileServerRoleOverviewResponseSchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { listMobileWorkspaceRoleOverview } from "@/lib/workspace/role-service";

type MobileServerRoleOverviewRateLimitAction = "mobile:server:roles:overview:list";

export type MobileServerRoleOverviewRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerRoleOverviewRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: MobileServerRoleOverviewRateLimitAction): Promise<void>;
  listRoleOverview: typeof listMobileWorkspaceRoleOverview;
};

const defaultDependencies: MobileServerRoleOverviewRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  listRoleOverview: listMobileWorkspaceRoleOverview,
};

export async function mobileServerRoleOverviewListRoute(
  request: Request,
  context: MobileServerRoleOverviewRouteContext,
  dependencies: MobileServerRoleOverviewRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:roles:overview:list");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const roles = await dependencies.listRoleOverview(userId, serverId);

    return Response.json(MobileServerRoleOverviewResponseSchema.parse({ roles }), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
