import { CreateWorkspaceRoleSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  createWorkspaceRole,
  listWorkspaceRoles,
} from "@/lib/workspace/role-service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "roles:list");
    const { serverId } = await context.params;
    const roles = await listWorkspaceRoles(userId, serverId);

    return Response.json({ roles });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "roles:create");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, CreateWorkspaceRoleSchema);
    const role = await createWorkspaceRole(userId, serverId, input);

    return Response.json({ role }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
