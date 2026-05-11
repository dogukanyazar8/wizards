import { UpdateWorkspaceChannelPermissionsSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  getWorkspaceChannelPermissionSettings,
  updateWorkspaceChannelPermissions,
} from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    channelId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:permissions:read");
    const { channelId } = await context.params;
    const permissions = await getWorkspaceChannelPermissionSettings(userId, channelId);

    return Response.json({ permissions });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "channel:permissions:update");
    const { channelId } = await context.params;
    const input = await parseJsonBody(request, UpdateWorkspaceChannelPermissionsSchema);
    const permissions = await updateWorkspaceChannelPermissions(userId, channelId, input);

    return Response.json({ permissions });
  } catch (error) {
    return jsonError(error);
  }
}
