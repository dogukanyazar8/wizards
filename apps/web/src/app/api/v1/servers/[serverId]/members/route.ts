import { AddServerMemberSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  addWorkspaceServerMemberByUsername,
  listWorkspaceServerMembers,
} from "@/lib/workspace/service";

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
    const result = await listWorkspaceServerMembers(userId, serverId, {
      ...(cursor ? { cursor } : {}),
      ...(Number.isFinite(requestedLimit) ? { limit: requestedLimit } : {}),
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
