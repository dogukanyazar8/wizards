import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { writeAdminAuditLog, type AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  AdminBugReportIdParamsSchema,
  AdminBugReportStatusPatchSchema,
} from "@/lib/admin/content-schemas";
import { getAdminBugReport, updateAdminBugReportStatus } from "@/lib/support/admin-support-service";

type AdminSupportDetailRateLimitAction = "admin:support:read" | "admin:support:update";

export type AdminSupportDetailRouteContext = {
  params: Promise<Record<string, string>>;
};

export type AdminSupportDetailRouteDependencies = {
  authenticateRead(): Promise<AdminAccessUser>;
  enforceRateLimit(userId: string, action: AdminSupportDetailRateLimitAction): Promise<void>;
  get: typeof getAdminBugReport;
  parseBody: typeof parseJsonBody;
  updateStatus: typeof updateAdminBugReportStatus;
  writeAuditLog: typeof writeAdminAuditLog;
};

const defaultDependencies: AdminSupportDetailRouteDependencies = {
  authenticateRead: () => requireAdminCapability("support.read"),
  enforceRateLimit: enforceApiRateLimit,
  get: getAdminBugReport,
  parseBody: (request, schema) => parseJsonBody(request, schema),
  updateStatus: updateAdminBugReportStatus,
  writeAuditLog: writeAdminAuditLog,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminSupportReportDetailRoute(
  _request: Request,
  context: AdminSupportDetailRouteContext,
  dependencies: AdminSupportDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:support:read");
    const { reportId } = AdminBugReportIdParamsSchema.parse(await context.params);
    const payload = await dependencies.get(reportId);

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function adminSupportReportStatusRoute(
  request: Request,
  context: AdminSupportDetailRouteContext,
  dependencies: AdminSupportDetailRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:support:update");
    const { reportId } = AdminBugReportIdParamsSchema.parse(await context.params);
    const input = await dependencies.parseBody(request, AdminBugReportStatusPatchSchema);
    const payload = await dependencies.updateStatus(reportId, input.status);

    await dependencies.writeAuditLog({
      action: "admin.support.report.status",
      adminUserId: admin.id,
      headers: request.headers,
      metadata: { status: input.status },
      targetId: reportId,
      targetType: "BugReport",
    });

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
