import { CreateInviteSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { createWorkspaceInvite } from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, CreateInviteSchema);
    const invite = await createWorkspaceInvite(userId, serverId, input);

    return Response.json(invite, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
