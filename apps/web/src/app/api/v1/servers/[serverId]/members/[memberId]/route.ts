import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { kickWorkspaceMember } from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    memberId: string;
    serverId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "member:kick");
    const { memberId, serverId } = await context.params;
    await kickWorkspaceMember(userId, serverId, memberId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
