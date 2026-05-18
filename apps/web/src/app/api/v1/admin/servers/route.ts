import type { NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminUser } from "@/lib/admin/access";
import { listAdminServers } from "@/lib/admin/management";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminUser();
    await enforceApiRateLimit(admin.id, "admin:server:list");

    const url = new URL(request.url);
    const payload = await listAdminServers({
      limit: url.searchParams.get("limit"),
      page: url.searchParams.get("page"),
      query: url.searchParams.get("query"),
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
