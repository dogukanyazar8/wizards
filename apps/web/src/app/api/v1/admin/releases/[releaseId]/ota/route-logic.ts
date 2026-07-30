import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  AdminOtaBundleEnabledSchema,
  AdminOtaBundleInputSchema,
  AdminReleaseIdParamsSchema,
} from "@/lib/admin/content-schemas";
import { registerAdminOtaBundle, setAdminOtaBundleEnabled } from "@/lib/releases/admin-ota-service";
import { requireReleasePublisherOrAdmin } from "@/lib/releases/release-publisher-auth";

export type AdminOtaRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminOtaRouteDependencies = {
  authenticateWrite(request: Request): Promise<AdminAccessUser>;
  enforceRateLimit(userId: string, action: "admin:release:write"): Promise<void>;
  parseBody: typeof parseJsonBody;
  register: typeof registerAdminOtaBundle;
  setEnabled: typeof setAdminOtaBundleEnabled;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminOtaRouteDependencies = {
  authenticateWrite: (request) =>
    requireReleasePublisherOrAdmin(request, () => requireAdminCapability("release.write")),
  enforceRateLimit: enforceApiRateLimit,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  register: registerAdminOtaBundle,
  setEnabled: setAdminOtaBundleEnabled,
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminOtaRegisterRoute(
  request: Request,
  context: AdminOtaRouteContext,
  dependencies: AdminOtaRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite(request);
    await dependencies.enforceRateLimit(admin.id, "admin:release:write");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminOtaBundleInputSchema);
    const payload = await dependencies.register(releaseId, input);

    await dependencies.writeAuditLog({
      action: "admin.release.ota.register",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: {
        bundleKey: input.bundleKey,
        channel: input.channel,
        platform: input.platform,
        rolloutPercentage: input.rolloutPercentage,
      },
      targetId: input.id,
      targetType: "OtaBundle",
    });

    return Response.json(payload, {
      headers: NO_STORE_HEADERS,
      status: 201,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminOtaEnabledRoute(
  request: Request,
  context: AdminOtaRouteContext,
  dependencies: AdminOtaRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateWrite(request);
    await dependencies.enforceRateLimit(admin.id, "admin:release:write");
    const { releaseId } = AdminReleaseIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminOtaBundleEnabledSchema);
    const payload = await dependencies.setEnabled(releaseId, input.bundleId, input.enabled);

    await dependencies.writeAuditLog({
      action: input.enabled ? "admin.release.ota.enable" : "admin.release.ota.disable",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { enabled: input.enabled },
      targetId: input.bundleId,
      targetType: "OtaBundle",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
