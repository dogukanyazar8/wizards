import { CreateServerInviteSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import {
  createWorkspaceInvite,
  listPendingWorkspaceInvites,
  listWorkspaceInvites,
} from "@/lib/workspace/invite-service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

/**
 * Davet listesi (SPEC §8.7). `?pending=1` "Bekleyen davetler" kipidir: hedefi olan,
 * kullanılmamış ve süresi geçmemiş davetler, hedef kimliğiyle birlikte döner. Satır şekli
 * varsayılan listenin üst kümesi olduğu için taban şemayla ayrıştıran istemci bozulmaz.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "invite:list");
    const { serverId } = await context.params;
    const pending = new URL(request.url).searchParams.get("pending") === "1";
    const invites = pending
      ? await listPendingWorkspaceInvites(userId, serverId)
      : await listWorkspaceInvites(userId, serverId);

    return Response.json({ invites });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "invite:create");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, CreateServerInviteSchema);
    const invite = await createWorkspaceInvite(userId, serverId, input);

    return Response.json(invite, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
