import {
  MobileAssignableRolesResponseSchema,
  MobileRoleCreateRequestSchema,
  MobileRoleMutationResponseSchema,
  MobileServerIdParamsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { toMobileServerRole } from "@/lib/workspace/mobile-role-mapper";
import { createWorkspaceRole, listAssignableWorkspaceRoles } from "@/lib/workspace/role-service";

export type MobileAssignableRolesRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileAssignableRolesRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: "mobile:server:roles:list"): Promise<void>;
  listAssignableRoles: typeof listAssignableWorkspaceRoles;
};

export type MobileCreateRoleRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  createRole: typeof createWorkspaceRole;
  enforceRateLimit(userId: string, action: "mobile:server:roles:create"): Promise<void>;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: MobileAssignableRolesRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  listAssignableRoles: listAssignableWorkspaceRoles,
};

const createRoleDependencies: MobileCreateRoleRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  createRole: createWorkspaceRole,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
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

export async function mobileCreateRoleRoute(
  request: Request,
  context: MobileAssignableRolesRouteContext,
  dependencies: MobileCreateRoleRouteDependencies = createRoleDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:roles:create");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileRoleCreateRequestSchema);
    const role = await dependencies.createRole(userId, serverId, {
      color: input.color,
      name: input.name,
      permissions: input.permissionKeys,
    });

    return Response.json(
      MobileRoleMutationResponseSchema.parse({ role: toMobileServerRole(role) }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
