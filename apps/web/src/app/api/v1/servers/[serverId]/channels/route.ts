import { CreateChannelSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { createWorkspaceChannel } from "@/lib/workspace/channel-service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:create");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, CreateChannelSchema);
    const channel = await createWorkspaceChannel(userId, serverId, input);

    return Response.json(channel, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
