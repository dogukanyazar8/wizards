import {
  MobileMemberRolesUpdateRequestSchema,
  MobileMutationSuccessResponseSchema,
  MobileServerMemberParamsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { updateWorkspaceMemberRoles } from "@/lib/workspace/member-service";

type MobileServerMemberRolesRateLimitAction = "mobile:server:member-roles:update";

export type MobileServerMemberRolesRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerMemberRolesRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: MobileServerMemberRolesRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  updateMemberRoles: typeof updateWorkspaceMemberRoles;
};

const defaultDependencies: MobileServerMemberRolesRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateMemberRoles: updateWorkspaceMemberRoles,
};

export async function mobileServerMemberRolesUpdateRoute(
  request: Request,
  context: MobileServerMemberRolesRouteContext,
  dependencies: MobileServerMemberRolesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:member-roles:update");
    const { memberId, serverId } = MobileServerMemberParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileMemberRolesUpdateRequestSchema);
    const result = await dependencies.updateMemberRoles(userId, serverId, memberId, input);

    return Response.json(MobileMutationSuccessResponseSchema.parse(result));
  } catch (error) {
    return jsonError(error);
  }
}
