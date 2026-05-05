import { UpdateCategorySchema } from "@wizards/types";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  deleteWorkspaceCategory,
  updateWorkspaceCategory,
} from "@/lib/workspace/service";

type RouteContext = {
  params: Promise<{
    categoryId: string;
    serverId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "category:update");
    const { categoryId, serverId } = await context.params;
    const input = await parseJsonBody(request, UpdateCategorySchema);
    const result = await updateWorkspaceCategory(userId, serverId, categoryId, input);

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "category:delete");
    const { categoryId, serverId } = await context.params;
    const result = await deleteWorkspaceCategory(userId, serverId, categoryId);

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
