import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { jsonError, parseJsonBody } from "@/lib/api";
import { requireAdminCapability } from "@/lib/admin/capabilities";
import { setAdminUserBanState } from "@/lib/admin/management";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export const UpdateAdminUserSchema = z.object({
  isBanned: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdminCapability("user.ban");
    await enforceApiRateLimit(admin.id, "admin:user:update");

    const input = await parseJsonBody(request, UpdateAdminUserSchema);
    const { userId } = await context.params;
    const user = await setAdminUserBanState({
      adminUserId: admin.id,
      banned: input.isBanned,
      headers: request.headers,
      reason: input.reason,
      targetUserId: userId,
    });

    return Response.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
