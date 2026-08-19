import { z } from "zod";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { banWorkspaceMember } from "@/lib/workspace/member-ban-service";

const BanWorkspaceMemberSchema = z
  .object({ reason: z.string().trim().max(512).optional() })
  .strict();

export type BanMemberRouteContext = {
  params: Promise<{ memberId: string; serverId: string }>;
};

export type BanMemberRouteDependencies = {
  banWorkspaceMember: typeof banWorkspaceMember;
  enforceApiRateLimit: typeof enforceApiRateLimit;
  jsonError: typeof jsonError;
  parseJsonBody: typeof parseJsonBody;
  requireApiUserId: typeof requireApiUserId;
};

const defaultDependencies: BanMemberRouteDependencies = {
  banWorkspaceMember,
  enforceApiRateLimit,
  jsonError,
  parseJsonBody,
  requireApiUserId,
};

export async function postBanMemberRoute(
  request: Request,
  context: BanMemberRouteContext,
  dependencies: BanMemberRouteDependencies = defaultDependencies,
) {
  try {
    const actorId = await dependencies.requireApiUserId();
    await dependencies.enforceApiRateLimit(actorId, "member:ban");
    const { memberId, serverId } = await context.params;
    const input = await dependencies.parseJsonBody(request, BanWorkspaceMemberSchema);
    await dependencies.banWorkspaceMember(actorId, serverId, memberId, input);
    return Response.json({ success: true });
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
