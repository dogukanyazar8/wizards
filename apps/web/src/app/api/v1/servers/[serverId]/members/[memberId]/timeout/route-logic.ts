import { ServerMemberTimeoutSchema } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { timeoutWorkspaceMember } from "@/lib/workspace/member-timeout-service";

export type TimeoutMemberRouteContext = {
  params: Promise<{ memberId: string; serverId: string }>;
};

export type TimeoutMemberRouteDependencies = {
  enforceApiRateLimit: typeof enforceApiRateLimit;
  jsonError: typeof jsonError;
  parseJsonBody: typeof parseJsonBody;
  requireApiUserId: typeof requireApiUserId;
  timeoutWorkspaceMember: typeof timeoutWorkspaceMember;
};

const defaultDependencies: TimeoutMemberRouteDependencies = {
  enforceApiRateLimit,
  jsonError,
  parseJsonBody,
  requireApiUserId,
  timeoutWorkspaceMember,
};

/**
 * `PATCH`, `POST` değil: zaman aşımı üyenin bir alanını değiştirir, yeni bir kaynak yaratmaz —
 * ve aynı uç `until: null` ile onu geri alır (Ş2 §2).
 */
export async function patchMemberTimeoutRoute(
  request: Request,
  context: TimeoutMemberRouteContext,
  dependencies: TimeoutMemberRouteDependencies = defaultDependencies,
) {
  try {
    const actorId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(actorId, "member:timeout");
    const { memberId, serverId } = await context.params;
    const input = await dependencies.parseJsonBody(request, ServerMemberTimeoutSchema);
    const result = await dependencies.timeoutWorkspaceMember(actorId, serverId, memberId, input);

    return Response.json({
      communicationDisabledUntil: result.communicationDisabledUntil,
      success: true,
    });
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
