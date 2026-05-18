import { ReorderCategoriesSchema } from "@wizards/types";
import { requireApiUserId } from "@/lib/auth/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { reorderWorkspaceCategories } from "@/lib/workspace/category-service";

type RouteContext = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireApiUserId();
    await enforceApiRateLimit(userId, "category:reorder");
    const { serverId } = await context.params;
    const input = await parseJsonBody(request, ReorderCategoriesSchema);
    await reorderWorkspaceCategories(userId, serverId, input.items);

    return Response.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
