import { AddServerMemberSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { addWorkspaceServerMemberByUsername } from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, AddServerMemberSchema);
    const result = await addWorkspaceServerMemberByUsername(userId, serverId, input);

    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
