import { jsonError, parseJsonBody } from "@/lib/api";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import {
  AdminBadgeGrantSchema,
  AdminBadgeRevokeSchema,
  grantUserBadge,
  listAdminUserBadges,
  revokeUserBadge,
} from "@/lib/badges/badge-admin-service";

/**
 * Reading a badge list is a support question; writing one is not. `badge.read`
 * lets SUPPORT and MODERATOR look, `badge.write` keeps the grant and the
 * revocation with OWNER and ADMIN (08 §1).
 */

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET(_request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("badge.read");
    await enforceApiRateLimit(admin.id, "admin:badge:read");
    const { userId } = await context.params;

    return Response.json(await listAdminUserBadges({ userId }), { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("badge.write");
    await enforceApiRateLimit(admin.id, "admin:badge:write");

    const input = await parseJsonBody(request, AdminBadgeGrantSchema);
    const { userId } = await context.params;
    const badge = await grantUserBadge({
      adminUserId: admin.id,
      headers: request.headers,
      input,
      userId,
    });

    return Response.json({ badge }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("badge.write");
    await enforceApiRateLimit(admin.id, "admin:badge:write");

    // A revocation carries a body because the reason is mandatory, and a reason
    // does not belong in a query string that lands in access logs.
    const input = await parseJsonBody(request, AdminBadgeRevokeSchema);
    const { userId } = await context.params;
    const result = await revokeUserBadge({
      adminUserId: admin.id,
      headers: request.headers,
      input,
      userId,
    });

    return Response.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
