import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { AdminHelpArticleInputSchema } from "@/lib/admin/content-schemas";
import { createAdminHelpArticle, listAdminHelpArticles } from "@/lib/help/admin-help-service";

type AdminHelpCollectionRateLimitAction = "admin:help:list" | "admin:help:write";

export type AdminHelpCollectionRouteDependencies = {
  authenticateWrite(): Promise<AdminAccessUser>;
  create: typeof createAdminHelpArticle;
  enforceRateLimit(userId: string, action: AdminHelpCollectionRateLimitAction): Promise<void>;
  list: typeof listAdminHelpArticles;
  parseBody: typeof parseJsonBody;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminHelpCollectionRouteDependencies = {
  authenticateWrite: () => requireAdminCapability("help.write"),
  create: createAdminHelpArticle,
  enforceRateLimit: enforceApiRateLimit,
  list: listAdminHelpArticles,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminHelpArticleListRoute(
  _request: Request,
  dependencies: AdminHelpCollectionRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:help:list");
    const payload = await dependencies.list();

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminHelpArticleCreateRoute(
  request: Request,
  dependencies: AdminHelpCollectionRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:help:write");
    const input = await dependencies.parseBody(request, AdminHelpArticleInputSchema);
    const payload = await dependencies.create(input);

    await dependencies.writeAuditLog({
      action: "admin.help.article.create",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: {
        category: input.category,
        published: input.published,
        slug: input.slug,
      },
      targetId: payload.article.id,
      targetType: "HelpArticle",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
