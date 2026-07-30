import { jsonError } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import type { AdminAccessUser } from "@/lib/admin/access";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { listAdminBugReports } from "@/lib/support/admin-support-service";

export type AdminSupportCollectionRouteDependencies = {
  authenticateRead(): Promise<AdminAccessUser>;
  enforceRateLimit(userId: string, action: "admin:support:list"): Promise<void>;
  list: typeof listAdminBugReports;
};

const defaultDependencies: AdminSupportCollectionRouteDependencies = {
  authenticateRead: () => requireAdminCapability("support.read"),
  enforceRateLimit: enforceApiRateLimit,
  list: listAdminBugReports,
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function adminSupportReportListRoute(
  _request: Request,
  dependencies: AdminSupportCollectionRouteDependencies = defaultDependencies,
) {
  try {
    const admin = await dependencies.authenticateRead();
    await dependencies.enforceRateLimit(admin.id, "admin:support:list");
    const payload = await dependencies.list();

    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
