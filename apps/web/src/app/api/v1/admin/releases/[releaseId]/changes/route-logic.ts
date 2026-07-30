import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { AdminReleaseChangesSchema, AdminReleaseIdParamsSchema } from "@/lib/admin/content-schemas";
import { replaceAdminReleaseChanges } from "@/lib/releases/admin-release-service";

export type AdminReleaseChangesRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminReleaseChangesRouteDependencies = {
  authenticateWrite(): Promise<AdminAccessUser>;
  enforceRateLimit(userId: string, action: "admin:release:write"): Promise<void>;
  parseBody: typeof parseJsonBody;
  replace: typeof replaceAdminReleaseChanges;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminReleaseChangesRouteDependencies = {
  authenticateWrite: () => requireAdminCapability("release.write"),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  replace: replaceAdminReleaseChanges,
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminReleaseChangesReplaceRoute(
  request: Request,
  context: AdminReleaseChangesRouteContext,
  dependencies: AdminReleaseChangesRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:release:write");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminReleaseChangesSchema);
    const payload = await dependencies.replace(releaseId, input.changes);

    await dependencies.writeAuditLog({
      action: "admin.release.changes.replace",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { count: input.changes.length },
      targetId: releaseId,
      targetType: "Release",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
