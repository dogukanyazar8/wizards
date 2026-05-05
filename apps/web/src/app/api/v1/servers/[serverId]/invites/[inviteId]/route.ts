import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { revokeWorkspaceInvite } from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    inviteId: string;
    serverId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "invite:revoke");
    const { inviteId, serverId } = await context.params;
    await revokeWorkspaceInvite(userId, serverId, inviteId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
