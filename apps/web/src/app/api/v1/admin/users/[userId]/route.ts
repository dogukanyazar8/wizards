import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireAdminUser } from "@/lib/admin/access";
import { setAdminUserBanState } from "@/lib/admin/management";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

const UpdateAdminUserSchema = z.object({
  isBanned: z.boolean(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminUser({ roles: ["OWNER", "ADMIN", "MODERATOR"] });
    await enforceApiRateLimit(admin.id, "admin:user:update");

    const input = await parseJsonBody(request, UpdateAdminUserSchema);
    const { userId } = await context.params;
    const user = await setAdminUserBanState({
      adminUserId: admin.id,
      banned: input.isBanned,
      headers: request.headers,
      reason: input.reason ?? null,
      targetUserId: userId,
    });

    return Response.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
