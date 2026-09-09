import { ServerBanSchema } from "@wizards/types";

import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { banWorkspaceMember } from "@/lib/workspace/member-ban-service";

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
    const input = await dependencies.parseJsonBody(request, ServerBanSchema);
    const result = await dependencies.banWorkspaceMember(actorId, serverId, memberId, input);
    // Silinen mesaj sayısı yanıtta: `deleteMessageSeconds` gönderen çağıran pencerenin gerçekte
    // ne temizlediğini görmeden "7 gün silindi" yazamaz.
    return Response.json({ deletedMessageCount: result.deletedMessageCount, success: true });
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
