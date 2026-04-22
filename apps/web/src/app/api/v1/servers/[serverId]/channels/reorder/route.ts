import { ReorderChannelsSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { reorderWorkspaceChannels } from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, ReorderChannelsSchema);
    await reorderWorkspaceChannels(userId, serverId, input.items);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
