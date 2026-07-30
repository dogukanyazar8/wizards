import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { AdminReleaseIdParamsSchema } from "@/lib/admin/content-schemas";
import { publishAdminRelease } from "@/lib/releases/admin-release-service";

export type AdminReleasePublishRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminReleasePublishRouteDependencies = {
  authenticateWrite(): Promise<AdminAccessUser>;
  enforceRateLimit(userId: string, action: "admin:release:write"): Promise<void>;
  publish: typeof publishAdminRelease;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminReleasePublishRouteDependencies = {
  authenticateWrite: () => requireAdminCapability("release.write"),
  enforceRateLimit: enforceApiRateLimit,
  publish: publishAdminRelease,
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminReleasePublishRoute(
  request: Request,
  context: AdminReleasePublishRouteContext,
  dependencies: AdminReleasePublishRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:release:write");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const payload = await dependencies.publish(releaseId);

    await dependencies.writeAuditLog({
      action: "admin.release.publish",
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
