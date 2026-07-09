import { UpdateWorkspaceMemberRolesSchema } from "@wizards/types";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { updateWorkspaceMemberRoles } from "@/lib/workspace/member-service";

type RouteContext = {
  params: Promise<{
    memberId: string;
    serverId: string;
  }>;
};

export type ServerMemberRolesRouteDependencies = {
  enforceApiRateLimit: typeof enforceApiRateLimit;
  jsonError: typeof jsonError;
  parseJsonBody: typeof parseJsonBody;
  requireApiUserId: typeof requireApiUserId;
  updateWorkspaceMemberRoles: (
    userId: string,
    serverId: string,
    memberId: string,
    input: { roleIds: string[] },
  ) => Promise<unknown>;
};

const defaultServerMemberRolesRouteDependencies: ServerMemberRolesRouteDependencies = {
  enforceApiRateLimit,
  jsonError,
  parseJsonBody,
  requireApiUserId,
  updateWorkspaceMemberRoles,
};

export async function patchServerMemberRolesRoute(
  request: Request,
  context: RouteContext,
  dependencies: ServerMemberRolesRouteDependencies = defaultServerMemberRolesRouteDependencies,
) {
  try {
    const userId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(userId, "member:roles:update");
    const { memberId, serverId } = await context.params;
    const input = await dependencies.parseJsonBody(request, UpdateWorkspaceMemberRolesSchema);
    await dependencies.updateWorkspaceMemberRoles(userId, serverId, memberId, input);

    return Response.json({ success: true });
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
