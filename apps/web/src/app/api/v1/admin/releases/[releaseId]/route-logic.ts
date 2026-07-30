import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { AdminReleaseIdParamsSchema, AdminReleasePatchSchema } from "@/lib/admin/content-schemas";
import {
  deleteAdminRelease,
  getAdminRelease,
  updateAdminRelease,
} from "@/lib/releases/admin-release-service";

type AdminReleaseDetailRateLimitAction = "admin:release:read" | "admin:release:write";

export type AdminReleaseDetailRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminReleaseDetailRouteDependencies = {
  authenticateRead(): Promise<AdminAccessUser>;
  authenticateWrite(): Promise<AdminAccessUser>;
  delete: typeof deleteAdminRelease;
  enforceRateLimit(userId: string, action: AdminReleaseDetailRateLimitAction): Promise<void>;
  get: typeof getAdminRelease;
  parseBody: typeof parseJsonBody;
  update: typeof updateAdminRelease;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminReleaseDetailRouteDependencies = {
  authenticateRead: () => requireAdminCapability("release.read"),
  authenticateWrite: () => requireAdminCapability("release.write"),
  delete: deleteAdminRelease,
  enforceRateLimit: enforceApiRateLimit,
  get: getAdminRelease,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  update: updateAdminRelease,
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminReleaseDetailRoute(
  _request: Request,
  context: AdminReleaseDetailRouteContext,
  dependencies: AdminReleaseDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:release:read");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const payload = await dependencies.get(releaseId);

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminReleaseUpdateRoute(
  request: Request,
  context: AdminReleaseDetailRouteContext,
  dependencies: AdminReleaseDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:release:write");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminReleasePatchSchema);
    const payload = await dependencies.update(releaseId, input);

    await dependencies.writeAuditLog({
      action: "admin.release.update",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { fields: Object.keys(input) },
      targetId: releaseId,
      targetType: "Release",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminReleaseDeleteRoute(
  request: Request,
  context: AdminReleaseDetailRouteContext,
  dependencies: AdminReleaseDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:release:write");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const payload = await dependencies.delete(releaseId);

    await dependencies.writeAuditLog({
      action: "admin.release.delete",
      adminUserId: admin.id,
      headers: request.headers,
      targetId: releaseId,
      targetType: "Release",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
