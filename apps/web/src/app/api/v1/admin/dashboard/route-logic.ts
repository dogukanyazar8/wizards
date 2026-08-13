import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { type AdminAccessUser } from "@/lib/admin/access";
import type { AdminRole } from "@wizards/db";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { getAdminDashboardSnapshot, normalizeDashboardDays } from "@/lib/admin/dashboard";

export type AdminDashboardRouteDependencies = {
  authenticate: () => Promise<AdminAccessUser>;
  enforceApiRateLimit: typeof enforceApiRateLimit;
  getAdminDashboardSnapshot: (days: number, role: AdminRole) => Promise<unknown>;
  jsonError: typeof jsonError;
  normalizeDashboardDays: typeof normalizeDashboardDays;
};

const defaultAdminDashboardRouteDependencies: AdminDashboardRouteDependencies = {
  authenticate: () => requireAdminCapability("dashboard.read"),
  enforceApiRateLimit,
  getAdminDashboardSnapshot,
  jsonError,
  normalizeDashboardDays,
};

export async function getAdminDashboardRoute(
  request: Request,
  dependencies: AdminDashboardRouteDependencies = defaultAdminDashboardRouteDependencies,
) {
  try {
    const admin = await dependencies.authenticate();
    await dependencies.enforceApiRateLimit(admin.id, "admin:dashboard");

    const url = new URL(request.url);
    const days = dependencies.normalizeDashboardDays(url.searchParams.get("days"));
    const dashboard = await dependencies.getAdminDashboardSnapshot(days, admin.role);

    return Response.json({ dashboard });
  } catch (error) {
    return dependencies.jsonError(error);
  }
}
