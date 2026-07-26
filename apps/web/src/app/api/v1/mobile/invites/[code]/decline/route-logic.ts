import {
  MobileServerInviteCodeParamsSchema,
  MobileServerInviteDeclineResponseSchema,
} from "@wizards/types";

import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { declineTargetedServerInvite } from "@/lib/workspace/invite-service";

export type MobileInviteDeclineRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileInviteDeclineRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  declineInvite: typeof declineTargetedServerInvite;
  enforceRateLimit(userId: string, action: "mobile:invite:decline"): Promise<void>;
};

const defaultDependencies: MobileInviteDeclineRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  declineInvite: declineTargetedServerInvite,
  enforceRateLimit: enforceApiRateLimit,
};

/**
 * Recipient-side decline of a targeted server invite.
 *
 * Lives outside `/servers/[serverId]` on purpose: the recipient is not a member
 * of that server, so every server-scoped route would reject them before the
 * invite is even looked up.
 */
export async function mobileInviteDeclineRoute(
  request: Request,
  context: MobileInviteDeclineRouteContext,
  dependencies: MobileInviteDeclineRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:invite:decline");
    const { code } = MobileServerInviteCodeParamsSchema.parse(await context.params);
    const { serverId } = await dependencies.declineInvite(userId, code);

    return Response.json(
      MobileServerInviteDeclineResponseSchema.parse({ serverId, success: true }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
