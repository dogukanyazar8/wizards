import { requireApiUserId } from "@/lib/auth/api";
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
    const { inviteId, serverId } = await context.params;
    await revokeWorkspaceInvite(userId, serverId, inviteId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
