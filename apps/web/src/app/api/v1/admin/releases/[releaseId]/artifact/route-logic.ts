import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  AdminReleaseArtifactInputSchema,
  AdminReleaseIdParamsSchema,
} from "@/lib/admin/content-schemas";
import { registerAdminReleaseArtifact } from "@/lib/releases/admin-release-artifact-service";
import { requireReleasePublisherOrAdmin } from "@/lib/releases/release-publisher-auth";

export type AdminReleaseArtifactRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminReleaseArtifactRouteDependencies = {
  authenticateWrite(request: Request): Promise<AdminAccessUser>;
  enforceRateLimit(userId: string, action: "admin:release:artifact"): Promise<void>;
  parseBody: typeof parseJsonBody;
  register: typeof registerAdminReleaseArtifact;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminReleaseArtifactRouteDependencies = {
  authenticateWrite: (request) =>
    requireReleasePublisherOrAdmin(request, () => requireAdminCapability("release.write")),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  register: registerAdminReleaseArtifact,
  writeAuditLog: writeAdminAuditLog,
};

export async function adminReleaseArtifactRegisterRoute(
  request: Request,
  context: AdminReleaseArtifactRouteContext,
  dependencies: AdminReleaseArtifactRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite(request);
    await dependencies.enforceRateLimit(admin.id, "admin:release:artifact");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminReleaseArtifactInputSchema);
    const payload = await dependencies.register(releaseId, input);

    await dependencies.writeAuditLog({
      action: "admin.release.artifact.register",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: {
        kind: input.kind,
        platform: input.platform,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        versionCode: input.versionCode,
      },
      targetId: payload.artifact.id,
      targetType: "ReleaseArtifact",
    });

    return Response.json(payload, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      status: 201,
    });
  } catch (error) {
    return jsonError(error);
  }
}
