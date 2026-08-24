import { UpdateWorkspaceRoleSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { deleteWorkspaceRole, updateWorkspaceRole } from "@/lib/workspace/role-service";

type RouteContext = {
  params: Promise<{
    roleId: string;
    serverId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "roles:update");
    const { roleId, serverId } = await context.params;
    const input = await parseJsonBody(request, UpdateWorkspaceRoleSchema);
    const role = await updateWorkspaceRole(userId, serverId, roleId, input);

    return Response.json({ role });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "roles:delete");
    const { roleId, serverId } = await context.params;
    await deleteWorkspaceRole(userId, serverId, roleId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
