import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { AdminDownloadArtifactInputSchema } from "@/lib/admin/content-schemas";
import {
  createAdminDownloadArtifact,
  listAdminDownloadArtifacts,
} from "@/lib/downloads/admin-download-service";

/**
 * SPEC-INDIRME §B kataloğunun yönetim ucu.
 *
 * Yetki `release.*` üzerinden: indirme paketi bir yayın malzemesidir ve ayrı bir
 * yetki icat etmek, aynı işi yapan iki rol listesi demekti.
 */

type AdminDownloadCollectionRateLimitAction = "admin:downloads:list" | "admin:downloads:write";

export type AdminDownloadCollectionRouteDependencies = {
  authenticateRead(): Promise<AdminAccessUser>;
  authenticateWrite(): Promise<AdminAccessUser>;
  create: typeof createAdminDownloadArtifact;
  enforceRateLimit(userId: string, action: AdminDownloadCollectionRateLimitAction): Promise<void>;
  list: typeof listAdminDownloadArtifacts;
  parseBody: typeof parseJsonBody;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminDownloadCollectionRouteDependencies = {
  authenticateRead: () => requireAdminCapability("release.read"),
  authenticateWrite: () => requireAdminCapability("release.write"),
  create: createAdminDownloadArtifact,
  enforceRateLimit: enforceApiRateLimit,
  list: listAdminDownloadArtifacts,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminDownloadListRoute(
  _request: Request,
  dependencies: AdminDownloadCollectionRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:downloads:list");

    return Response.json(await dependencies.list(), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminDownloadCreateRoute(
  request: Request,
  dependencies: AdminDownloadCollectionRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:downloads:write");
    const input = await dependencies.parseBody(request, AdminDownloadArtifactInputSchema);
    const payload = await dependencies.create(input);

    await dependencies.writeAuditLog({
      action: "admin.download.create",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { channel: input.channel, platform: input.platform },
      targetId: payload.artifact.id,
      targetType: "DownloadArtifact",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS, status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
