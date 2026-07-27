import type { UserStatus } from "@wizards/db";
import type { NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { listAdminUsers, parseAdminBoolean } from "@/lib/admin/management";

const USER_STATUSES = new Set<UserStatus>(["ONLINE", "IDLE", "DND", "OFFLINE", "INVISIBLE"]);

function parseStatus(value: string | null) {
  if (!value || value === "ALL") {
    return "ALL";
  }

  return USER_STATUSES.has(value as UserStatus) ? (value as UserStatus) : "ALL";
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminCapability("user.read");
    await enforceApiRateLimit(admin.id, "admin:user:list");

    const url = new URL(request.url);
    const payload = await listAdminUsers({
      banned: parseAdminBoolean(url.searchParams.get("banned")),
      limit: url.searchParams.get("limit"),
      page: url.searchParams.get("page"),
      query: url.searchParams.get("query"),
      status: parseStatus(url.searchParams.get("status")),
      verified: parseAdminBoolean(url.searchParams.get("verified")),
    });

    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}
