import type { NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminUser } from "@/lib/admin/access";
import { getAdminDashboardSnapshot, normalizeDashboardDays } from "@/lib/admin/dashboard";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    await enforceApiRateLimit(admin.id, "admin:dashboard");

    const url = new URL(request.url);
    const days = normalizeDashboardDays(url.searchParams.get("days"));
    const dashboard = await getAdminDashboardSnapshot(days);

    return Response.json({ dashboard });
  } catch (error) {
    return jsonError(error);
  }
}
