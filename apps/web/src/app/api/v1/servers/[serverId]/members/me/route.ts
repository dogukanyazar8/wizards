import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { leaveWorkspaceServer } from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "member:leave");
    const { serverId } = await context.params;
    await leaveWorkspaceServer(userId, serverId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
