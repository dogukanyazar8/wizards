import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  AdminHelpArticleIdParamsSchema,
  AdminHelpArticlePatchSchema,
} from "@/lib/admin/content-schemas";
import {
  deleteAdminHelpArticle,
  getAdminHelpArticle,
  updateAdminHelpArticle,
} from "@/lib/help/admin-help-service";

type AdminHelpDetailRateLimitAction = "admin:help:read" | "admin:help:write";

export type AdminHelpDetailRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminHelpDetailRouteDependencies = {
  authenticateWrite(): Promise<AdminAccessUser>;
  delete: typeof deleteAdminHelpArticle;
  enforceRateLimit(userId: string, action: AdminHelpDetailRateLimitAction): Promise<void>;
  get: typeof getAdminHelpArticle;
  parseBody: typeof parseJsonBody;
  update: typeof updateAdminHelpArticle;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminHelpDetailRouteDependencies = {
  authenticateWrite: () => requireAdminCapability("help.write"),
  delete: deleteAdminHelpArticle,
  enforceRateLimit: enforceApiRateLimit,
  get: getAdminHelpArticle,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  update: updateAdminHelpArticle,
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminHelpArticleDetailRoute(
  _request: Request,
  context: AdminHelpDetailRouteContext,
  dependencies: AdminHelpDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:help:read");
    const { articleId } = AdminHelpArticleIdParamsSchema.parse(await context.params);
    const payload = await dependencies.get(articleId);

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminHelpArticleUpdateRoute(
  request: Request,
  context: AdminHelpDetailRouteContext,
  dependencies: AdminHelpDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:help:write");
    const { articleId } = AdminHelpArticleIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminHelpArticlePatchSchema);
    const payload = await dependencies.update(articleId, input);

    await dependencies.writeAuditLog({
      action: "admin.help.article.update",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { fields: Object.keys(input) },
      targetId: articleId,
      targetType: "HelpArticle",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminHelpArticleDeleteRoute(
  request: Request,
  context: AdminHelpDetailRouteContext,
  dependencies: AdminHelpDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:help:write");
    const { articleId } = AdminHelpArticleIdParamsSchema.parse(await context.params);
    const payload = await dependencies.delete(articleId);

    await dependencies.writeAuditLog({
      action: "admin.help.article.delete",
      adminUserId: admin.id,
      headers: request.headers,
      targetId: articleId,
      targetType: "HelpArticle",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
