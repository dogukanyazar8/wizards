import {
  MobileCategoryCreateRequestSchema,
  MobileCategoryCreateResponseSchema,
  MobileServerIdParamsSchema,
} from "@wizards/types";

import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireMobileApiUserId } from "@/lib/auth/api";
import { createWorkspaceCategory } from "@/lib/workspace/category-service";

type MobileServerCategoryCreateRateLimitAction = "mobile:server:categories:create";

export type MobileServerCategoriesRouteContext = {
  params: Promise<Record<string, string>>;
};

export type MobileServerCategoriesRouteDependencies = {
  authenticate(request: Request): Promise<string>;
  createCategory: typeof createWorkspaceCategory;
  enforceRateLimit(
    userId: string,
    action: MobileServerCategoryCreateRateLimitAction,
  ): Promise<void>;
  parseBody: typeof parseJsonBody;
};

const defaultDependencies: MobileServerCategoriesRouteDependencies = {
  authenticate: (request) => requireMobileApiUserId(request),
  createCategory: createWorkspaceCategory,
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
};

export async function mobileServerCategoryCreateRoute(
  request: Request,
  context: MobileServerCategoriesRouteContext,
  dependencies: MobileServerCategoriesRouteDependencies = defaultDependencies,
) {
  try {
    const userId = await dependencies.authenticate(request);
    await dependencies.enforceRateLimit(userId, "mobile:server:categories:create");
    const { serverId } = MobileServerIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, MobileCategoryCreateRequestSchema);
    const category = await dependencies.createCategory(userId, serverId, input);

    return Response.json(
      MobileCategoryCreateResponseSchema.parse({ category: { id: category.id } }),
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
