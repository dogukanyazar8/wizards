import { MobileServerJoinRequestSchema, MobileServerJoinResponseSchema } from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { joinWorkspaceServerByInvite } from "@/lib/workspace/invite-service";

type MobileServerJoinRateLimitAction = "mobile:server:join";

export type MobileServerJoinRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  enforceRateLimit(userId: string, action: MobileServerJoinRateLimitAction): Promise<void>;
  joinServerByInvite: typeof joinWorkspaceServerByInvite;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: MobileServerJoinRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  enforceRateLimit: enforceApiRateLimit,
  joinServerByInvite: joinWorkspaceServerByInvite,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

export async function mobileServerJoinRoute(
  request: Request,
  dependencies: MobileServerJoinRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:join");
    const input = await dependencies.parseBody(request, MobileServerJoinRequestSchema);
    const joined = await dependencies.joinServerByInvite(userId, input.inviteCode);

    return Response.json(MobileServerJoinResponseSchema.parse({ server: { id: joined.serverId } }));
  } catch (error) {
    return jsonError(error);
  }
}
