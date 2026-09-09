import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  AdminDownloadArtifactIdParamsSchema,
  AdminDownloadArtifactPatchSchema,
} from "@/lib/admin/content-schemas";
import {
  deleteAdminDownloadArtifact,
  updateAdminDownloadArtifact,
} from "@/lib/downloads/admin-download-service";

/** SPEC-INDIRME §B — tek bir katalog satırının güncellenmesi ve silinmesi. */

export type AdminDownloadDetailRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminDownloadDetailRouteDependencies = {
  authenticateWrite(): Promise<AdminAccessUser>;
  enforceRateLimit(userId: string, action: "admin:downloads:write"): Promise<void>;
  parseBody: typeof parseJsonBody;
  remove: typeof deleteAdminDownloadArtifact;
  update: typeof updateAdminDownloadArtifact;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminDownloadDetailRouteDependencies = {
  authenticateWrite: () => requireAdminCapability("release.write"),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  remove: deleteAdminDownloadArtifact,
  update: updateAdminDownloadArtifact,
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminDownloadUpdateRoute(
  request: Request,
  context: AdminDownloadDetailRouteContext,
  dependencies: AdminDownloadDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:downloads:write");
    const { artifactId } = AdminDownloadArtifactIdParamsSchema.parse(await context.params);
    const patch = await dependencies.parseBody(request, AdminDownloadArtifactPatchSchema);
    const payload = await dependencies.update(artifactId, patch);

    await dependencies.writeAuditLog({
      // Yayınlama ayrı bir eylem olarak kaydedilir: bir paketin ne zaman
      // görünür olduğu, ne zaman düzenlendiğinden farklı bir sorudur.
      action: patch.published === undefined ? "admin.download.update" : "admin.download.publish",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { published: payload.artifact.publishedAt !== null },
      targetId: artifactId,
      targetType: "DownloadArtifact",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminDownloadDeleteRoute(
  request: Request,
  context: AdminDownloadDetailRouteContext,
  dependencies: AdminDownloadDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite();
    await dependencies.enforceRateLimit(admin.id, "admin:downloads:write");
    const { artifactId } = AdminDownloadArtifactIdParamsSchema.parse(await context.params);
    const payload = await dependencies.remove(artifactId);

    await dependencies.writeAuditLog({
      action: "admin.download.delete",
      adminUserId: admin.id,
      headers: request.headers,
      targetId: artifactId,
      targetType: "DownloadArtifact",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
