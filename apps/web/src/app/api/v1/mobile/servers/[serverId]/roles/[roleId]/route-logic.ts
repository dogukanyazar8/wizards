import {
  MobileMutationSuccessResponseSchema,
  MobileRoleMutationResponseSchema,
  MobileRoleUpdateRequestSchema,
  MobileServerRoleParamsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { toMobileServerRole } from "@/lib/workspace/mobile-role-mapper";
import { deleteWorkspaceRole, updateWorkspaceRole } from "@/lib/workspace/role-service";

type MobileRoleRateLimitAction = "mobile:server:roles:delete" | "mobile:server:roles:update";

export type MobileServerRoleRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerRoleRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  deleteRole: typeof deleteWorkspaceRole;
  enforceRateLimit(userId: string, action: MobileRoleRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  updateRole: typeof updateWorkspaceRole;
};

const defaultDependencies: MobileServerRoleRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  deleteRole: deleteWorkspaceRole,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateRole: updateWorkspaceRole,
};

export async function mobileUpdateRoleRoute(
  request: Request,
  context: MobileServerRoleRouteContext,
  dependencies: MobileServerRoleRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:roles:update");
    const { roleId, serverId } = MobileServerRoleParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileRoleUpdateRequestSchema);
    const role = await dependencies.updateRole(userId, serverId, roleId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.permissionKeys !== undefined ? { permissions: input.permissionKeys } : {}),
    });

    return Response.json(
      MobileRoleMutationResponseSchema.parse({ role: toMobileServerRole(role) }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileDeleteRoleRoute(
  request: Request,
  context: MobileServerRoleRouteContext,
  dependencies: MobileServerRoleRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:roles:delete");
    const { roleId, serverId } = MobileServerRoleParamsSchema.parse(await context.params);
    await dependencies.deleteRole(userId, serverId, roleId);

    return Response.json(MobileMutationSuccessResponseSchema.parse({ success: true }));
  } catch (error) {
    return jsonError(error);
  }
}
