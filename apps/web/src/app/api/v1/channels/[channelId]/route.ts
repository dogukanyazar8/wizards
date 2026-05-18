import { UpdateChannelSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  deleteWorkspaceChannel,
  updateWorkspaceChannel,
} from "@/lib/workspace/channel-service";

type RouteContext = {
  params: Promise<{
    channelId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:update");
    const { channelId } = await context.params;
    const input = await parseJsonBody(request, UpdateChannelSchema);
    await updateWorkspaceChannel(userId, channelId, input);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:delete");
    const { channelId } = await context.params;
    await deleteWorkspaceChannel(userId, channelId);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
