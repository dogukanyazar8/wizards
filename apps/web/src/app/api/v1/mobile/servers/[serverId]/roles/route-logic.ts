import { MobileAssignableRolesResponseSchema, MobileServerIdParamsSchema } from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { listAssignableWorkspaceRoles } from "@/lib/workspace/role-service";

type MobileAssignableRolesRateLimitAction = "mobile:server:roles:list";

export type MobileAssignableRolesRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileAssignableRolesRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: MobileAssignableRolesRateLimitAction): Promise<void>;
  listAssignableRoles: typeof listAssignableWorkspaceRoles;
};

const defaultDependencies: MobileAssignableRolesRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  listAssignableRoles: listAssignableWorkspaceRoles,
};

export async function mobileAssignableRolesListRoute(
  request: Request,
  context: MobileAssignableRolesRouteContext,
  dependencies: MobileAssignableRolesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:roles:list");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const roles = await dependencies.listAssignableRoles(userId, serverId);

    return Response.json(
      MobileAssignableRolesResponseSchema.parse({
        roles: roles.map(({ color, id, name, position }) => ({ color, id, name, position })),
      }),
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
