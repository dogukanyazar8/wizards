import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { AdminReleaseInputSchema } from "@/lib/admin/content-schemas";
import { createAdminRelease, listAdminReleases } from "@/lib/releases/admin-release-service";

type AdminReleaseCollectionRateLimitAction = "admin:release:list" | "admin:release:write";

export type AdminReleaseCollectionRouteDependencies = {
  authenticateRead(): Promise<AdminAccessUser>;
  authenticateWrite(): Promise<AdminAccessUser>;
  create: typeof createAdminRelease;
  enforceRateLimit(userId: string, action: AdminReleaseCollectionRateLimitAction): Promise<void>;
  list: typeof listAdminReleases;
  parseBody: typeof parseJsonBody;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminReleaseCollectionRouteDependencies = {
  authenticateRead: () => requireAdminCapability("release.read"),
  authenticateWrite: () => requireAdminCapability("release.write"),
  create: createAdminRelease,
  enforceRateLimit: enforceApiRateLimit,
  list: listAdminReleases,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminReleaseListRoute(
  _request: Request,
  dependencies: AdminReleaseCollectionRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:release:list");
    const payload = await dependencies.list();

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminReleaseCreateRoute(
  request: Request,
  dependencies: AdminReleaseCollectionRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:release:write");
    const input = await dependencies.parseBody(request, AdminReleaseInputSchema);
    const payload = await dependencies.create(input);

    await dependencies.writeAuditLog({
      action: "admin.release.create",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { channel: input.channel, version: input.version },
      targetId: payload.release.id,
      targetType: "Release",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
