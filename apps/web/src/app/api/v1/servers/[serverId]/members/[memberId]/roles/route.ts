import { UpdateWorkspaceMemberRolesSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { updateWorkspaceMemberRoles } from "@/lib/workspace/member-service";

type RouteContext = {
  params: Promise<{
    memberId: string;
    serverId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "member:roles:update");
    const { memberId, serverId } = await context.params;
    const input = await parseJsonBody(request, UpdateWorkspaceMemberRolesSchema);
    await updateWorkspaceMemberRoles(userId, serverId, memberId, input);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
