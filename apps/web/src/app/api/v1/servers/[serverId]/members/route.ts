import { AddServerMemberSchema, WorkspaceMemberFilterSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { addWorkspaceServerMemberByUsername } from "@/lib/workspace/member-service";
import { listWorkspaceServerMembers } from "@/lib/workspace/server-service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    const { serverId } = await context.params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "100", 10);
    // Ş2 / SPEC-SUNUCU §8.6: arama ve yedi çip sunucu tarafında süzer. Tanınmayan bir çip
    // 400 değil `all`: sayfa bir sorgu dizesi yüzünden boş kalmaz, filtre yalnız etkisiz olur.
    const q = searchParams.get("q")?.trim() || undefined;
    const filter = WorkspaceMemberFilterSchema.catch("all").parse(
      searchParams.get("filter") ?? "all",
    );
    const result = await listWorkspaceServerMembers(userId, serverId, {
      ...(cursor ? { cursor } : {}),
      filter,
      ...(Number.isFinite(requestedLimit) ? { limit: requestedLimit } : {}),
      ...(q ? { q } : {}),
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "member:add");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, AddServerMemberSchema);
    const result = await addWorkspaceServerMemberByUsername(userId, serverId, input);

    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
