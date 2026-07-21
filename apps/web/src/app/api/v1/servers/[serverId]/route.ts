import { DeleteServerSchema, UpdateServerSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { createServerTiming } from "@/lib/server-timing";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  deleteWorkspaceServer,
  getWorkspaceServerDetail,
  updateWorkspaceServer,
} from "@/lib/workspace/server-service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const timing = createServerTiming();

  try {
    const stopAuthTiming = timing.start("auth");
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:detail");
    stopAuthTiming();
    const { serverId } = await context.params;
    const detail = await timing.measure("db", () => getWorkspaceServerDetail(userId, serverId));

    return Response.json({ detail }, { headers: timing.headers() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:update");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, UpdateServerSchema);
    const detail = await updateWorkspaceServer(userId, serverId, input);

    return Response.json({ detail });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "server:delete");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, DeleteServerSchema);
    await deleteWorkspaceServer(userId, serverId, input);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
