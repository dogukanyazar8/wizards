import type { NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminUser } from "@/lib/admin/access";
import { exportAdminActivityCsv } from "@/lib/admin/management";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    await enforceApiRateLimit(admin.id, "admin:report:export");

    const url = new URL(request.url);
    const csv = await exportAdminActivityCsv(url.searchParams.get("days"));

    return new Response(csv, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="whispr-admin-activity-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
