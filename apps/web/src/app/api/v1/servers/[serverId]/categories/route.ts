import { CreateCategorySchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { createWorkspaceCategory } from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "category:create");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, CreateCategorySchema);
    const category = await createWorkspaceCategory(userId, serverId, input);

    return Response.json(category, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
