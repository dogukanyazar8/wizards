import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { listWorkspaceServerBans } from "@/lib/workspace/member-ban-service";

export type ServerBansRouteContext = {
  params: Promise<{ serverId: string }>;
};

export type ServerBansRouteDependencies = {
  enforceApiRateLimit: typeof enforceApiRateLimit;
  jsonError: typeof jsonError;
  listWorkspaceServerBans: typeof listWorkspaceServerBans;
  requireApiUserId: typeof requireApiUserId;
};

const defaultDependencies: ServerBansRouteDependencies = {
  enforceApiRateLimit,
  jsonError,
  listWorkspaceServerBans,
  requireApiUserId,
};

export async function getServerBansRoute(
  request: Request,
  context: ServerBansRouteContext,
  dependencies: ServerBansRouteDependencies = defaultDependencies,
) {
  try {
    const actorId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(actorId, "server:bans:list");
    const { serverId } = await context.params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "", 10);
    const result = await dependencies.listWorkspaceServerBans(actorId, serverId, {
      ...(cursor ? { cursor } : {}),
      ...(Number.isFinite(requestedLimit) ? { limit: requestedLimit } : {}),
    });

    return Response.json(result);
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
