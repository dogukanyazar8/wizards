import {
  MobileCategoryUpdateRequestSchema,
  MobileMutationSuccessResponseSchema,
  MobileServerCategoryParamsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { deleteWorkspaceCategory, updateWorkspaceCategory } from "@/lib/workspace/category-service";

type MobileServerCategoryRateLimitAction =
  "mobile:server:categories:delete" | "mobile:server:categories:update";

export type MobileServerCategoryRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerCategoryRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  deleteCategory: typeof deleteWorkspaceCategory;
  enforceRateLimit(userId: string, action: MobileServerCategoryRateLimitAction): Promise<void>;
  parseBody: typeof parseJsonBody;
  updateCategory: typeof updateWorkspaceCategory;
};

const defaultDependencies: MobileServerCategoryRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  deleteCategory: deleteWorkspaceCategory,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateCategory: updateWorkspaceCategory,
};

export async function mobileServerCategoryUpdateRoute(
  request: Request,
  context: MobileServerCategoryRouteContext,
  dependencies: MobileServerCategoryRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:categories:update");
    const { categoryId, serverId } = MobileServerCategoryParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileCategoryUpdateRequestSchema);
    const result = await dependencies.updateCategory(userId, serverId, categoryId, input);

    return Response.json(MobileMutationSuccessResponseSchema.parse(result));
  } catch (error) {
    return jsonError(error);
  }
}

export async function mobileServerCategoryDeleteRoute(
  request: Request,
  context: MobileServerCategoryRouteContext,
  dependencies: MobileServerCategoryRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:categories:delete");
    const { categoryId, serverId } = MobileServerCategoryParamsSchema.parse(await context.params);
    const result = await dependencies.deleteCategory(userId, serverId, categoryId);

    return Response.json(MobileMutationSuccessResponseSchema.parse(result));
  } catch (error) {
    return jsonError(error);
  }
}
