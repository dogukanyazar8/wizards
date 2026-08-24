import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireApiUserId } from "@/lib/auth/api";
import { joinPublicWorkspaceServer } from "@/lib/workspace/invite-service";

export type ServerJoinRouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export type ServerJoinRouteDependencies = {
  authenticate(): Promise<string>;
  enforceRateLimit(userId: string, action: "server:join-public"): Promise<void>;
  joinServer: typeof joinPublicWorkspaceServer;
};

const defaultDependencies: ServerJoinRouteDependencies = {
  authenticate: () => requireApiUserId(),
  enforceRateLimit: enforceApiRateLimit,
  joinServer: joinPublicWorkspaceServer,
};

/**
 * Invite-free join (S3 binding decision 1): a second membership-creation
 * path is not written here -- `joinPublicWorkspaceServer` applies the four
 * gating checks and then calls the exact same shared writer
 * `joinWorkspaceServerByInvite` uses. The request carries no body (the path
 * is the whole request, like the sibling `member:leave` route), so this is
 * registered bodyless in route-contract.test.ts rather than parsed.
 */
export async function serverJoinRoute(
  _request: Request,
  context: ServerJoinRouteContext,
  dependencies: ServerJoinRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    await dependencies.enforceRateLimit(userId, "server:join-public");
    const { serverId } = await context.params;
    const joined = await dependencies.joinServer(userId, serverId);

    return Response.json({ name: joined.name, serverId: joined.serverId, success: true });
  } catch (error) {
    return jsonError(error);
  }
}
