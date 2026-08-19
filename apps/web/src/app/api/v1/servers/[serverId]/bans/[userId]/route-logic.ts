import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { unbanWorkspaceMember } from "@/lib/workspace/member-ban-service";

export type UnbanMemberRouteContext = {
  params: Promise<{ serverId: string; userId: string }>;
};

export type UnbanMemberRouteDependencies = {
  enforceApiRateLimit: typeof enforceApiRateLimit;
  jsonError: typeof jsonError;
  requireApiUserId: typeof requireApiUserId;
  unbanWorkspaceMember: typeof unbanWorkspaceMember;
};

const defaultDependencies: UnbanMemberRouteDependencies = {
  enforceApiRateLimit,
  jsonError,
  requireApiUserId,
  unbanWorkspaceMember,
};

export async function deleteBanRoute(
  _request: Request,
  context: UnbanMemberRouteContext,
  dependencies: UnbanMemberRouteDependencies = defaultDependencies,
) {
  try {
    const actorId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(actorId, "member:unban");
    const { serverId, userId } = await context.params;
    await dependencies.unbanWorkspaceMember(actorId, serverId, userId);
    return Response.json({ success: true });
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
